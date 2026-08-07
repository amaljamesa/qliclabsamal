import { test, expect } from '@playwright/test';

// Drives the Brief Sale Report the way a reviewer actually would - Reports page, click the
// card, look at the preview - against the app's own sample data rather than data the test
// wrote itself.
//
// This is the check that was missing. brief-sale-long-names.spec.ts proves the layout handles
// long names, but it supplies those names itself; the app's sample data was five short names,
// every row one line tall, so nobody clicking through the UI could see the overlap or the fix.

test('the Brief Sale sample data exercises long names, and they do not overlap', async ({ page, context }) => {
  await page.goto('/reports');

  const previewPromise = context.waitForEvent('page');
  await page.getByText('Brief Sale Report', { exact: false }).first().click();
  const preview = await previewPromise;
  await preview.waitForLoadState();

  // The layout renders inside the preview's iframe.
  const frame = preview.frameLocator('iframe');
  await frame.locator('.page').first().waitFor();

  const result = await preview.locator('iframe').evaluate((iframe: HTMLIFrameElement) => {
    const doc = iframe.contentDocument!;
    const pages = Array.from(doc.querySelectorAll('.page'));

    // How many lines a cell's text actually occupies. A Range over the text yields one
    // rect per line box, unlike getClientRects() on the td itself, which returns a single
    // rect for the whole (block) box however many lines are inside it.
    const lineCount = (el: Element) => {
      const range = doc.createRange();
      range.selectNodeContents(el);
      return range.getClientRects().length;
    };

    return {
      pageCount: pages.length,
      // A row taller than one line is the whole point of the sample data.
      multiLineRows: Array.from(doc.querySelectorAll('#maintable td.buyer-name'))
        .filter((td) => lineCount(td) > 1).length,
      overlaps: pages.filter((pg) => {
        const rows = pg.querySelectorAll('#maintable tr');
        const footer = pg.querySelector('.Dfoot');
        if (!rows.length || !footer) return false;
        return rows[rows.length - 1].getBoundingClientRect().bottom >
          footer.getBoundingClientRect().top;
      }).length,
      wrappedReferences: Array.from(doc.querySelectorAll('#maintable td.no-wrap'))
        .filter((td) => lineCount(td) > 1).length
    };
  });

  expect(result.pageCount).toBeGreaterThan(1);
  // Guards the sample data itself: if someone trims these names back to short ones, the
  // overlap check below silently stops testing anything.
  expect(result.multiLineRows, 'sample data should contain names that wrap').toBeGreaterThan(0);
  expect(result.overlaps, 'no page should have a row overlapping its footer').toBe(0);
  expect(result.wrappedReferences, 'bill no / date / amount should not wrap').toBe(0);
});
