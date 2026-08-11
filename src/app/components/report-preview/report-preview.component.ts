import { AfterViewInit, Component, ElementRef, Input, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { PaperSize, ReportPrintService } from '../../services/report-print.service';
import { PreviewPdfService } from '../../services/preview-pdf.service';
import {
  getNaturalContentSizePx,
  getPageDimensionsCm,
  matchPaperSize,
  setPrintPageSize
} from '../../services/preview-page.util';

const RESIZE_DEBOUNCE_MS = 200;

// Every report layout this component can embed, keyed by the :report route segment. Each
// entry is just the static file to load - the physical page size is NOT listed here on
// purpose: it's read off the rendered .page element's own data attributes instead (see
// preview-page.util), so a layout that changes its paper size stays correct here without
// this map needing to be kept in sync.
const REPORT_SOURCES: Record<string, string> = {
  'loading-list': '/print/loading-list/view/loading-list.html?message=1',
  'view-bill': '/print/view-bill/view/view-bill.html?message=1',
  'journal-voucher': '/print/journal-voucher/view/journal-voucher.html?message=1',
  'gst-sale': '/print/gst-sale/view/gst-sale.html?message=1',
  'brief-sale': '/print/brief-sale/view/brief-sale.html?message=1',
  // Alternative invoice designs. These render A4 or A5 from the same file depending on the
  // payload's others.page_size, which is exactly why nothing about the size is stated here.
  'invoice-d2': '/print/invoice-d2/view/invoice-d2.html?message=1',
  'invoice-d3': '/print/invoice-d3/view/invoice-d3.html?message=1',
  'invoice-d4': '/print/invoice-d4/view/invoice-d4.html?message=1'
};

// Generic responsive preview wrapper, shared by every report layout listed above. Embeds a
// static print layout in an iframe and scales it to fit the screen - like a PDF viewer
// auto-fitting a document. The scale is a pure visual CSS transform applied from the
// outside; the report renders at its natural size inside the iframe and is never touched,
// so its data and pagination are completely unaffected by this component.
//
// This is the same design already proven on InvoicePreviewComponent/LedgerPreviewComponent,
// generalised so the five newer layouts share one implementation rather than each carrying
// its own copy.
//
// Hosted two ways: as the /print/report/:report page in its own right, and (the usual route
// now) inside PreviewDialogComponent, which passes the layout as an input and sets `embedded`.
@Component({
  selector: 'app-report-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './report-preview.component.html',
  styleUrls: ['./report-preview.component.css'],
  host: { '[class.embedded]': 'embedded' }
})
export class ReportPreviewComponent implements AfterViewInit, OnDestroy {
  @ViewChild('frameWrapper', { static: true }) frameWrapper!: ElementRef<HTMLDivElement>;
  @ViewChild('reportFrame', { static: true }) reportFrame!: ElementRef<HTMLIFrameElement>;

  /**
   * Which layout to embed. Empty when this is the routed page, where the :report segment says
   * so instead - a dialog has no route of its own to read.
   */
  @Input() report = '';
  /** Set by PreviewDialogComponent when this preview is shown inside the dialog. */
  @Input() embedded = false;

  frameSrc = '';
  reportTitle = 'Report';
  // Empty for the layouts that only render one paper size, which is what hides the switch.
  paperSizes: PaperSize[] = [];
  // Not a stored preference: set from the size the embedded report actually rendered at (see
  // fitFrame), so the highlighted button always reflects what is on screen rather than what
  // was last clicked.
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
  // move by the same factor when zooming, and that factor cancels out of the fit-to-width
  // ratio in fitFrame(). Without this baseline, zooming alone (with no window resize)
  // wouldn't change the on-screen size at all. Captured once at load as this display's "no
  // zoom applied yet" reference, since devicePixelRatio also reflects real monitor DPI, not
  // just zoom - only *changes* from this baseline matter.
  private readonly baselinePixelRatio = window.devicePixelRatio;

  private reportKey = '';

  constructor(
    private host: ElementRef<HTMLElement>,
    private route: ActivatedRoute,
    private reportPrintService: ReportPrintService,
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
      this.fitFrame();
    }, 50);
  };

  // Expanding the iframe to its true natural size beforehand (no transform, no clipping)
  // makes the entire multi-page report part of the wrapper page's actual layout, so printing
  // the wrapper prints all of it rather than just the first screenful.
  private readonly onBeforePrint = (): void => {
    const iframe = this.reportFrame.nativeElement;
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
    const iframe = this.reportFrame.nativeElement;
    iframe.style.width = '';
    iframe.style.height = '';
    this.fitFrame();
  };

  print(): void {
    window.print();
  }

  // Saves the report as a PDF file directly, with no print dialog to drive - see
  // PreviewPdfService for why that is a separate route from Print rather than the same one.
  async downloadPdf(): Promise<void> {
    const doc = this.reportFrame.nativeElement.contentDocument;
    if (!doc || this.isBuildingPdf) {
      return;
    }
    this.isBuildingPdf = true;
    try {
      await this.previewPdfService.download(doc, `${this.reportKey || 'report'}.pdf`);
    } catch (error) {
      console.error('Could not build a PDF of this report:', error);
    } finally {
      this.isBuildingPdf = false;
    }
  }

  // Switching paper size rewrites the payload's page_size and reloads the frame - the layout
  // renders either size from the same HTML, so there is no second file to point at. The
  // reload fires the existing load handler, which re-fits and re-reads the active size.
  setPaperSize(size: PaperSize): void {
    if (size === this.activeSize) {
      return;
    }
    if (!this.reportPrintService.setStoredPaperSize(this.reportKey, size)) {
      return;
    }
    this.reportFrame.nativeElement.src = this.frameSrc;
  }

  ngAfterViewInit(): void {
    // The input wins when it is set (the dialog), the route segment is the fallback (the page).
    const reportKey = this.report || this.route.snapshot.paramMap.get('report') || '';
    this.reportKey = reportKey;
    this.paperSizes = this.reportPrintService.getPaperSizes(reportKey) ?? [];
    this.frameSrc = REPORT_SOURCES[reportKey] ?? '';
    this.reportTitle = reportKey
      .split('-')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ') || 'Report';

    if (!this.frameSrc) {
      console.error('Unknown report layout:', reportKey);
      return;
    }
    this.reportFrame.nativeElement.src = this.frameSrc;

    if (!this.embedded) {
      this.lockPageScrolling();
    }

    this.reportFrame.nativeElement.addEventListener('load', this.onIframeLoad);
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

    // The window itself stays static - .preview-viewport (see the CSS) is what scrolls
    // internally to reveal a report taller than the screen, like an embedded PDF viewer
    // rather than a normal scrolling page. Locking overflow on both html and body (some
    // browsers put the scrollbar on one, some the other) stops the page itself from ever
    // growing a second, outer scrollbar alongside the viewport's own.
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
    this.reportFrame.nativeElement.removeEventListener('load', this.onIframeLoad);
    window.removeEventListener('resize', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onResize);
    window.removeEventListener('beforeprint', this.onBeforePrint);
    window.removeEventListener('afterprint', this.onAfterPrint);
    clearTimeout(this.resizeTimer);
  }

  private fitFrame(): void {
    const iframe = this.reportFrame.nativeElement;
    const wrapper = this.frameWrapper.nativeElement;
    const doc = iframe.contentDocument;
    if (!doc || !doc.documentElement) {
      return;
    }

    // Reset the transform only (never the iframe's own width - see the CSS comment on
    // .report-frame) before measuring, so repeated calls always measure the report's true
    // natural size rather than compounding an already-applied scale.
    iframe.style.transform = 'none';

    // Read back what the report actually rendered at, rather than trusting the last button
    // press - matched against the real dimensions rather than a width threshold, since one
    // of these layouts is landscape and would read as "wide" either way.
    const rendered = getPageDimensionsCm(doc);
    if (rendered) {
      this.activeSize = matchPaperSize(rendered);
    }

    // Deliberately the content's total extent (scrollWidth), not the declared cm width -
    // the cm calculation assumes the rendered page is exactly its declared width with zero
    // tolerance, and real-world font rendering can differ by a few pixels across systems in
    // ways scrollWidth absorbs by just measuring whatever actually rendered. Getting this
    // wrong clips the right edge of the report on some machines. HEIGHT below is different.
    const naturalWidth = doc.documentElement.scrollWidth;
    // Height uses the floor-immune calculation instead (see getNaturalContentSizePx) -
    // scrollHeight bottoms out at the iframe's own fixed CSS box even when the true content
    // is shorter, which shows up as dead gray space below a short report.
    const naturalHeight = getNaturalContentSizePx(doc)?.height ?? doc.documentElement.scrollHeight;
    if (naturalWidth === 0 || naturalHeight === 0) {
      return;
    }

    // Measured from this component's own box rather than the viewport, because the two are no
    // longer the same thing: as a page it is pinned to the full viewport, but inside the dialog
    // it is only as wide as the dialog. A small safety margin (rather than the exact measured
    // width) absorbs the vertical scrollbar this component needs for a tall multi-page report.
    const availableWidth = this.host.nativeElement.clientWidth - 20;
    // Capped at 1: on a screen wider than the report's natural size, show it centered at its
    // true size (like a normal document viewer) rather than stretched to fill the whole
    // screen. Still shrinks below 1 on a narrower screen, where there wouldn't be room to
    // show it at natural size without a horizontal scrollbar.
    const fitScale = Math.min(1, availableWidth / naturalWidth);
    // This is what actually makes zooming change the on-screen size (fitScale alone is
    // zoom-invariant, since availableWidth and naturalWidth move together under zoom).
    const zoomFactor = window.devicePixelRatio / this.baselinePixelRatio;
    const scale = fitScale * zoomFactor;

    iframe.style.transform = `scale(${scale})`;
    iframe.style.transformOrigin = 'top left';
    // Collapse the iframe's own box to the true content height too, not just the wrapper's.
    // The CSS gives .report-frame a fixed height floor (deliberately taller than any real
    // page, so the report always renders at natural size before being measured) - once the
    // real height IS known, leaving that floor in place means any moment the wrapper's clip
    // isn't applied exactly shows the leftover floor-minus-real-height as dead gray space.
    // Safe to shrink here specifically because measurement is already done: it only ever
    // shrinks to the content's own height, which can't reflow the content.
    iframe.style.height = `${naturalHeight}px`;
    wrapper.style.width = `${naturalWidth * scale}px`;
    wrapper.style.height = `${naturalHeight * scale}px`;
  }
}
