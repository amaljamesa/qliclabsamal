import { test, expect } from '@playwright/test';
import * as fs from 'fs';

// Guards the auto-export that runs when an invoice is saved: the PDF has to be built from the
// real print layout, off-screen, with no preview ever appearing, and named for the invoice.
//
// What this can and cannot check. The folder half - Documents -> Invoice Folder -> PDFs - goes
// through showDirectoryPicker, a native dialog no automation can drive, so under test the app
// takes its documented fallback and downloads instead. That still exercises everything this
// feature actually added: the hidden frame, the layout render, the rasterising, the filename,
// and the fact that saving alone triggers it. Where the bytes land is the browser's decision
// and is not what these tests are about.
//
// Needs only the Angular dev server - invoices come from the in-memory DataService.

test('saving an invoice downloads its PDF, named for the invoice, with no preview shown', async ({ page }) => {
  await page.goto('/invoices/new');

  // The seeded new invoice is already valid (two filled lines) and short enough that the
  // simulated API rejection - which only covers lines 4 and 7 - leaves it alone.
  const invoiceNo = (await page.locator('.invoice-notes').inputValue()).match(/S-26-\d+/)?.[0];
  expect(invoiceNo, 'the form should show the number it is about to save under').toBeTruthy();

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByRole('button', { name: /Update/ }).click();

  // The layout must never be put on screen: no preview dialog, and the frame doing the work
  // is off to the side of the viewport rather than in it.
  await expect(page.locator('.preview-dialog, app-invoice-preview')).toHaveCount(0);
  const framesOnScreen = await page.evaluate(() =>
    Array.from(document.querySelectorAll('iframe')).filter(frame => {
      const box = frame.getBoundingClientRect();
      return box.right > 0 && box.bottom > 0 && box.left < window.innerWidth;
    }).length
  );
  expect(framesOnScreen, 'the render frame should sit off-screen while it works').toBe(0);

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${invoiceNo}.pdf`);

  // A real PDF, not an empty shell: the header, and enough bytes to be a rendered page.
  const file = await download.path();
  expect(file).toBeTruthy();
  const bytes = fs.readFileSync(file!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(20_000);

  // And the save still completes, leaving for the list once the file exists. Not asserting the
  // new row appears there: the list filters to 1 Apr - 30 Jun 2026 by default, so an invoice
  // dated today is outside it - which has nothing to do with this export.
  await expect(page).toHaveURL(/\/invoices$/, { timeout: 30_000 });
});

test('a rejected invoice saves nothing and downloads nothing', async ({ page }) => {
  await page.goto('/invoices/new');

  // Four lines is enough to trip the simulated row-4 rejection, so the save never lands - and
  // an invoice that was not saved must not produce a PDF either.
  for (let i = 0; i < 2; i++) {
    await page.locator('.new-row-btn').click();
    const row = page.locator('.item-row').nth(2 + i);
    await row.locator('.cell-input').first().fill(`MDH GARAM MASALA ${i + 1}`);
    await page.locator('.items-panel').click({ position: { x: 5, y: 5 } });
    await row.locator('.num-input').nth(0).fill('4');
    await row.locator('.num-input').nth(1).fill('92');
  }

  let downloaded = false;
  page.on('download', () => { downloaded = true; });

  await page.getByRole('button', { name: /Update/ }).click();
  await expect(page.locator('.validation-card')).toContainText('Row 4');

  // Long enough that a PDF export kicked off in the background would have surfaced by now.
  await page.waitForTimeout(3_000);
  expect(downloaded, 'a rejected invoice should not produce a PDF').toBe(false);
  await expect(page).toHaveURL(/\/invoices\/new$/);
});
