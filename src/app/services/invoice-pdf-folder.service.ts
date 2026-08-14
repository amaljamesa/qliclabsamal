import { Injectable } from '@angular/core';
import { kvGet, kvSet } from './kv-store.util';

// Puts a saved invoice's PDF in Documents -> Invoice Folder -> PDFs.
//
// The blunt fact this service is built around: a web page cannot write to a path. Nothing in
// the browser can be told "put this in Documents" - `a.download` names a file but never a
// folder, and any separator in that name is stripped, so the plain download route can only
// ever reach whatever the browser's own Downloads directory happens to be.
//
// The one route that does reach a real folder is the File System Access API, and it costs a
// user gesture: the user picks a directory once, from a native dialog, and the app gets a
// handle to it. So the closest honest reading of "save to Documents -> Invoice Folder -> PDFs"
// is what happens here - the user is asked once to point at Documents (the picker opens there
// via startIn), and both subfolders are created inside whatever they picked, after which every
// save writes there silently. The handle is kept in IndexedDB, so the ask does not come back
// on the next visit; Chromium still re-confirms permission after a full browser restart, which
// is the browser's call and not something the page can waive.
//
// Firefox and Safari have no such API at all. There the file falls back to a normal download,
// still named for the invoice, and the user's browser decides where it lands - the alternative
// being no PDF at all on those browsers.

const HANDLE_KEY = 'invoice-pdf-folder';
// Created inside whatever the user picked, in this order. Kept as data rather than spelled out
// at the write, so the nesting is stated once.
const SUBFOLDERS = ['Invoice Folder', 'PDFs'];

type PermissionMode = { mode: 'read' | 'readwrite' };
type PermissionResult = 'granted' | 'denied' | 'prompt';

// The File System Access API is not in TypeScript's DOM library (the permission methods are
// not in any lib at all), and pulling in @types/wicg-file-system-access for four calls would
// add a dependency to describe a feature two of the three engines do not have. These describe
// exactly the surface used below and nothing more.
interface WritableLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

interface FileHandleLike {
  createWritable(): Promise<WritableLike>;
}

interface DirectoryHandleLike {
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
  queryPermission?(descriptor: PermissionMode): Promise<PermissionResult>;
  requestPermission?(descriptor: PermissionMode): Promise<PermissionResult>;
}

type DirectoryPicker = (options?: {
  id?: string;
  mode?: 'read' | 'readwrite';
  startIn?: string;
}) => Promise<DirectoryHandleLike>;

/** Where a saved PDF actually ended up, so the caller can tell the user the truth. */
export type PdfSaveTarget = 'folder' | 'download' | 'failed';

export interface PdfSaveResult {
  target: PdfSaveTarget;
  /** The folder chain the file was written to, for the confirmation line. */
  path?: string;
  filename: string;
}

@Injectable({ providedIn: 'root' })
export class InvoicePdfFolderService {
  private folder: DirectoryHandleLike | null = null;
  // The user cancelled the picker. Asking again on every subsequent save would be nagging, so
  // this session downloads instead and the next reload offers the choice again.
  private declined = false;

  get supported(): boolean {
    return typeof (window as unknown as Record<string, unknown>)['showDirectoryPicker'] === 'function';
  }

  /**
   * Makes sure there is a writable folder to save into, asking for one if this is the first
   * time. Returns false when the file will have to fall back to a plain download.
   *
   * MUST be called straight out of the click that starts the save: both the picker and a
   * permission re-prompt need transient user activation, which does not survive the seconds
   * the API call and the PDF rendering take. The IndexedDB read below is the only await in
   * front of them and takes a millisecond or two, comfortably inside the activation window.
   */
  async ensureFolder(): Promise<boolean> {
    if (!this.supported || this.declined) {
      return false;
    }
    if (this.folder && (await this.permitted(this.folder))) {
      return true;
    }

    const remembered = await kvGet<DirectoryHandleLike>(HANDLE_KEY);
    if (remembered && (await this.permitted(remembered))) {
      this.folder = remembered;
      return true;
    }

    return this.pick();
  }

  /**
   * Writes the PDF, into the chosen folder if there is one and into the browser's downloads if
   * there is not. Never throws: a save that cannot place the file still has to let the invoice
   * itself count as saved.
   */
  async save(filename: string, blob: Blob): Promise<PdfSaveResult> {
    const safeName = sanitiseFilename(filename);

    if (this.folder) {
      try {
        const remaining = missingSubfolders(this.folder.name);
        let directory = this.folder;
        for (const name of remaining) {
          directory = await directory.getDirectoryHandle(name, { create: true });
        }
        const file = await directory.getFileHandle(safeName, { create: true });
        const writable = await file.createWritable();
        await writable.write(blob);
        await writable.close();
        return {
          target: 'folder',
          path: [this.folder.name, ...remaining].join(' / '),
          filename: safeName
        };
      } catch (error) {
        // A folder that has been moved, deleted or had its permission revoked since it was
        // picked. Downloading is a worse answer than writing to it, and a far better one than
        // losing the file.
        console.error('Could not write the invoice PDF to the chosen folder:', error);
      }
    }

    return this.download(safeName, blob);
  }

  /** Forgets the chosen folder, so the next save asks for a new one. */
  async forgetFolder(): Promise<void> {
    this.folder = null;
    this.declined = false;
    await kvSet(HANDLE_KEY, null);
  }

  private async pick(): Promise<boolean> {
    const showDirectoryPicker = (window as unknown as Record<string, unknown>)[
      'showDirectoryPicker'
    ] as DirectoryPicker | undefined;
    if (!showDirectoryPicker) {
      return false;
    }

    try {
      // startIn opens the dialog at Documents, which is where the task asks the folder to live;
      // the user can still navigate elsewhere, and the id keeps the browser returning to the
      // same place next time it does get asked.
      const handle = await showDirectoryPicker({
        id: 'invoice-pdfs',
        mode: 'readwrite',
        startIn: 'documents'
      });
      this.folder = handle;
      // Directory handles are structured-cloneable, which is what makes remembering one across
      // sessions possible at all - it is a real handle in IndexedDB, not a path string.
      await kvSet(HANDLE_KEY, handle);
      return true;
    } catch {
      // AbortError - the user closed the picker without choosing. Not an error worth logging:
      // declining to nominate a folder is a legitimate answer, and the file still downloads.
      this.declined = true;
      return false;
    }
  }

  private async permitted(handle: DirectoryHandleLike): Promise<boolean> {
    try {
      const current = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'prompt';
      if (current === 'granted') {
        return true;
      }
      if (current === 'denied') {
        return false;
      }
      // 'prompt' is the usual state at the start of a new browser session, even for a folder
      // that was granted before - Chromium deliberately does not carry write permission across
      // a restart. Asking here turns that into one click rather than a re-pick of the folder.
      const asked = (await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'denied';
      return asked === 'granted';
    } catch {
      return false;
    }
  }

  private download(filename: string, blob: Blob): PdfSaveResult {
    try {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      // Revoked on a later turn of the event loop: revoking it synchronously can beat the
      // browser to reading the URL the click just queued.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return { target: 'download', filename };
    } catch (error) {
      console.error('Could not download the invoice PDF:', error);
      return { target: 'failed', filename };
    }
  }
}

// Which of the subfolders still have to be created inside the folder the user picked.
//
// Picking Documents is not always on offer: Chrome refuses to hand over several well-known
// directories - "can't open this folder because it contains system files" - and on a good many
// Windows setups Documents is one of them, especially when OneDrive is backing it. The way
// round that is for the user to pick Documents\Invoice Folder themselves. Creating the whole
// chain regardless would then bury the files in Invoice Folder\Invoice Folder\PDFs, so any
// leading segment the pick already satisfies is dropped. Documents, Invoice Folder and PDFs
// therefore all end up writing to the same place, which is the one the task asked for.
function missingSubfolders(pickedName: string): string[] {
  const index = SUBFOLDERS.findIndex(name => name.toLowerCase() === pickedName.toLowerCase());
  return index === -1 ? [...SUBFOLDERS] : SUBFOLDERS.slice(index + 1);
}

// Invoice numbers (S-26-00143) are already safe; this guards the general case, since the name
// reaches a real filesystem where a stray separator or colon would fail the write outright.
function sanitiseFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}
