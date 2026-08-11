import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { PreviewRequest, PreviewDialogService } from '../../services/preview-dialog.service';
import { InvoicePreviewComponent } from '../invoice-preview/invoice-preview.component';
import { LedgerPreviewComponent } from '../ledger-preview/ledger-preview.component';
import { ReportPreviewComponent } from '../report-preview/report-preview.component';

// Marks the app's own document while a preview is open, so the print rules in src/styles.css
// can drop the ERP shell (sidebar, header, whatever list screen is underneath) from a printout
// and leave only the report. Without that, printing from the dialog would put the sidebar on
// page one - the previews used to be their own browser tab, where there was no shell to hide.
const BODY_CLASS = 'preview-dialog-open';

// Hosts whichever report preview was asked for, as a dialog over the current screen instead of
// in a new browser tab (Vignesh, Slack "Task set of 10-08-2026": "Open preview in same tab
// using modal or dialog").
//
// Deliberately hosts the preview *components* rather than an iframe pointing at their routes.
// An iframe would have been less work - nothing to change in the previews at all - but it would
// have nested a second browsing context inside the one the previews already use for the layout
// itself, and printing is what makes that a bad trade: a print from a doubly-nested frame is at
// the mercy of how each browser decides which frame to print. Hosting the components keeps
// printing exactly what it already was - one window.print() on the app's own document, with the
// same @media print rules the previews already carry - and keeps the A4/A5 switch, the Excel
// export and the PDF download working with no second copy of any of it.
@Component({
  selector: 'app-preview-dialog',
  standalone: true,
  imports: [InvoicePreviewComponent, LedgerPreviewComponent, ReportPreviewComponent],
  templateUrl: './preview-dialog.component.html',
  styleUrls: ['./preview-dialog.component.css'],
  host: { '(document:keydown.escape)': 'close()' }
})
export class PreviewDialogComponent implements OnInit, OnDestroy {
  @Input({ required: true }) request!: PreviewRequest;

  private previousBodyOverflow = '';

  constructor(private previewDialog: PreviewDialogService) {}

  // The dialog owns locking the page behind it for as long as it is open, which is why the
  // previews skip their own copy of this when embedded (see their lockPageScrolling): the
  // report scrolls inside the dialog, and the list screen underneath must not scroll with it.
  ngOnInit(): void {
    this.previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add(BODY_CLASS);
  }

  ngOnDestroy(): void {
    document.body.style.overflow = this.previousBodyOverflow;
    document.body.classList.remove(BODY_CLASS);
  }

  close(): void {
    this.previewDialog.close();
  }
}
