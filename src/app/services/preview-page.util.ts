// Shared page geometry for the three report previews (invoice, ledger, and the generic
// wrapper the other layouts share) and for the PDF export all three offer.
//
// Every preview embeds a static print layout in an iframe and needs the same two facts about
// it: the physical size of one page, and how tall the whole report is. Each preview used to
// carry its own copy of that logic, which was survivable while they were separate top-level
// pages - it stopped being survivable once they could also be opened as dialogs inside the
// app (see PreviewDialogComponent), because the @page rule below is document-wide: two
// previews opened in turn in the same document would leave two conflicting rules behind and
// print the second report at the first one's paper size. One shared implementation, one shared
// style element, so the last preview to prepare a print always wins.

// The CSS specification's fixed ratio, not a measurement - so it holds regardless of the real
// display's DPI or the browser's zoom level.
const CM_TO_PX = 96 / 2.54;

export interface PageDimensionsCm {
  widthCm: number;
  heightCm: number;
}

// A4 portrait - the fallback when a layout declares nothing readable, which is also what the
// browser would otherwise have to guess at.
const DEFAULT_PAGE: PageDimensionsCm = { widthCm: 21, heightCm: 29.7 };

// Deliberately ONE id for every preview, not one per component - see the note above.
const PRINT_STYLE_ID = 'preview-page-size-style';

// A plain number of centimetres, as the data attributes carry it.
function parseCm(value: string | undefined): number {
  const parsed = parseFloat(value ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : NaN;
}

// A CSS length that must be written in cm to count. The unit check is the whole point: the
// ledger report sets an inline `height: 1100px` on its pages (its on-screen page box, which is
// not the same as the A4 it prints on), and reading that as "1100" of anything makes a page
// nearly forty times too tall - which is exactly what happened before this check existed.
function parseCssCm(value: string): number {
  return value.trim().endsWith('cm') ? parseCm(value) : NaN;
}

function pair(widthCm: number, heightCm: number): PageDimensionsCm | null {
  return Number.isFinite(widthCm) && Number.isFinite(heightCm) ? { widthCm, heightCm } : null;
}

// The PAPER size of one page - what the report prints on - read from the layout's own
// declaration rather than from a rendered measurement. Two properties matter here, and both have
// been learned the hard way:
//
//  * It is a declaration, not a measurement. getBoundingClientRect() and getComputedStyle() both
//    report whatever the page currently *looks* like, which is affected by the on-screen scale
//    the preview applies, by the report's own internal responsive scaling, and (worst of all) by
//    print media: the ledger's own print CSS relaxes its pages to height:auto, so a computed
//    read during a print measures the whole report as one page.
//  * The screen box and the paper size are not always the same thing. The ledger lays its pages
//    out 1100px tall on screen but prints on A4, so only its own statement of the paper size
//    will do - which is why every layout states one.
//
// Two conventions, because the layouts predate this app and were written at different times:
//
//  1. data attributes on .page, in cm - every report layout, every invoice design except the
//     original one, and the ledger report. Covers the landscape case too (gst-sale is 29.7cm x
//     21cm, and a portrait assumption would print it at roughly double the page count).
//  2. inline width/height in cm - what the original invoice layout's own script sets as it
//     creates each page ("21cm"/"29.7cm" for A4, "14.8cm"/"21cm" for A5).
export function getPageDimensionsCm(doc: Document): PageDimensionsCm | null {
  const page = doc.querySelector<HTMLElement>('.page');
  if (!page) {
    return null;
  }

  const fromData = pair(parseCm(page.dataset['pageWCm']), parseCm(page.dataset['pageHCm']));
  if (fromData) {
    return fromData;
  }

  return pair(parseCssCm(page.style.width), parseCssCm(page.style.height));
}

export function getPageDimensionsCmOrDefault(doc: Document): PageDimensionsCm {
  return getPageDimensionsCm(doc) ?? DEFAULT_PAGE;
}

// Which of the two paper sizes the report actually rendered at, matched against its real
// dimensions rather than a width threshold - one of these layouts is landscape and would read
// as "wide" either way. Empty for a layout that is neither (the landscape register), which is
// what leaves the A4/A5 switch unhighlighted rather than lying about it.
export function matchPaperSize(dimensions: PageDimensionsCm): 'a4' | 'a5' | '' {
  const matches = (widthCm: number, heightCm: number) =>
    Math.abs(dimensions.widthCm - widthCm) < 0.1 && Math.abs(dimensions.heightCm - heightCm) < 0.1;
  return matches(14.8, 21) ? 'a5' : matches(21, 29.7) ? 'a4' : '';
}

// The report's true content size, immune to two separate ways naive DOM measurement lies
// here: (1) scrollWidth/scrollHeight reflect whatever on-screen zoom is currently active
// (which made the printed page count vary by zoom level alone for identical data), and
// (2) less obviously, an iframe's own document reports scrollHeight as *at least* the iframe
// element's own fixed CSS box size even when the real content is shorter - a single-page
// invoice is well under that floor, so scrollHeight silently reports the floor instead,
// inflating the on-screen wrapper and leaving a dead gray gap below the page. Counting .page
// elements (a plain DOM count, unaffected by zoom or the iframe's box) and multiplying by the
// layout's own declared page size sidesteps both at once.
//
// Callers use only the HEIGHT of this (see each preview's fitFrame) - the equivalent width
// calculation assumes the rendered page is *exactly* its declared cm width with zero
// tolerance, which real-world font rendering doesn't always honor, and that showed up as
// clipped content on other machines/the deployed site. Height has no such variance: each
// .page's height is hard-clipped to its declared cm value via overflow:hidden, so the true
// height genuinely always is pageCount x heightCm, exactly.
export function getNaturalContentSizePx(doc: Document): { width: number; height: number } | null {
  const pageCount = doc.querySelectorAll('.page').length;
  const dimensions = getPageDimensionsCm(doc);
  if (pageCount === 0 || !dimensions) {
    return null;
  }
  return {
    width: dimensions.widthCm * CM_TO_PX,
    height: pageCount * dimensions.heightCm * CM_TO_PX
  };
}

// Points the printing document's own @page rule at the report's actual paper size. Without
// this, printing falls back to whatever default the browser assumes (commonly Letter), which
// doesn't match what the iframe's internal page-break-after:always rules assume - that
// mismatch is what splits a page's footer onto its own extra sheet.
export function setPrintPageSize(dimensions: PageDimensionsCm): void {
  let styleEl = document.getElementById(PRINT_STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = PRINT_STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `@page { size: ${dimensions.widthCm}cm ${dimensions.heightCm}cm; margin: 0; }`;
}
