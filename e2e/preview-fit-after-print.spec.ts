import { test, expect } from '@playwright/test';

// The preview has to stay scaled to fit its dialog across a print.
//
// It stopped doing that when a print followed a zoom change (Amal, Slack 2026-09-03): the report
// came back larger than the dialog, spilling off the right-hand edge. A race rather than the
// sizing maths. Between beforeprint and afterprint the frame is deliberately laid out at the
// page's own width - 21cm, some 400px narrower than its on-screen box - and a zoom change fires a
// resize into that window. The fit then measures a report far narrower than the one that comes
// back, decides it needs no shrinking (scale 1 rather than 0.98), and since that scale is
// multiplied by the zoom factor, a zoomed-in browser ends up rendering the report bigger than the
// container holding it.
//
// The scale is the assertion, because it is the thing that was wrong. Width alone would not
// catch it: the frame is genuinely narrow while print-sized, and only overflows once the
// on-screen width comes back underneath a scale computed for the other one.

async function openPreview(page: import('@playwright/test').Page) {
  await page.goto('/reports');
  await page.locator('.report-card').filter({ hasText: 'Brief Sale Report' }).click();
  await page.waitForFunction(() => {
    const frame = document.querySelector('iframe') as HTMLIFrameElement | null;
    return !!frame?.contentDocument?.querySelector('.page');
  }, undefined, { timeout: 20000 });
  await page.waitForTimeout(1200);
}

// Real browser zoom moves both the CSS viewport and the device scale, which is what a
// deviceScaleFactor override on its own does not do.
async function setZoom(page: import('@playwright/test').Page, context: import('@playwright/test').BrowserContext, zoom: number) {
  const client = await context.newCDPSession(page);
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: Math.round(1280 / zoom),
    height: Math.round(720 / zoom),
    deviceScaleFactor: zoom,
    mobile: false
  });
}

const readFit = () => {
  const frame = document.querySelector('iframe') as HTMLIFrameElement;
  const doc = frame.contentDocument!;
  const wrapper = frame.parentElement as HTMLElement;
  const scale = /scale\(([\d.]+)\)/.exec(frame.style.transform || '');
  return {
    pages: doc.querySelectorAll('.page').length,
    scale: scale ? parseFloat(scale[1]) : null,
    transform: frame.style.transform,
    frameWidth: frame.getBoundingClientRect().width,
    wrapperWidth: wrapper.getBoundingClientRect().width,
    printWidth: frame.style.width,
    innerOverflow: doc.documentElement.style.overflow
  };
};

test('the preview is still fitted after printing', async ({ page }) => {
  await openPreview(page);

  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.waitForTimeout(300);
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  // Past the fit's own debounce and any rebuild retry behind it.
  await page.waitForTimeout(1500);

  const fit = await page.evaluate(readFit);
  expect(fit.pages, 'the report should be back on screen').toBeGreaterThan(0);
  expect(fit.transform, 'the report must be scaled again, not left at full size').not.toBe('none');
  expect(fit.frameWidth).toBeLessThanOrEqual(fit.wrapperWidth + 1);
});

test('a resize arriving mid-print does not resize the report to the paper', async ({ page }) => {
  await openPreview(page);
  const before = await page.evaluate(readFit);
  expect(before.scale, 'the report should start out scaled down to fit').toBeLessThan(1);

  // The window that did the damage: between beforeprint and afterprint the frame is laid out at
  // the page's own width, and a zoom change lands a resize in the middle of it. Driven here
  // rather than waited for, because whether the two collide is a matter of timing.
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(600);

  const during = await page.evaluate(readFit);
  expect(during.printWidth, 'the frame should still be print-sized for this to mean anything').not.toBe('');
  // Fitting against the print width computes a scale for a much narrower report; multiplied by
  // the zoom factor it comes out bigger than the container, which is the overflow reported.
  expect(
    during.scale === null ? 0 : during.scale,
    'the scale must not be recomputed against the printing width'
  ).toBeLessThanOrEqual(before.scale!);

  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.waitForTimeout(1200);

  const after = await page.evaluate(readFit);
  expect(after.pages).toBeGreaterThan(0);
  expect(after.scale, 'the report should be scaled to fit again').toBeLessThan(1);
  expect(
    after.frameWidth,
    'a report wider than its wrapper is the overflow that was reported'
  ).toBeLessThanOrEqual(after.wrapperWidth + 1);
});

// A frame that scrolls prints its scrollbar onto the sheet - a grey strip down the edge of every
// page. Headless Chrome uses overlay scrollbars and reports no scrollbar width whatever the
// sizing, so this checks the setting that suppresses it rather than looking for the strip.
test('the frame cannot scroll while printing, and can again afterwards', async ({ page }) => {
  await openPreview(page);
  expect((await page.evaluate(readFit)).innerOverflow, 'the preview scrolls normally on screen').toBe('');

  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.waitForTimeout(300);
  expect(
    (await page.evaluate(readFit)).innerOverflow,
    'nothing may scroll while printing - a scrollbar here is painted onto the paper'
  ).toBe('hidden');

  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.waitForTimeout(1200);
  const after = await page.evaluate(readFit);
  expect(after.innerOverflow, 'scrolling has to come back, or a tall report cannot be read').toBe('');
  expect(after.scale, 'and the report is still fitted').toBeLessThan(1);
});
