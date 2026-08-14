import { Injectable } from '@angular/core';
import { Invoice } from './data.service';
import {
  INVOICE_LAYOUTS,
  INVOICE_STORAGE_KEY,
  InvoicePrintService
} from './invoice-print.service';
import { InvoicePdfFolderService, PdfSaveResult } from './invoice-pdf-folder.service';
import { getPreviewPayload, setPreviewPayload } from './preview-payload';
import { PreviewPdfService } from './preview-pdf.service';

// Produces the invoice PDF at save time, with nothing shown on screen.
//
// The PDF has to come from the print layout: those files (public/print/invoice/view/) own the
// design, the pagination and the paper size, and drawing a second invoice by hand in jsPDF
// would mean a saved PDF that slowly stops matching the one Preview and Print produce. But the
// layouts are standalone HTML documents that render themselves - they only exist once a
// browser has loaded and run them, which means a frame.
//
// So the frame stays, and what goes is the *preview*: this one is parked off-screen, never
// added to any dialog, and removed the moment the file exists. The user sees the invoice save
// and a PDF appear; they never see the layout, and no preview screen opens. That is the
// difference between this and calling the existing preview route and exporting from it.
//
// Sized rather than hidden, deliberately - display:none or a zero-size frame gives the layout
// no viewport to lay itself out in, and html2canvas would rasterise nothing. Off-screen keeps
// it fully rendered and completely invisible.
const FRAME_WIDTH_PX = 1000;
const FRAME_HEIGHT_PX = 1400;
// A layout that never fires load (a missing file, a redirect) must not hang the save.
const LOAD_TIMEOUT_MS = 15000;
// The layouts paginate themselves after load, building .page elements as they go. Rasterising
// halfway through that would capture a partial document, so the count has to stop changing
// first - see PreviewPdfService for the same problem hit from the other side.
const PAGES_TIMEOUT_MS = 15000;
const PAGES_POLL_MS = 100;
// Two consecutive identical polls. One is not enough: the count is briefly stable between two
// pages being appended, and 200ms of quiet is the layouts' own debounce settling.
const STABLE_POLLS = 2;

@Injectable({ providedIn: 'root' })
export class InvoicePdfAutoSaveService {
  constructor(
    private invoicePrintService: InvoicePrintService,
    private previewPdfService: PreviewPdfService,
    private folder: InvoicePdfFolderService
  ) {}

  /**
   * Secures somewhere to write before the save begins. Call this from the click itself - see
   * InvoicePdfFolderService.ensureFolder for why it cannot wait until the file is ready.
   */
  prepareFolder(): Promise<boolean> {
    return this.folder.ensureFolder();
  }

  /**
   * Renders `invoice` through its print layout off-screen and saves the result as
   * `<invoice number>.pdf`. Resolves null if no file could be produced - the invoice itself is
   * already saved by this point, so a failure here is reported, never thrown.
   */
  async saveInvoicePdf(invoice: Invoice): Promise<PdfSaveResult | null> {
    const frame = this.createOffscreenFrame();
    // Every invoice layout reads its data from this one key, so handing it over means writing
    // there - the same handoff openInvoicePreview does. Whatever a preview elsewhere in the
    // app had is put back afterwards, so a save cannot change what an open preview is holding.
    const previous = getPreviewPayload(INVOICE_STORAGE_KEY);

    try {
      setPreviewPayload(INVOICE_STORAGE_KEY, this.invoicePrintService.buildInvoiceData(invoice));
      document.body.appendChild(frame);

      if (!(await this.load(frame, INVOICE_LAYOUTS[0].src))) {
        console.error('The invoice layout did not load - no PDF was saved.');
        return null;
      }

      const doc = frame.contentDocument;
      if (!doc || !(await this.waitForPages(doc))) {
        console.error('The invoice layout rendered no pages - no PDF was saved.');
        return null;
      }

      const blob = await this.previewPdfService.render(doc);
      if (!blob) {
        return null;
      }

      return await this.folder.save(`${invoice.invoiceNo}.pdf`, blob);
    } catch (error) {
      console.error('Could not save a PDF of this invoice:', error);
      return null;
    } finally {
      frame.remove();
      if (previous) {
        setPreviewPayload(INVOICE_STORAGE_KEY, previous);
      }
    }
  }

  private createOffscreenFrame(): HTMLIFrameElement {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = [
      'position:fixed',
      'left:-20000px',
      'top:0',
      `width:${FRAME_WIDTH_PX}px`,
      `height:${FRAME_HEIGHT_PX}px`,
      'border:0',
      'opacity:0',
      'pointer-events:none'
    ].join(';');
    return frame;
  }

  private load(frame: HTMLIFrameElement, src: string): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      const done = (loaded: boolean) => {
        clearTimeout(timer);
        frame.removeEventListener('load', onLoad);
        resolve(loaded);
      };
      const onLoad = () => done(true);
      const timer = setTimeout(() => done(false), LOAD_TIMEOUT_MS);

      frame.addEventListener('load', onLoad);
      frame.src = src;
    });
  }

  // Resolves once the page count has held steady, or false if the layout never produced one.
  private async waitForPages(doc: Document): Promise<boolean> {
    const deadline = Date.now() + PAGES_TIMEOUT_MS;
    let previous = -1;
    let stable = 0;

    while (Date.now() < deadline) {
      const count = doc.querySelectorAll('.page').length;
      if (count > 0 && count === previous) {
        if (++stable >= STABLE_POLLS) {
          return true;
        }
      } else {
        stable = 0;
      }
      previous = count;
      await new Promise(resolve => setTimeout(resolve, PAGES_POLL_MS));
    }

    return doc.querySelectorAll('.page').length > 0;
  }
}
