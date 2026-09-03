import { test, expect } from '@playwright/test';

// The preview must give its iframe a box at least as tall as what is inside it. A box even a
// few pixels short makes the FRAME scroll, which puts a second scrollbar inside the preview
// alongside the one the wrapper already provides - what Priyanka reported (Slack, 2026-09-03).
//
// Two separate sources of extra height, which is why this measures rather than predicts: the
// 0.5cm bottom margin these layouts put between sheets (76px on a four-page report), and the
// browser's default 8px body margin, which view-bill keeps on screen because its own
// `body { margin: 0 }` sits inside @media print.
//
// Worth knowing before trusting a green run: headless Chrome uses overlay scrollbars, so the
// symptom itself is invisible to it - clientHeight equals scrollHeight and no scrollbar takes
// any width, whatever the box is set to. These assertions check the SIZING instead, which is
// the part that holds in every browser.

const CASES = ['Brief Sale Report', 'Loading List', 'View Bills', 'GST Sales Register'];

async function openPreview(page: import('@playwright/test').Page, name: string) {
  await page.goto('/reports');
  await page.locator('.report-card').filter({ hasText: name }).click();
  await page.waitForFunction(() => {
    const frame = document.querySelector('iframe') as HTMLIFrameElement | null;
    return !!frame?.contentDocument?.querySelector('.page');
  }, undefined, { timeout: 20000 });
  // Past the load handler's own 50ms settle and the fit that follows it.
  await page.waitForTimeout(1200);
}

// Paper height is read from the layout's own declaration rather than stated here - the report
// layouts are not all 29cm (loading-list is 29.1) and a hard-coded number would be asserting
// this test's assumption instead of the component's behaviour.
const readFrame = () => {
  const frame = document.querySelector('iframe') as HTMLIFrameElement;
  const doc = frame.contentDocument!;
  const page = doc.querySelector('.page') as HTMLElement;
  const pages = doc.querySelectorAll('.page').length;
  const heightCm = parseFloat(page.dataset['pageHCm'] || '') || parseFloat(page.style.height);
  return {
    pages,
    heightCm,
    frameHeight: Math.round(parseFloat(frame.style.height || '0')),
    contentHeight: doc.documentElement.scrollHeight,
    paperHeight: Math.round(pages * heightCm * (96 / 2.54))
  };
};

for (const name of CASES) {
  test(`${name}: the frame is tall enough for its own content`, async ({ page }) => {
    await openPreview(page, name);
    const frame = await page.evaluate(readFrame);

    expect(frame.pages, 'fixture should be multi-page').toBeGreaterThan(1);
    expect(frame.heightCm, 'the layout should declare its paper height').toBeGreaterThan(0);
    expect(
      frame.frameHeight,
      'a frame shorter than its content scrolls, which is the second scrollbar'
    ).toBeGreaterThanOrEqual(frame.contentHeight);
  });

  test(`${name}: printing sizes the frame to paper, not to the on-screen extras`, async ({ page }) => {
    await openPreview(page, name);

    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.waitForTimeout(400);
    const frame = await page.evaluate(readFrame);

    // Every layout collapses its page margins under @media print, so paper height is the whole
    // document there. Carrying the on-screen extras into the print box would leave a strip of
    // nothing past the last sheet, which the printer honours as an extra blank page.
    expect(frame.frameHeight).toBe(frame.paperHeight);
    expect(frame.frameHeight).toBe(frame.contentHeight);
  });
}
