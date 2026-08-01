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

  // The iframe is deliberately kept at a fixed 900x1400px box on screen (see the CSS comment
  // on .ledger-frame) and only visually scaled up/down with a CSS transform to fit the
  // screen - but printing the *outer* wrapper page captures only what's actually laid out in
  // that fixed box. Confirmed via a real print: the output only ever contained the first
  // report page's content (oddly split across 2 physical pages) followed by several
  // completely blank pages - the rest of the multi-page report, which on screen you'd only
  // ever reach by scrolling inside the iframe, was never printed at all. Expanding the iframe
  // to its true natural size beforehand (no transform, no clipping) makes the *entire* report
  // part of the wrapper page's actual layout, so printing the wrapper prints all of it.
  private readonly onBeforePrint = (): void => {
    const iframe = this.ledgerFrame.nativeElement;
    const doc = iframe.contentDocument;
    if (!doc || !doc.documentElement) {
      return;
    }
    const naturalWidth = doc.documentElement.scrollWidth;
    const naturalHeight = doc.documentElement.scrollHeight;
    iframe.style.transform = 'none';
    iframe.style.width = `${naturalWidth}px`;
    iframe.style.height = `${naturalHeight}px`;
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

    // Deliberately the content's total extent (scrollWidth), not just the .page element's
    // own width - .page is centered inside the iframe (margin: 0 auto) with empty space on
    // either side, and since the transform below scales the whole iframe, that offset
    // scales too. Using only .page's own width would under-count how far the content
    // actually reaches, clipping its right edge.
    const naturalWidth = doc.documentElement.scrollWidth;
    const naturalHeight = doc.documentElement.scrollHeight;
    if (naturalWidth === 0 || naturalHeight === 0) {
      return;
    }

    // A small safety margin (rather than the exact measured width) absorbs the vertical
    // scrollbar this page needs for a tall multi-page report.
    const availableWidth = document.documentElement.clientWidth - 20;
    // Always fill the available width - like a mobile PDF viewer's "fit to width", this
    // scales UP on a screen wider than the report's natural size (previously capped at 1,
    // which left the report at its natural size with dead space around it on anything wider
    // than ~21cm) as well as down on a narrower one.
    const fitScale = availableWidth / naturalWidth;
    // See baselinePixelRatio's comment: this factor is what actually makes zooming in/out
    // change the on-screen size, since fitScale alone is zoom-invariant.
    const zoomFactor = window.devicePixelRatio / this.baselinePixelRatio;
    const scale = fitScale * zoomFactor;

    iframe.style.transform = `scale(${scale})`;
    iframe.style.transformOrigin = 'top left';
    wrapper.style.width = `${naturalWidth * scale}px`;
    wrapper.style.height = `${naturalHeight * scale}px`;
  }
}
