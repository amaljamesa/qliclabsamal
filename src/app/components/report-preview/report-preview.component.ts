import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

const RESIZE_DEBOUNCE_MS = 200;
const PRINT_STYLE_ID = 'report-preview-page-size-style';
const CM_TO_PX = 96 / 2.54;

// Every report layout this component can embed, keyed by the :report route segment. Each
// entry is just the static file to load - the physical page size is NOT listed here on
// purpose: it's read off the rendered .page element's own data attributes instead (see
// getPageDimensionsCm), so a layout that changes its paper size stays correct here without
// this map needing to be kept in sync.
const REPORT_SOURCES: Record<string, string> = {
  'loading-list': '/print/loading-list/view/loading-list.html?message=1',
  'view-bill': '/print/view-bill/view/view-bill.html?message=1',
  'journal-voucher': '/print/journal-voucher/view/journal-voucher.html?message=1',
  'gst-sale': '/print/gst-sale/view/gst-sale.html?message=1',
  'brief-sale': '/print/brief-sale/view/brief-sale.html?message=1'
};

// Generic responsive preview wrapper, shared by every report layout listed above. Embeds a
// static print layout in an iframe and scales it to fit the screen - like a PDF viewer
// auto-fitting a document. The scale is a pure visual CSS transform applied from the
// outside; the report renders at its natural size inside the iframe and is never touched,
// so its data and pagination are completely unaffected by this component.
//
// This is the same design already proven on InvoicePreviewComponent/LedgerPreviewComponent,
// generalised so the five newer layouts share one implementation rather than each carrying
// its own copy. It differs from those two in one way: they hardcode (ledger) or read from
// inline style (invoice) their page size, whereas these layouts declare theirs via data
// attributes, which also covers the landscape one (gst-sale is 29.7cm x 21cm, wider than
// it is tall - a portrait assumption would print it at roughly double the page count).
@Component({
  selector: 'app-report-preview',
  standalone: true,
  templateUrl: './report-preview.component.html',
  styleUrls: ['./report-preview.component.css']
})
export class ReportPreviewComponent implements AfterViewInit, OnDestroy {
  @ViewChild('frameWrapper', { static: true }) frameWrapper!: ElementRef<HTMLDivElement>;
  @ViewChild('reportFrame', { static: true }) reportFrame!: ElementRef<HTMLIFrameElement>;

  frameSrc = '';
  reportTitle = 'Report';

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

  constructor(private route: ActivatedRoute) {}

  private readonly onResize = (): void => {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => this.fitFrame(), RESIZE_DEBOUNCE_MS);
  };

  private readonly onIframeLoad = (): void => {
    // A short delay so the report (which generates its own content on load) has finished
    // rendering before the first fit measures it.
    setTimeout(() => this.fitFrame(), 50);
  };

  // Reads the physical page size straight off the rendered .page element's data attributes -
  // the literal values the layout itself declared, not a rendered measurement, so unlike
  // getBoundingClientRect() this is unaffected by whatever on-screen zoom or scale is
  // currently applied. Falls back to inline style (the invoice layout's convention) so this
  // component also works against a layout that hasn't adopted the data attributes.
  private getPageDimensionsCm(doc: Document): { widthCm: number; heightCm: number } | null {
    const page = doc.querySelector<HTMLElement>('.page');
    if (!page) {
      return null;
    }
    const widthCm = parseFloat(page.dataset['pageWCm'] ?? page.style.width);
    const heightCm = parseFloat(page.dataset['pageHCm'] ?? page.style.height);
    if (!widthCm || !heightCm) {
      return null;
    }
    return { widthCm, heightCm };
  }

  // Ensures this wrapper page's own @page rule matches the report's actual paper size.
  // Without it, printing falls back to whatever default the browser assumes (commonly
  // Letter), which doesn't match what the iframe's internal page-break-after:always rules
  // assume - that mismatch is what splits a page's footer onto its own extra sheet.
  private ensurePageSizeStyle(widthCm: number, heightCm: number): void {
    let styleEl = document.getElementById(PRINT_STYLE_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = PRINT_STYLE_ID;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `@page { size: ${widthCm}cm ${heightCm}cm; margin: 0; }`;
  }

  // The report's true content size, immune to two separate ways naive DOM measurement lies
  // here: (1) scrollWidth/scrollHeight reflect whatever on-screen zoom is currently active
  // (which made the printed page count vary by zoom level alone for identical data), and
  // (2) less obviously, an iframe's own document reports scrollHeight as *at least* the
  // iframe element's own fixed CSS box size (see .report-frame) even when the real content
  // is shorter - a single-page report is well under that floor, so scrollHeight silently
  // reports the floor instead, inflating the on-screen wrapper and leaving a dead gray gap
  // below the report. Counting .page elements (a plain DOM count, unaffected by zoom or the
  // iframe's box) and multiplying by the layout's own declared cm page size sidesteps both.
  //
  // Only HEIGHT is used from this (see fitFrame's comment on naturalWidth) - the equivalent
  // width calculation assumes the rendered page is *exactly* its declared cm width with zero
  // tolerance, which real-world font rendering doesn't always honor, and that showed up as
  // clipped content on other machines. Height has no such variance: each .page's height is
  // hard-clipped to its declared cm value via overflow:hidden.
  private getNaturalContentSizePx(doc: Document): { width: number; height: number } | null {
    const pageCount = doc.querySelectorAll('.page').length;
    const dimensions = this.getPageDimensionsCm(doc);
    if (pageCount === 0 || !dimensions) {
      return null;
    }
    return {
      width: dimensions.widthCm * CM_TO_PX,
      height: pageCount * dimensions.heightCm * CM_TO_PX
    };
  }

  // Expanding the iframe to its true natural size beforehand (no transform, no clipping)
  // makes the entire multi-page report part of the wrapper page's actual layout, so printing
  // the wrapper prints all of it rather than just the first screenful.
  private readonly onBeforePrint = (): void => {
    const iframe = this.reportFrame.nativeElement;
    const doc = iframe.contentDocument;
    if (!doc) {
      return;
    }
    const dimensions = this.getPageDimensionsCm(doc);
    const size = this.getNaturalContentSizePx(doc);
    if (!dimensions || !size) {
      return;
    }
    this.ensurePageSizeStyle(dimensions.widthCm, dimensions.heightCm);
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

  ngAfterViewInit(): void {
    const reportKey = this.route.snapshot.paramMap.get('report') ?? '';
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

    this.reportFrame.nativeElement.addEventListener('load', this.onIframeLoad);
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
    document.body.style.overflowY = this.previousBodyOverflowY;
    document.documentElement.style.overflowY = this.previousHtmlOverflowY;
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

    // Deliberately the content's total extent (scrollWidth), not the declared cm width -
    // the cm calculation assumes the rendered page is exactly its declared width with zero
    // tolerance, and real-world font rendering can differ by a few pixels across systems in
    // ways scrollWidth absorbs by just measuring whatever actually rendered. Getting this
    // wrong clips the right edge of the report on some machines. HEIGHT below is different.
    const naturalWidth = doc.documentElement.scrollWidth;
    // Height uses the floor-immune calculation instead (see getNaturalContentSizePx) -
    // scrollHeight bottoms out at the iframe's own fixed CSS box even when the true content
    // is shorter, which shows up as dead gray space below a short report.
    const naturalHeight = this.getNaturalContentSizePx(doc)?.height ?? doc.documentElement.scrollHeight;
    if (naturalWidth === 0 || naturalHeight === 0) {
      return;
    }

    // A small safety margin (rather than the exact measured width) absorbs the vertical
    // scrollbar this page needs for a tall multi-page report.
    const availableWidth = document.documentElement.clientWidth - 20;
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
