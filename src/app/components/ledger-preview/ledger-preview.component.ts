import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';

const RESIZE_DEBOUNCE_MS = 200;

// Embeds the actual ledger report (LedgerReportComponent, at /print/ledger) inside an
// iframe and scales that iframe to fit the screen - like how a PDF viewer auto-fits a
// document to a phone screen. This is a pure visual scale (CSS transform) applied from the
// outside; the report itself renders at its normal, natural size inside the iframe and is
// never touched, so its data/pagination is completely unaffected by this component.
@Component({
  selector: 'app-ledger-preview',
  standalone: true,
  templateUrl: './ledger-preview.component.html',
  styleUrls: ['./ledger-preview.component.css']
})
export class LedgerPreviewComponent implements AfterViewInit, OnDestroy {
  @ViewChild('frameWrapper', { static: true }) frameWrapper!: ElementRef<HTMLDivElement>;
  @ViewChild('ledgerFrame', { static: true }) ledgerFrame!: ElementRef<HTMLIFrameElement>;

  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  private previousBodyOverflowX = '';
  // Browser zoom (Ctrl +/-) scales the *entire* tab uniformly, including everything inside
  // the iframe - so the outer viewport width and the report's measured natural width both
  // move by the same factor when the user zooms, and that factor cancels out of the
  // fit-to-width ratio in fitFrame() below. Without this baseline, zooming in/out alone
  // (with no actual window resize) wouldn't change the on-screen size at all. Captured once
  // at load as this display's "no zoom applied yet" reference point, since devicePixelRatio
  // also reflects real monitor DPI, not just zoom - only *changes* from this baseline matter.
  private readonly baselinePixelRatio = window.devicePixelRatio;

  private readonly onResize = (): void => {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => this.fitFrame(), RESIZE_DEBOUNCE_MS);
  };

  private readonly onIframeLoad = (): void => {
    // A short delay so the report (which generates its own content on load) has finished
    // rendering before the first fit measures it.
    setTimeout(() => this.fitFrame(), 50);
  };

  // The report's true content size, immune to two separate ways naive DOM measurement lies
  // here: (1) scrollWidth/scrollHeight reflect whatever on-screen zoom is currently active
  // (confirmed via a real print that the page count varied by zoom level alone for identical
  // data), and (2) less obviously, an iframe's own document reports scrollHeight as *at
  // least* the iframe element's own fixed CSS box size (900x1400, see .ledger-frame) even
  // when the real content is shorter - a single-page ledger is well under that 1400px floor,
  // so scrollHeight would silently report the floor instead, inflating fitFrame()'s on-screen
  // wrapper and leaving a dead gray gap below the page. Counting .page elements (a plain DOM
  // count, unaffected by zoom or the iframe's own box size) and multiplying by the report's
  // own fixed, CSS-spec-defined page size (21cm x 29.7cm - see ledger-report.component.css),
  // converted via the CSS specification's fixed 96px/2.54cm ratio, sidesteps both at once.
  private getNaturalContentSizePx(doc: Document): { width: number; height: number } | null {
    const pageCount = doc.querySelectorAll('.page').length;
    if (pageCount === 0) {
      return null;
    }
    const CM_TO_PX = 96 / 2.54;
    return {
      width: 21 * CM_TO_PX,
      height: pageCount * 29.7 * CM_TO_PX
    };
  }

  // Expanding the iframe to its true natural size beforehand (no transform, no clipping)
  // makes the entire report part of the wrapper page's actual layout, so printing the wrapper
  // prints all of it rather than just the first screenful (the iframe is otherwise kept at a
  // fixed 900x1400px box on screen and only visually scaled with a CSS transform - see the
  // CSS comment on .ledger-frame). This wrapper page did not previously declare its own @page
  // rule, so it fell back to the browser's default paper size (commonly Letter, not A4) -
  // which didn't match the size the iframe's own internal page-break-after:always rules
  // assume, and was the actual cause of a page's footer splitting off onto its own extra
  // sheet in earlier testing (not the sizing math itself). The matching @page rule added to
  // this component's CSS is what actually fixes that.
  private readonly onBeforePrint = (): void => {
    const iframe = this.ledgerFrame.nativeElement;
    const doc = iframe.contentDocument;
    if (!doc) {
      return;
    }
    const size = this.getNaturalContentSizePx(doc);
    if (!size) {
      return;
    }
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
    this.previousBodyOverflowX = document.body.style.overflowX;
    // The report is a fixed width - on a narrow screen that would normally force a
    // horizontal scrollbar. The responsive scaling below shrinks the *visual* size to fit
    // instead, so nothing should ever actually overflow, but this is a safety net against
    // any residual sub-pixel overflow.
    document.body.style.overflowX = 'hidden';

    this.ledgerFrame.nativeElement.addEventListener('load', this.onIframeLoad);
    window.addEventListener('resize', this.onResize);
    // visualViewport is purpose-built to report zoom-driven viewport changes and fires more
    // reliably for zoom-only changes (no accompanying window resize) than window's own
    // resize event across browsers - belt-and-suspenders alongside the listener above.
    window.visualViewport?.addEventListener('resize', this.onResize);
    window.addEventListener('beforeprint', this.onBeforePrint);
    window.addEventListener('afterprint', this.onAfterPrint);
  }

  print(): void {
    window.print();
  }

  ngOnDestroy(): void {
    document.body.style.overflowX = this.previousBodyOverflowX;
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

    // getNaturalContentSizePx (page count x true cm size) rather than scrollWidth/Height -
    // see the comment on that method. Falls back to scrollWidth/Height only in the brief
    // window before the report has generated any .page elements yet.
    const size = this.getNaturalContentSizePx(doc);
    const naturalWidth = size ? size.width : doc.documentElement.scrollWidth;
    const naturalHeight = size ? size.height : doc.documentElement.scrollHeight;
    if (naturalWidth === 0 || naturalHeight === 0) {
      return;
    }

    // A small safety margin (rather than the exact measured width) absorbs the vertical
    // scrollbar this page needs for a tall multi-page report.
    const availableWidth = document.documentElement.clientWidth - 20;
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
