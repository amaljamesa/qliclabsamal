import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Guards the Excel export end to end. Worth an e2e test specifically because the .xlsx
// writer (src/app/services/xlsx-writer.util.ts) hand-builds a ZIP container and the
// SpreadsheetML parts inside it - a byte-level mistake there produces a file that downloads
// happily and only fails when someone tries to open it in Excel. Checking the archive really
// unpacks, and that the parts are well-formed XML naming our sheets, catches that here.
//
// Needs only the Angular dev server: the preview renders whatever payload is in
// sessionStorage, so no backend or seeded invoice is involved.

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
    // Deliberately carries the characters XML has to escape, plus a non-ASCII rupee sign, to
    // prove the escaping and the UTF-8 byte length used in the ZIP headers agree.
    { sl_no: 2, pro_name: 'Rice & "Wheat" <Premium>', desc: '₹ per KGS', qty: '2.00', rate: '15.00', amount: '30.00' }
  ],
  tax_details: [
    { hsn: '3406', taxable_value: '8.48', central_tax_rate: '9%', central_tax_amount: '0.76', state_tax_rate: '9%', state_tax_amount: '0.76', integrated_tax_rate: '0%', integrated_tax_amount: '0.00', cess_tax_rate: '0%', cess_tax_amount: '0.00', total_tax_amount: '1.52' }
  ],
  tax_details_total: {
    name: 'Total', total_taxable_value: '38.48', total_central_tax_amount: '0.76',
    total_state_tax_amount: '0.76', total_integrated_tax_amount: 0, total_cess_tax_amount: 0,
    total_tax_amount: '1.52'
  },
  tax_split_up_total: [{ name: 'Output CGST%', rate: 9, amount: '0.76' }],
  others: {
    name: 'Total', total_qty: 3, total_amount: '38.48', page_size: 'a4',
    amt_in_words: 'Rupees Thirty Eight Only', terms_and_conditions: 'Note\nterms and condition texted here'
  }
};

async function openPreviewWithPayload(page: import('@playwright/test').Page, payload: unknown) {
  // Seeded before any app code runs, exactly as InvoicePrintService.openInvoicePreview would
  // have left it before opening the preview.
  await page.addInitScript((json: string) => {
    sessionStorage.setItem('temp_inv_data', btoa(unescape(encodeURIComponent(json))));
  }, JSON.stringify(payload));
  await page.goto('/print/invoice-preview?message=1');
  await expect(page.locator('#excelButton')).toBeVisible();
}

// The preview's toolbar can produce two kinds of file (this workbook and a PDF - see
// preview-pdf.spec.ts), so every wait in this spec is filtered by extension rather than taking
// whichever download turns up first.
function waitForXlsx(page: import('@playwright/test').Page) {
  return page.waitForEvent('download', (download) => download.suggestedFilename().endsWith('.xlsx'));
}

test('exports the previewed invoice as a readable .xlsx workbook', async ({ page }) => {
  await openPreviewWithPayload(page, PAYLOAD);

  const downloadPromise = waitForXlsx(page);
  await page.locator('#excelButton').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('invoice-RSP-S-26-00002.xlsx');

  const file = path.join(os.tmpdir(), `invoice-export-${Date.now()}.xlsx`);
  await download.saveAs(file);
  const bytes = fs.readFileSync(file);

  // 'PK\x03\x04' - the local file header every ZIP (and therefore every .xlsx) starts with.
  expect(bytes.subarray(0, 4).toString('binary')).toBe('PK');
  // The end-of-central-directory record must be the last 22 bytes (no archive comment).
  expect(bytes.subarray(bytes.length - 22, bytes.length - 18).toString('binary')).toBe('PK');

  const parts = await unzip(bytes);
  // The minimum set of parts a spreadsheet reader looks for.
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) {
    expect(Object.keys(parts)).toContain(name);
  }

  const workbook = parts['xl/workbook.xml'];
  expect(workbook).toContain('name="RSP-S-26-00002"');

  const sheet = parts['xl/worksheets/sheet1.xml'];
  expect(sheet).toContain('Tax Invoice');
  expect(sheet).toContain('Walk - In');
  expect(sheet).toContain('Rupees Thirty Eight Only');
  // Money arrives in the sheet as a real number, not the payload's pre-formatted string -
  // the whole point of exporting to a spreadsheet rather than a picture of one.
  expect(sheet).toContain('<v>8.48</v>');
  // XML-significant characters in the data must be escaped, never passed through raw.
  expect(sheet).toContain('Rice &amp; &quot;Wheat&quot; &lt;Premium&gt;');
  // A tax column that is zero across every row is dropped rather than padding the table.
  expect(sheet).not.toContain('Integrated Tax Amount');
  expect(sheet).toContain('Central Tax Amount');

  // Every part has to be well-formed XML - a stray unescaped character anywhere makes Excel
  // reject the whole workbook.
  for (const [name, xml] of Object.entries(parts)) {
    expect(await isWellFormedXml(page, xml), `${name} should be well-formed XML`).toBe(true);
  }
});

test('exports a bulk print batch as one sheet per invoice', async ({ page }) => {
  await openPreviewWithPayload(page, {
    invoices: [
      PAYLOAD,
      { ...PAYLOAD, master_details: { ...PAYLOAD.master_details, inv_no: 'RSP-S-26-00003' } }
    ]
  });

  const downloadPromise = waitForXlsx(page);
  await page.locator('#excelButton').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('invoices-2.xlsx');

  const file = path.join(os.tmpdir(), `invoice-bulk-export-${Date.now()}.xlsx`);
  await download.saveAs(file);
  const parts = await unzip(fs.readFileSync(file));

  expect(Object.keys(parts)).toContain('xl/worksheets/sheet2.xml');
  expect(parts['xl/workbook.xml']).toContain('name="1 - RSP-S-26-00002"');
  expect(parts['xl/workbook.xml']).toContain('name="2 - RSP-S-26-00003"');
});

// The two tests above seed the payload directly, which keeps them readable but means they
// only ever exercise the shape they themselves wrote. This one goes through the real Bulk
// Print flow instead, so the export meets the actual production payload
// (HARDCODED_BULK_TEST_INVOICE - far wider than the sample above: eleven items, HSN summary,
// discounts, footer lines, terms) with no test-authored data in the way.
test('exports the payload the real Bulk Print flow produces', async ({ page }) => {
  await page.goto('/invoices');
  const firstRowCheckbox = page.locator('td.checkbox-td input[type="checkbox"]').first();
  await firstRowCheckbox.waitFor();
  await firstRowCheckbox.check();

  // Bulk Print opens the preview as a dialog on this same page (it used to open a new tab).
  await page.locator('.bulk-print-btn').click();
  const preview = page.locator('app-preview-dialog');
  await expect(preview.locator('#excelButton')).toBeVisible();

  const downloadPromise = waitForXlsx(page);
  await preview.locator('#excelButton').click();
  const download = await downloadPromise;

  const file = path.join(os.tmpdir(), `invoice-real-export-${Date.now()}.xlsx`);
  await download.saveAs(file);
  const parts = await unzip(fs.readFileSync(file));

  const sheet = parts['xl/worksheets/sheet1.xml'];
  expect(sheet).toContain('Sunshine Limited');
  expect(sheet).toContain('GARBAGE BAGS 19*21');
  expect(sheet).toContain('terms and condition texted here');
  expect(await isWellFormedXml(page, sheet)).toBe(true);
});

// Unpacks a stored-entry ZIP by walking its central directory - the same way a reader would,
// so it fails if the offsets, sizes or headers the writer produced are wrong. Deliberately
// hand-rolled rather than shelling out to a zip tool: this is what is under test.
async function unzip(bytes: Buffer): Promise<Record<string, string>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entryCount = view.getUint16(bytes.length - 22 + 10, true);
  const centralSize = view.getUint32(bytes.length - 22 + 12, true);
  let cursor = view.getUint32(bytes.length - 22 + 16, true);
  expect(cursor + centralSize).toBe(bytes.length - 22);

  const parts: Record<string, string> = {};
  for (let i = 0; i < entryCount; i++) {
    expect(view.getUint32(cursor, true)).toBe(0x02014b50);
    const size = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');

    expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    parts[name] = bytes.subarray(dataStart, dataStart + size).toString('utf8');

    cursor += 46 + nameLength + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
  }
  return parts;
}

// Uses the browser's own DOMParser rather than adding an XML parser to devDependencies.
async function isWellFormedXml(page: import('@playwright/test').Page, xml: string): Promise<boolean> {
  return page.evaluate((source: string) => {
    const doc = new DOMParser().parseFromString(source, 'application/xml');
    return doc.getElementsByTagName('parsererror').length === 0;
  }, xml);
}
