import { Injectable, signal } from '@angular/core';

// Which preview a dialog request is for. Each one maps to the preview component that already
// knows how to render it - the dialog only decides which of the three to host (see
// PreviewDialogComponent), so adding a preview does not mean adding a dialog.
export type PreviewKind = 'invoice' | 'ledger' | 'report';

export interface PreviewRequest {
  kind: PreviewKind;
  /** Shown in the dialog's title bar, so the user can see what they opened. */
  title: string;
  /** Only for kind 'report': which layout the shared report wrapper embeds. */
  reportId?: string;
}

// Holds the one preview currently open as a dialog. Previews used to open in a new browser tab
// (window.open), which Vignesh asked to replace with an in-page dialog (Slack "Task set of
// 10-08-2026": "Open preview in same tab using modal or dialog").
//
// The state lives in a service rather than in whichever screen triggered it because previews
// are opened from several unrelated places (the invoice list's row actions and Bulk Print, the
// ledger, the report cards) and all of them route through a service already - so they set this
// exactly where they used to call window.open, and no list component has to grow dialog markup
// of its own. AppComponent renders the single dialog host from this signal.
@Injectable({ providedIn: 'root' })
export class PreviewDialogService {
  private readonly current = signal<PreviewRequest | null>(null);

  readonly request = this.current.asReadonly();

  open(request: PreviewRequest): void {
    this.current.set(request);
  }

  close(): void {
    this.current.set(null);
  }
}
