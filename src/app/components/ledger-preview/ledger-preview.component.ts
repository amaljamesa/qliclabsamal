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

  private readonly onResize = (): void => {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => this.fitFrame(), RESIZE_DEBOUNCE_MS);
  };

  private readonly onIframeLoad = (): void => {
    // A short delay so the report (which generates its own content on load) has finished
    // rendering before the first fit measures it.
    setTimeout(() => this.fitFrame(), 50);
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
  }

  ngOnDestroy(): void {
    document.body.style.overflowX = this.previousBodyOverflowX;
    this.ledgerFrame.nativeElement.removeEventListener('load', this.onIframeLoad);
    window.removeEventListener('resize', this.onResize);
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
    const scale = availableWidth / naturalWidth;

    iframe.style.transform = `scale(${scale})`;
    iframe.style.transformOrigin = 'top left';
    wrapper.style.width = `${naturalWidth * scale}px`;
    wrapper.style.height = `${naturalHeight * scale}px`;
  }
}
