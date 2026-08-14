import { Injectable } from '@angular/core';
import { getPageDimensionsCmOrDefault, PageDimensionsCm } from './preview-page.util';

// Saves whatever a preview currently has on screen as a real .pdf file, next to the existing
// Print button (Vignesh, Slack "Task set of 10-08-2026": "Download PDF in preview screen along
// with print").
//
// Print already reaches a PDF - via the browser's own "Save as PDF" destination - but that is
// a dialog the user has to drive, with a paper size and margins they can change and therefore
// get wrong. This route produces the file directly: one click, no dialog, and exactly the page
// size the layout declared.
//
// Each .page element is rasterised (html2canvas) and placed as one full-bleed image on one PDF
// page sized to that layout's own cm dimensions, so the PDF's page count and page size match
// the printed sheets exactly. The deliberate consequence: the text in the PDF is an image, not
// selectable text. The alternative - jsPDF's own html() renderer, which does emit text - was
// not usable here: it re-lays-out the HTML with its own partial CSS support and its autoPaging
// slices wherever its own measurement lands, which loses the per-page pagination these layouts
// spent so much effort getting right (repeated headers, footer reserve, exact page breaks). An
// image of the correct page beats reflowed text on the wrong one.
const RASTER_SCALE = 2;
// JPEG rather than PNG: a rasterised A4 sheet at the scale above is ~1590x2245px, and a PNG of
// that is several times larger per page - a 20-page report would run to tens of MB. At this
// quality the artefacts on black-on-white text are not visible at 100% zoom.
const JPEG_QUALITY = 0.95;
// Rasterising is asynchronous and the layouts re-paginate themselves in the middle of it: each
// one re-runs its own pagination on a resize (see the resize listener in
// public/print/invoice/view/invoice.html), and that pass deletes every .page element and builds
// fresh ones. Since the preview sets the iframe's height as it fits the report, that resize
// happens inside the frame as a matter of course - so an export that held on to the page
// elements it started with would routinely find them detached halfway through and produce a
// half-empty file. Each attempt therefore re-reads the pages as it goes and starts over if they
// were replaced underneath it; a couple of retries is ample for a burst of re-pagination that
// settles in a few hundred milliseconds.
const MAX_ATTEMPTS = 3;
// Waited out between attempts. Retrying the instant an attempt fails would just walk straight
// back into the same re-pagination it lost to - and burn a whole rasterising pass doing it -
// whereas the pass that re-paginated has settled by the time this has elapsed (comfortably past
// the layouts' own 200ms resize debounce).
const REPAGINATION_SETTLE_MS = 300;

@Injectable({ providedIn: 'root' })
export class PreviewPdfService {
  /**
   * Rasterises every .page in the given (same-origin) report document into a PDF and saves it.
   * Resolves false, without throwing, if the document has no pages to export yet.
   */
  async download(doc: Document, filename: string): Promise<boolean> {
    const pdf = await this.build(doc);
    if (!pdf) {
      return false;
    }
    pdf.save(filename);
    return true;
  }

  /**
   * The same rendering as download(), but hands the file back instead of sending it to the
   * browser's downloads. That split exists for the save-time auto-export (see
   * InvoicePdfAutoSaveService), which has somewhere specific to put the file - a folder the
   * user picked - and so must not have it dropped into Downloads on the way past.
   */
  async render(doc: Document): Promise<Blob | null> {
    const pdf = await this.build(doc);
    return pdf ? (pdf.output('blob') as Blob) : null;
  }

  // The retry loop both routes share. Null means no file could be produced - already logged,
  // so callers only have to decide what to do about it.
  private async build(doc: Document): Promise<import('jspdf').jsPDF | null> {
    if (doc.querySelectorAll('.page').length === 0) {
      console.error('No rendered pages found - nothing to export as PDF.');
      return null;
    }

    // Loaded on demand so the two rendering libraries stay out of the app's initial bundle -
    // only a preview ever needs them. Mirrors PrintService.downloadMarkupAsPdf.
    const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
      import('jspdf'),
      import('html2canvas')
    ]);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const pdf = await this.buildPdf(doc, jsPDF, html2canvas);
      // The preview was closed while this was running (see abandoned()); the user is not
      // waiting for a file, so stopping without one is the right answer, and without noise.
      if (pdf === 'abandoned') {
        return null;
      }
      if (pdf) {
        return pdf;
      }
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, REPAGINATION_SETTLE_MS));
      }
    }

    console.error(`Could not export the PDF: the report kept re-rendering after ${MAX_ATTEMPTS} attempts.`);
    return null;
  }

  // One full pass over the report. Returns the finished document, null if the pages were
  // replaced underneath it (worth another attempt), or 'abandoned' if the report is gone
  // altogether (not worth another attempt).
  private async buildPdf(
    doc: Document,
    jsPDF: typeof import('jspdf').jsPDF,
    html2canvas: typeof import('html2canvas').default
  ): Promise<import('jspdf').jsPDF | null | 'abandoned'> {
    const dimensions = getPageDimensionsCmOrDefault(doc);
    const orientation = this.orientationOf(dimensions);
    const pdf = new jsPDF({
      unit: 'cm',
      // jsPDF rotates a format that disagrees with the requested orientation, so the two have
      // to be stated consistently - hence deriving the orientation from the size rather than
      // hardcoding portrait, which would silently turn the landscape register upright.
      format: [dimensions.widthCm, dimensions.heightCm],
      orientation,
      compress: true
    });

    const pageCount = doc.querySelectorAll('.page').length;
    for (let index = 0; index < pageCount; index++) {
      if (this.abandoned(doc)) {
        return 'abandoned';
      }
      // Re-read rather than reusing a list captured up front: a re-pagination between two
      // iterations replaces every one of these elements (see MAX_ATTEMPTS above).
      const pages = doc.querySelectorAll<HTMLElement>('.page');
      const page = pages[index];
      if (pages.length !== pageCount || !page || !page.isConnected) {
        return null;
      }

      const canvas = await html2canvas(page, {
        scale: RASTER_SCALE,
        // The layouts draw their own white sheet, but a page whose own background is
        // transparent would otherwise come out black in the PDF.
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true
      });
      if (index > 0) {
        pdf.addPage([dimensions.widthCm, dimensions.heightCm], orientation);
      }
      // Full bleed: the layout already includes its own margins inside the page, exactly as it
      // does when printed, so adding any here would double them.
      pdf.addImage(
        canvas.toDataURL('image/jpeg', JPEG_QUALITY),
        'JPEG',
        0,
        0,
        dimensions.widthCm,
        dimensions.heightCm
      );
    }

    return pdf;
  }

  // Whether the report this export was started for is still on screen at all. Closing the
  // preview dialog detaches the iframe, which leaves the document it held without a window -
  // and html2canvas needs that window to do anything.
  private abandoned(doc: Document): boolean {
    return !doc.defaultView || !doc.documentElement.isConnected;
  }

  private orientationOf(dimensions: PageDimensionsCm): 'portrait' | 'landscape' {
    return dimensions.widthCm > dimensions.heightCm ? 'landscape' : 'portrait';
  }
}
