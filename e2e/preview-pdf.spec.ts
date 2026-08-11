import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Guards the PDF download the previews offer next to Print (Vignesh, Slack "Task set of
// 10-08-2026"). Worth an e2e test because nothing about it can be checked without a real
// browser: the file is built by rasterising the rendered pages (html2canvas) into a jsPDF
// document, so a bug here produces a file that downloads perfectly happily and is empty, or
// the wrong paper size, or missing every page after the first.
//
// What each test checks, beyond "a file arrived": the PDF's page count matches the pages the
// preview actually rendered, each page's /MediaBox is the layout's own paper size in points
// (not the browser's default Letter), and each page carries a DCTDecode image - the rasterised
// sheet. A blank page would satisfy the first two on its own.
//
// Needs only the Angular dev server: the previews render whatever payload is in storage.

const PAYLOAD = {
  heading: { name: 'Tax Invoice', sub_name: '' },
  config: { bill_to: true, ship_to: false, print_hsn_summary: true, show_amt_in_words: true },
  be_details: { beb_name: 'Sunshine Limited', beb_addline1: '5th Floor Bejai', pin: '560026', phone: '7777777777' },
  bill_to: { party_name: 'Walk - In', party_phone: '9999999991' },
  master_details: { inv_no: 'RSP-S-26-00002', pmt_doc_date: '24-07-2026', place_supply: '29 - Karnataka' },
  product_columns: [
    { name: 'sl_no', display_name: 'SL.No' },
    { name: 'pro_name', display_name: 'Description of Goods' },
    { name: 'qty', display_name: 'Qty' },
    { name: 'rate', display_name: 'Rate' },
    { name: 'amount', display_name: 'Amount' }
  ],
  items: [
    { sl_no: 1, pro_name: 'Blue Candle', desc: 'Last for 2 Hours', qty: '1.00', rate: '10.00', amount: '8.48' },
    { sl_no: 2, pro_name: 'Rice', desc: '', qty: '2.00', rate: '15.00', amount: '30.00' }
  ],
  tax_details: [],
  tax_details_total: {},
  tax_split_up_total: [],
  others: {
    name: 'Total', total_qty: 3, total_amount: '38.48', page_size: 'a4',
    amt_in_words: 'Rupees Thirty Eight Only'
  }
};

// A4/A5 in PDF points (72 per inch), which is the unit a /MediaBox is written in.
const A4 = { width: 595.28, height: 841.89 };
const A5 = { width: 419.53, height: 595.28 };

// Rasterising several pages is genuinely slow work - well past the default 30s budget on a cold
// dev server.
test.describe.configure({ timeout: 180_000 });

function waitForPdf(page: Page) {
  return page.waitForEvent('download', (download) => download.suggestedFilename().endsWith('.pdf'));
}

// Leaves the payload in sessionStorage exactly as InvoicePrintService would have before opening
// the preview, then navigates - sessionStorage survives a same-tab navigation.
//
// Deliberately NOT addInitScript (which the Excel spec uses): an init script runs in every frame
// of the page, including the iframe the preview loads the layout into, so it would re-seed this
// original payload underneath the preview every time that frame reloaded - and silently undo the
// A4 -> A5 switch the second test here makes.
//
// Returns with the invoice rendered and the toolbar ready to use.
async function openInvoicePreview(page: Page, payload: unknown): Promise<void> {
  await page.goto('/dashboard');
  await page.evaluate((json: string) => {
    sessionStorage.setItem('temp_inv_data', btoa(unescape(encodeURIComponent(json))));
  }, JSON.stringify(payload));
  await page.goto('/print/invoice-preview?message=1');
  await page.frameLocator('iframe.invoice-frame').locator('.page').first().waitFor();
}

async function savedBytes(download: import('@playwright/test').Download, label: string): Promise<Buffer> {
  const file = path.join(os.tmpdir(), `${label}-${Date.now()}.pdf`);
  await download.saveAs(file);
  return fs.readFileSync(file);
}

// The page boxes a PDF declares, in points. Read straight out of the file rather than through a
// PDF library: the page dictionaries are plain text even in a compressed PDF (only the streams
// are deflated), and a hand-rolled read keeps this test honest about what was actually written.
function pageBoxes(bytes: Buffer): { width: number; height: number }[] {
  const text = bytes.toString('latin1');
  const matches = text.matchAll(/\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/g);
  return [...matches].map((match) => ({
    width: parseFloat(match[3]) - parseFloat(match[1]),
    height: parseFloat(match[4]) - parseFloat(match[2])
  }));
}

function countOccurrences(bytes: Buffer, needle: string): number {
  return bytes.toString('latin1').split(needle).length - 1;
}

function expectPdf(bytes: Buffer, expected: { pages: number; box: { width: number; height: number } }): void {
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');

  const boxes = pageBoxes(bytes);
  expect(boxes).toHaveLength(expected.pages);
  for (const box of boxes) {
    // Half a point of tolerance: jsPDF writes the size rounded to its own precision.
    expect(box.width).toBeCloseTo(expected.box.width, 0);
    expect(box.height).toBeCloseTo(expected.box.height, 0);
  }

  // One rasterised sheet per page. Without this the assertions above would pass just as well
  // for a PDF of correctly-sized blank pages.
  expect(countOccurrences(bytes, '/DCTDecode')).toBe(expected.pages);
}

async function renderedPageCount(page: Page, frameSelector: string): Promise<number> {
  const frame = page.frameLocator(frameSelector);
  await frame.locator('.page').first().waitFor();
  return frame.locator('.page').count();
}

test('downloads a PDF of the invoice from the preview toolbar', async ({ page }) => {
  await openInvoicePreview(page, PAYLOAD);

  const downloadPromise = waitForPdf(page);
  await page.locator('#pdfButton').click();

  const download = await downloadPromise;
  // Named from the invoice number, matching the Excel export of the same invoice.
  expect(download.suggestedFilename()).toBe('invoice-RSP-S-26-00002.pdf');

  const pages = await renderedPageCount(page, 'iframe.invoice-frame');
  expect(pages).toBe(1);
  expectPdf(await savedBytes(download, 'invoice-pdf'), { pages, box: A4 });
});

test('the Download PDF button re-exports at the paper size on screen', async ({ page }) => {
  await openInvoicePreview(page, PAYLOAD);

  // Switching to A5 re-renders the invoice from the same payload at the smaller size, which is
  // the case that proves the export reflects what is currently on screen rather than whatever
  // the preview first rendered.
  await page.locator('.switch-button', { hasText: 'A5' }).click();
  await expect(page.locator('.switch-button.active')).toHaveText('A5');

  const downloadPromise = waitForPdf(page);
  await page.locator('#pdfButton').click();
  const download = await downloadPromise;

  const pages = await renderedPageCount(page, 'iframe.invoice-frame');
  expectPdf(await savedBytes(download, 'invoice-a5'), { pages, box: A5 });
});

// The landscape case, and the one that goes through the real UI rather than a seeded payload.
// GST Sales Register is 29.7cm x 21cm - wider than it is tall - and a portrait assumption
// anywhere in the chain would either rotate it or crop half of every sheet away.
test('exports the landscape sales register at its own page size', async ({ page }) => {
  await page.goto('/reports');
  await page.locator('.report-card', { hasText: 'GST Sales Register' }).click();

  const dialog = page.locator('app-preview-dialog');
  await expect(dialog).toBeVisible();
  await page.frameLocator('app-preview-dialog iframe.report-frame').locator('.page').first().waitFor();

  const downloadPromise = waitForPdf(page);
  await dialog.locator('#pdfButton').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('gst-sale.pdf');

  const pages = await renderedPageCount(page, 'iframe.report-frame');
  expect(pages).toBeGreaterThan(1);
  expectPdf(await savedBytes(download, 'gst-sale'), {
    pages,
    box: { width: A4.height, height: A4.width }
  });
});
