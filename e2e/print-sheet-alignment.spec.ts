import { test, expect } from '@playwright/test';

// A report's pages have to coincide with the sheets it prints on, and that is not something the
// layouts can arrange for themselves. Their `page-break-after: always` rules do NOT reach the
// print job while the report is embedded in a preview: the host document treats the iframe as
// one tall box and slices it every sheet-height. Proven by forcing a different sheet height -
// four pages came out as six sheets.
//
// So pages line up only while the declared page height equals the sheet height, and there are
// two candidates for that sheet height: the @page rule the preview writes, and the paper the
// print dialog is set to. They agree only if the layout declares real A4. Declared at 29cm
// against A4's 29.7, every sheet slid 26.5px further out of step, and the bottom of each page -
// the footer - printed above the top of the next one, which is what Amal reported at 75-80%
// zoom (Slack, 2026-09-03).
//
// This asserts the two heights agree, and that both routes to a printed sheet count land on the
// number of pages the report actually built.

const A4_HEIGHT_CM = 29.7;
const A4_WIDTH_CM = 21;
const CM_TO_PX = 96 / 2.54;

// gst-sale is landscape A4, hence the pairing rather than a single height.
const CASES = [
  { name: 'Brief Sale Report', widthCm: A4_WIDTH_CM, heightCm: A4_HEIGHT_CM },
  { name: 'Loading List', widthCm: A4_WIDTH_CM, heightCm: A4_HEIGHT_CM },
  { name: 'View Bills', widthCm: A4_WIDTH_CM, heightCm: A4_HEIGHT_CM },
  { name: 'GST Sales Register', widthCm: A4_HEIGHT_CM, heightCm: A4_WIDTH_CM }
];

for (const layout of CASES) {
  test(`${layout.name}: pages coincide with sheets`, async ({ page }) => {
    await page.goto('/reports');
    await page.locator('.report-card').filter({ hasText: layout.name }).click();
    await page.waitForFunction(() => {
      const frame = document.querySelector('iframe') as HTMLIFrameElement | null;
      return !!frame?.contentDocument?.querySelector('.page');
    }, undefined, { timeout: 20000 });
    await page.waitForTimeout(1200);

    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.waitForTimeout(400);

    const report = await page.evaluate(() => {
      const frame = document.querySelector('iframe') as HTMLIFrameElement;
      const doc = frame.contentDocument!;
      const first = doc.querySelector('.page') as HTMLElement;
      return {
        pages: doc.querySelectorAll('.page').length,
        declaredHeightCm: parseFloat(first.dataset['pageHCm'] || ''),
        declaredWidthCm: parseFloat(first.dataset['pageWCm'] || ''),
        renderedHeightPx: first.getBoundingClientRect().height
      };
    });

    expect(report.pages, 'fixture should be multi-page').toBeGreaterThan(1);
    expect(report.declaredWidthCm).toBeCloseTo(layout.widthCm, 2);
    expect(report.declaredHeightCm, 'anything but real A4 drifts against the paper').toBeCloseTo(layout.heightCm, 2);
    // The rendered box has to match the declaration too - a page taller than it claims drifts
    // just as badly as one declared wrong.
    expect(report.renderedHeightPx).toBeCloseTo(layout.heightCm * CM_TO_PX, 0);

    const sheetCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

    // Route 1: the @page rule the preview wrote for this report.
    expect(sheetCount(await page.pdf({ preferCSSPageSize: true }))).toBe(report.pages);
    // Route 2: the paper the dialog is set to, ignoring that rule - the case that was drifting.
    const paper = layout.widthCm > layout.heightCm ? { format: 'A4', landscape: true } : { format: 'A4' };
    expect(
      sheetCount(await page.pdf({ ...paper, margin: { top: 0, bottom: 0, left: 0, right: 0 } })),
      'the paper height and the page height must agree'
    ).toBe(report.pages);
  });
}
