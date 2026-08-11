import { AfterViewInit, Component, ElementRef, Input, OnDestroy, ViewChild } from '@angular/core';
import { PreviewPdfService } from '../../services/preview-pdf.service';
import { getNaturalContentSizePx, getPageDimensionsCm, setPrintPageSize } from '../../services/preview-page.util';

const RESIZE_DEBOUNCE_MS = 200;

// Embeds the actual ledger report (LedgerReportComponent, at /print/ledger) inside an
// iframe and scales that iframe to fit the screen - like how a PDF viewer auto-fits a
// document to a phone screen. This is a pure visual scale (CSS transform) applied from the
// outside; the report itself renders at its normal, natural size inside the iframe and is
// never touched, so its data/pagination is completely unaffected by this component.
//
// Hosted two ways: as the /print/ledger-preview page in its own right, and (the usual route
// now) inside PreviewDialogComponent, which sets `embedded`.
@Component({
  selector: 'app-ledger-preview',
  standalone: true,
  templateUrl: './ledger-preview.component.html',
  styleUrls: ['./ledger-preview.component.css'],
  host: { '[class.embedded]': 'embedded' }
})
export class LedgerPreviewComponent implements AfterViewInit, OnDestroy {
  @ViewChild('frameWrapper', { static: true }) frameWrapper!: ElementRef<HTMLDivElement>;
  @ViewChild('ledgerFrame', { static: true }) ledgerFrame!: ElementRef<HTMLIFrameElement>;

  /** Set by PreviewDialogComponent when this preview is shown inside the dialog. */
  @Input() embedded = false;

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
  // makes the entire report part of the wrapper page's actual layout, so printing the wrapper
  // prints all of it rather than just the first screenful (the iframe is otherwise kept at a
  // fixed 900x1400px box on screen and only visually scaled with a CSS transform - see the
  // CSS comment on .ledger-frame).
  //
  // The @page size that goes with it (setPrintPageSize) matters just as much: without a rule
  // matching the report's real paper size, the printing document falls back to whatever the
  // browser assumes (commonly Letter, not A4), which doesn't match what the iframe's own
  // internal page-break-after:always rules assume - and that mismatch, not the sizing maths,
  // was the actual cause of a page's footer splitting off onto its own extra sheet in earlier
  // testing. It is set here per print rather than declared statically in this component's CSS
  // because an @page rule is document-wide: as a static rule it would follow this component
  // into the app's own document once the ledger can be opened as a dialog, and would then
  // still be there, claiming A4, when an A5 invoice was printed later.
  private readonly onBeforePrint = (): void => {
    const iframe = this.ledgerFrame.nativeElement;
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
    const iframe = this.ledgerFrame.nativeElement;
    iframe.style.width = '';
    iframe.style.height = '';
    this.fitFrame();
  };

  ngAfterViewInit(): void {
    if (!this.embedded) {
      this.lockPageScrolling();
    }

    this.ledgerFrame.nativeElement.addEventListener('load', this.onIframeLoad);
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

  print(): void {
    window.print();
  }

  // Saves the ledger as a PDF file directly, with no print dialog to drive - see
  // PreviewPdfService for why that is a separate route from Print rather than the same one.
  async downloadPdf(): Promise<void> {
    const doc = this.ledgerFrame.nativeElement.contentDocument;
    if (!doc || this.isBuildingPdf) {
      return;
    }
    this.isBuildingPdf = true;
    try {
      await this.previewPdfService.download(doc, 'ledger.pdf');
    } catch (error) {
      console.error('Could not build a PDF of this ledger:', error);
    } finally {
      this.isBuildingPdf = false;
    }
  }

  ngOnDestroy(): void {
    if (!this.embedded) {
      document.body.style.overflowX = this.previousBodyOverflowX;
      document.body.style.overflowY = this.previousBodyOverflowY;
      document.documentElement.style.overflowY = this.previousHtmlOverflowY;
    }
    this.ledgerFrame.nativeElement.removeEventListener('load', this.onIframeLoad);
    window.removeEventListener('resize', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onResize);
    window.removeEventListener('beforeprint', this.onBeforePrint);
    window.removeEventListener('afterprint', this.onAfterPrint);
    clearTimeout(this.resizeTimer);
  }

  private fitFrame(): void {
    const iframe = this.ledgerFrame.nativeElement;
    const wrapper = this.frameWrapper.nativeElement;
    const doc = iframe.contentDocument;
    if (!doc || !doc.documentElement) {
      return;
    }

    // Reset the transform only (never the iframe's own width/height - see the CSS comment
    // on .ledger-frame) before measuring, so repeated calls always measure the report's
    // true natural size rather than compounding an already-applied scale.
    iframe.style.transform = 'none';

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
    // it is only as wide as the dialog. A small safety margin (rather than the exact measured
    // width) absorbs the vertical scrollbar this component needs for a tall multi-page report.
    const availableWidth = this.host.nativeElement.clientWidth - 20;
    // Capped at 1: on a screen wider than the report's natural size, show it centered at its
    // true size (like a normal document viewer) rather than stretched to fill the whole
    // screen - Priyanka's feedback was that filling wide screens made the report cover the
    // entire display, which read as broken rather than responsive. Still shrinks below 1 on
    // a narrower screen, where there wouldn't be room to show it at natural size without a
    // horizontal scrollbar.
    const fitScale = Math.min(1, availableWidth / naturalWidth);
    // See baselinePixelRatio's comment: this factor is what actually makes zooming in/out
    // change the on-screen size, since fitScale alone is zoom-invariant. Applied on top of
    // the capped fitScale, so zooming in can still enlarge past natural size if the user
    // explicitly asks for that, even on a wide screen.
    const zoomFactor = window.devicePixelRatio / this.baselinePixelRatio;
    const scale = fitScale * zoomFactor;

    iframe.style.transform = `scale(${scale})`;
    iframe.style.transformOrigin = 'top left';
    wrapper.style.width = `${naturalWidth * scale}px`;
    wrapper.style.height = `${naturalHeight * scale}px`;
  }
}
