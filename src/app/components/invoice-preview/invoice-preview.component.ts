import { AfterViewInit, Component, ElementRef, Input, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  INVOICE_LAYOUTS,
  INVOICE_STORAGE_KEY,
  InvoicePrintService,
  invoiceFileBaseName,
  PaperSize,
  readStoredInvoices
} from '../../services/invoice-print.service';
import { adoptPayloadFromFrame } from '../../services/preview-payload';
import { InvoiceExcelService } from '../../services/invoice-excel.service';
import { PreviewPdfService } from '../../services/preview-pdf.service';
import {
  getNaturalContentSizePx,
  getPageDimensionsCm,
  matchPaperSize,
  setPrintPageSize
} from '../../services/preview-page.util';

const RESIZE_DEBOUNCE_MS = 200;

// Embeds the invoice print layout (a static file at /print/invoice/view/invoice.html - see
// public/print/invoice/view/) inside an iframe and scales that iframe to fit the screen -
// like how a PDF viewer auto-fits a document to a phone screen. This is a pure visual scale
// (CSS transform) applied from the outside; the report itself renders at its normal, natural
// size inside the iframe and is never touched, so its data/pagination is completely
// unaffected by this component. Mirrors LedgerPreviewComponent, with one structural
// difference: the ledger report is always A4, but an invoice can be A4 or A5 depending on
// the data passed in, so the print-time page size can't be hardcoded - it's read from the
// actual rendered .page element instead (see preview-page.util).
//
// Hosted two ways: as the /print/invoice-preview page in its own right, and (the usual route
// now) inside PreviewDialogComponent, which sets `embedded`. The only differences in embedded
// mode are that this fills its container instead of pinning itself to the viewport, and that
// the dialog - not this component - owns locking the page behind it against scrolling.
@Component({
  selector: 'app-invoice-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './invoice-preview.component.html',
  styleUrls: ['./invoice-preview.component.css'],
  host: { '[class.embedded]': 'embedded' }
})
export class InvoicePreviewComponent implements AfterViewInit, OnDestroy {
  @ViewChild('frameWrapper', { static: true }) frameWrapper!: ElementRef<HTMLDivElement>;
  @ViewChild('invoiceFrame', { static: true }) invoiceFrame!: ElementRef<HTMLIFrameElement>;

  /** Set by PreviewDialogComponent when this preview is shown inside the dialog. */
  @Input() embedded = false;

  // Which HTML design renders the invoice. Every layout reads the same payload from the same
  // storage key, so switching is only a matter of pointing the frame at a different file -
  // the data, the paper size and the print handling below are all unaffected.
  readonly layouts = INVOICE_LAYOUTS;
  activeLayoutId = INVOICE_LAYOUTS[0].id;

  readonly paperSizes: PaperSize[] = ['a4', 'a5'];
  // Not a stored preference: read back from the size the report actually rendered at (see
  // fitFrame), so the highlighted button always reflects what is on screen.
  activeSize: PaperSize | '' = '';

  // Drives the PDF button's label and disabled state. Rasterising a multi-page report takes a
  // noticeable moment, and without this the button would look like it had done nothing.
  isBuildingPdf = false;

  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  private previousBodyOverflowX = '';
  private previousBodyOverflowY = '';
  private previousHtmlOverflowY = '';
  // Browser zoom (Ctrl +/-) scales the *entire* tab uniformly, including everything inside
  // the iframe - so the outer viewport width and the report's measured natural width both
  // move by the same factor when the user zooms, and that factor cancels out of the
  // fit-to-width ratio in fitFrame() below. Without this baseline, zooming in/out alone
  // (with no actual window resize) wouldn't change the on-screen size at all. Captured once
  // at load as this display's "no zoom applied yet" reference point, since devicePixelRatio
  // also reflects real monitor DPI, not just zoom - only *changes* from this baseline matter.
  private readonly baselinePixelRatio = window.devicePixelRatio;

  constructor(
    private host: ElementRef<HTMLElement>,
    private invoicePrintService: InvoicePrintService,
    private invoiceExcelService: InvoiceExcelService,
    private previewPdfService: PreviewPdfService
  ) {}

  private readonly onResize = (): void => {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => this.fitFrame(), RESIZE_DEBOUNCE_MS);
  };

  private readonly onIframeLoad = (): void => {
    // A short delay so the report (which generates its own content on load) has finished
    // rendering before the first fit measures it.
    setTimeout(() => {
      // Covers a reload of this page: the app's own copy of the payload is gone, but the frame
      // has just restored one from IndexedDB. Taking it back keeps the two exports that read
      // the payload rather than the rendered DOM - Excel, and the PDF's filename - working
      // across an F5, which they did for free while the payload lived in sessionStorage.
      adoptPayloadFromFrame(INVOICE_STORAGE_KEY, this.invoiceFrame.nativeElement);
      this.fitFrame();
      // Revealed only once it has been measured and scaled - see loadLayout().
      this.invoiceFrame.nativeElement.style.opacity = '1';
    }, 50);
  };

  // Swapping the frame's source blanks it while the new document loads, then shows it at full
  // size for a frame or two before fitFrame() scales it down - a white flash followed by a
  // jump, every time the design or paper size changes. Hiding it until the load handler above
  // has fitted it turns that into a brief dim against the page background instead. The
  // wrapper keeps its previous size meanwhile, so nothing below it moves either.
  private loadLayout(src: string): void {
    const iframe = this.invoiceFrame.nativeElement;
    iframe.style.opacity = '0';
    iframe.src = src;
  }

  // Expanding the iframe to its true natural size beforehand (no transform, no clipping)
  // makes the entire report part of the wrapper page's actual layout, so printing the wrapper
  // prints all of it rather than just the first screenful (the iframe is otherwise kept at a
  // fixed 900x1400px box on screen and only visually scaled with a CSS transform - see the
  // CSS comment on .invoice-frame).
  private readonly onBeforePrint = (): void => {
    const iframe = this.invoiceFrame.nativeElement;
    const doc = iframe.contentDocument;
    if (!doc) {
      return;
    }
    const dimensions = getPageDimensionsCm(doc);
    const size = getNaturalContentSizePx(doc);
    if (!dimensions || !size) {
      return;
    }
    setPrintPageSize(dimensions);
    iframe.style.transform = 'none';
    iframe.style.width = `${size.width}px`;
    iframe.style.height = `${size.height}px`;
  };

  private readonly onAfterPrint = (): void => {
    const iframe = this.invoiceFrame.nativeElement;
    iframe.style.width = '';
    iframe.style.height = '';
    this.fitFrame();
  };

  print(): void {
    window.print();
  }

  // Saves the invoice as a PDF file directly, with no print dialog to drive - see
  // PreviewPdfService for why that is a separate route from Print rather than the same one.
  async downloadPdf(): Promise<void> {
    const doc = this.invoiceFrame.nativeElement.contentDocument;
    if (!doc || this.isBuildingPdf) {
      return;
    }
    this.isBuildingPdf = true;
    try {
      await this.previewPdfService.download(doc, `${invoiceFileBaseName(readStoredInvoices() ?? [])}.pdf`);
    } catch (error) {
      console.error('Could not build a PDF of this invoice:', error);
    } finally {
      this.isBuildingPdf = false;
    }
  }

  // Downloads the invoice as a spreadsheet. Built from the stored payload rather than from
  // the design on screen (see InvoiceExcelService for why), so it is deliberately independent
  // of activeLayoutId - every design exports the same workbook.
  exportExcel(): void {
    this.invoiceExcelService.exportStoredInvoice();
  }

  setLayout(layoutId: string): void {
    const layout = this.layouts.find((candidate) => candidate.id === layoutId);
    if (!layout || layoutId === this.activeLayoutId) {
      return;
    }
    this.activeLayoutId = layoutId;
    // The reload fires the existing load handler, which re-fits and re-reads the paper size -
    // a design can legitimately paginate the same invoice into a different number of pages.
    this.loadLayout(layout.src);
  }

  setPaperSize(size: PaperSize): void {
    if (size === this.activeSize) {
      return;
    }
    if (!this.invoicePrintService.setStoredPaperSize(size)) {
      return;
    }
    const layout = this.layouts.find((candidate) => candidate.id === this.activeLayoutId);
    this.loadLayout(layout ? layout.src : this.layouts[0].src);
  }

  ngAfterViewInit(): void {
    // Set here rather than in the template so the frame's source and activeLayoutId can never
    // disagree about which design is on screen.
    this.loadLayout(this.layouts[0].src);

    if (!this.embedded) {
      this.lockPageScrolling();
    }

    this.invoiceFrame.nativeElement.addEventListener('load', this.onIframeLoad);
    window.addEventListener('resize', this.onResize);
    // visualViewport is purpose-built to report zoom-driven viewport changes and fires more
    // reliably for zoom-only changes (no accompanying window resize) than window's own
    // resize event across browsers - belt-and-suspenders alongside the listener above.
    window.visualViewport?.addEventListener('resize', this.onResize);
    window.addEventListener('beforeprint', this.onBeforePrint);
    window.addEventListener('afterprint', this.onAfterPrint);
  }

  // Only when this preview *is* the page. Inside the dialog the same locking is done once by
  // the dialog itself, for the whole time it is open - doing it here as well would mean two
  // owners of one style, and whichever restored last would win.
  private lockPageScrolling(): void {
    this.previousBodyOverflowX = document.body.style.overflowX;
    // The report is a fixed width - on a narrow screen that would normally force a
    // horizontal scrollbar. The responsive scaling below shrinks the *visual* size to fit
    // instead, so nothing should ever actually overflow, but this is a safety net against
    // any residual sub-pixel overflow.
    document.body.style.overflowX = 'hidden';

    // The window itself should stay static - .preview-viewport (sized to the viewport via CSS)
    // is what scrolls internally to reveal a report taller than the screen, like an embedded
    // PDF viewer rather than a normal scrolling page. Locking overflow on both html and body
    // (some browsers put the scrollbar on one, some the other) is what actually stops the page
    // itself from ever growing a second, outer scrollbar alongside the wrapper's own.
    this.previousBodyOverflowY = document.body.style.overflowY;
    this.previousHtmlOverflowY = document.documentElement.style.overflowY;
    document.body.style.overflowY = 'hidden';
    document.documentElement.style.overflowY = 'hidden';
  }

  ngOnDestroy(): void {
    if (!this.embedded) {
      document.body.style.overflowX = this.previousBodyOverflowX;
      document.body.style.overflowY = this.previousBodyOverflowY;
      document.documentElement.style.overflowY = this.previousHtmlOverflowY;
    }
    this.invoiceFrame.nativeElement.removeEventListener('load', this.onIframeLoad);
    window.removeEventListener('resize', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onResize);
    window.removeEventListener('beforeprint', this.onBeforePrint);
    window.removeEventListener('afterprint', this.onAfterPrint);
    clearTimeout(this.resizeTimer);
  }

  private fitFrame(): void {
    const iframe = this.invoiceFrame.nativeElement;
    const wrapper = this.frameWrapper.nativeElement;
    const doc = iframe.contentDocument;
    if (!doc || !doc.documentElement) {
      return;
    }

    // Reset the transform only (never the iframe's own width/height - see the CSS comment
    // on .invoice-frame) before measuring, so repeated calls always measure the report's
    // true natural size rather than compounding an already-applied scale.
    iframe.style.transform = 'none';

    // Read back what the invoice actually rendered at, rather than trusting the last button
    // press - matched against the real dimensions rather than a width threshold.
    const rendered = getPageDimensionsCm(doc);
    if (rendered) {
      this.activeSize = matchPaperSize(rendered);
    }

    // Deliberately the content's total extent (scrollWidth), not just the .page element's
    // own width - .page is centered inside the iframe (margin: 0 auto) with empty space on
    // either side, and since the transform below scales the whole iframe, that offset
    // scales too. Using only .page's own width would under-count how far the content
    // actually reaches, clipping its right edge.
    //
    // getNaturalContentSizePx's page-count x cm-size WIDTH calculation looked like a
    // strictly better replacement for this (floor-immune, see that function's comment) but
    // assumes the rendered page is *exactly* its declared cm width with zero tolerance, and
    // real-world font rendering can differ by a handful of pixels across systems/fonts in
    // ways scrollWidth naturally absorbs by just measuring whatever actually rendered. That
    // mismatch showed up as clipped content on other machines/the deployed site - width stays
    // on scrollWidth for that reason. HEIGHT below is different - see getNaturalContentSizePx.
    const naturalWidth = doc.documentElement.scrollWidth;
    // The dead-gray-space-below-a-short-report bug getNaturalContentSizePx was built to fix
    // (see its comment) - scrollHeight floors at the iframe's own fixed 900x1400px CSS box
    // even when true content is shorter. Unlike width, height has no content-rendering
    // variance to worry about (each .page's height is hard-clipped to its declared cm value),
    // so it's safe to use the exact calculation here while width stays conservative above.
    const naturalHeight = getNaturalContentSizePx(doc)?.height ?? doc.documentElement.scrollHeight;
    if (naturalWidth === 0 || naturalHeight === 0) {
      return;
    }

    // Measured from this component's own box rather than the viewport, because the two are no
    // longer the same thing: as a page it is pinned to the full viewport, but inside the dialog
    // it is only as wide as the dialog. Using the viewport there scaled the report to a width
    // its container didn't have, and the right-hand edge sat outside the dialog. A small safety
    // margin (rather than the exact measured width) absorbs the vertical scrollbar this
    // component needs for a tall multi-page report.
    const availableWidth = this.host.nativeElement.clientWidth - 20;
    // Capped at 1: on a screen wider than the report's natural size, show it centered at its
    // true size (like a normal document viewer) rather than stretched to fill the whole
    // screen. Still shrinks below 1 on a narrower screen, where there wouldn't be room to
    // show it at natural size without a horizontal scrollbar.
    const fitScale = Math.min(1, availableWidth / naturalWidth);
    // This is what actually makes zooming in/out change the on-screen size (fitScale alone
    // is zoom-invariant, since availableWidth and naturalWidth move together under zoom).
    // Applied on top of the capped fitScale, so zooming in can still enlarge past natural
    // size if the user explicitly asks for that, even on a wide screen.
    const zoomFactor = window.devicePixelRatio / this.baselinePixelRatio;
    const scale = fitScale * zoomFactor;

    iframe.style.transform = `scale(${scale})`;
    iframe.style.transformOrigin = 'top left';
    // Collapse the iframe's own box down to the true content height too, not just the
    // wrapper's. The CSS gives .invoice-frame a fixed 1400px height (a floor deliberately
    // taller than any real page, so the report always renders at natural size before being
    // measured) - but once the real height IS known, leaving that floor in place means any
    // moment the wrapper's clip isn't applied exactly (a fit that ran before the report
    // finished generating, a stale inline height after a re-render) shows the leftover
    // 1400px-minus-real-height as dead gray space below the report. Setting it here removes
    // the floor entirely, so there is no oversized box left to leak through in the first
    // place. Safe to shrink at this point specifically because measurement is already done:
    // it only ever shrinks to the content's own height, which can't reflow the content.
    iframe.style.height = `${naturalHeight}px`;
    wrapper.style.width = `${naturalWidth * scale}px`;
    wrapper.style.height = `${naturalHeight * scale}px`;
  }
}
