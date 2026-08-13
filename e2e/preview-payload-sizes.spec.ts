import { test, expect, Page } from '@playwright/test';

// Size sweep over the payload handoff, complementing the two shape-level tests in
// preview-large-payload.spec.ts.
//
// Those two answer "does the normal path avoid Web Storage" and "does one oversized payload
// survive". This file answers the question that follows from them: at what size does the
// handoff stop working? The old base64-in-Web-Storage route had a hard answer (~5MB, and a
// QuotaExceededError past it). The in-memory route should have no such number, so each size
// below is expected to behave identically to the one before it.
//
// What is deliberately NOT measured here: render time. The payload is padded with an inert
// field the layouts never read, so a 50MB case still draws only a handful of pages. That keeps
// these tests about transport - the thing that changed - instead of turning them into a slow,
// flaky benchmark of the renderer. Render scaling for very large batches is a separate concern
// and is not covered by this file.
//
// Needs only the Angular dev server; no backend or seeded fixture is involved.

// Spans the old ceiling on both sides: 1 and 4 fit in the old store, 6 is just past it, and the
// rest are sizes sessionStorage could not have carried under any encoding.
const SIZE_TARGETS_MB = [1, 4, 6, 12, 25, 50];

const WEB_STORAGE_KEYS = [
  'temp_inv_data', 'loadingData', 'loadingDataViewBills',
  'journalVoucherData', 'temp_tax_register', 'temp_sale_report', 'ledgerData'
];

function readWebStorage(page: Page, keys: string[]) {
  return page.evaluate(
    (names: string[]) =>
      names.filter((name) => sessionStorage.getItem(name) !== null || localStorage.getItem(name) !== null),
    keys
  );
}

function failOnQuotaErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /quota/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    if (/quota/i.test(error.message)) {
      errors.push(error.message);
    }
  });
  return errors;
}

// Builds the payload inside the page and commits it to IndexedDB before any app code runs.
// The padding is generated browser-side rather than passed in, so a 50MB string never has to
// cross the CDP connection.
async function seedPayloadOfSize(page: Page, targetBytes: number) {
  await page.addInitScript((bytes: number) => {
    const invoice = {
      heading: { name: 'Tax Invoice', sub_name: '' },
      config: { bill_to: true, print_hsn_summary: false, show_amt_in_words: true },
      copies: [{ type: 'Original', typeOfCopy: 0 }],
      be_details: { beb_name: 'Sunshine Limited', beb_addline1: '5th Floor Bejai', pin: '560026', phone: '7777777777' },
      bill_to: { party_name: 'Walk - In', party_phone: '9999999991' },
      master_details: { inv_no: 'SIZE-0001', pmt_doc_date: '24-07-2026', place_supply: '29 - Karnataka' },
      product_columns: [
        { name: 'sl_no', display_name: 'SL.No' },
        { name: 'pro_name', display_name: 'Description of Goods' },
        { name: 'qty', display_name: 'Qty' },
        { name: 'rate', display_name: 'Rate' },
        { name: 'amount', display_name: 'Amount' }
      ],
      items: Array.from({ length: 30 }, (_, i) => ({
        sl_no: i + 1,
        pro_name: `MANJUSHREE CHICKEN AND FRESH MUTTON SUPPLIERS - MAVINAKATTE MAIN ROAD ${i}`,
        desc: '₹ per KGS, packed and sealed, batch controlled',
        qty: '1.00',
        rate: '1500.00',
        amount: '1271.18'
      })),
      others: { name: 'Total', total_qty: 30, total_amount: '38135.40', page_size: 'a4', amt_in_words: 'Rupees Only' }
    };

    // Three real invoices so the layout has something genuine to render, then an inert field
    // padded until the encoded payload reaches the target. '₹' is multi-byte on purpose: the
    // size being asserted is real UTF-8 bytes, not character count.
    const payload: Record<string, unknown> = { invoices: [invoice, invoice, invoice], __sizeFiller: '' };
    const encoder = new TextEncoder();
    const baseline = encoder.encode(JSON.stringify(payload)).length;
    const shortfall = Math.max(0, bytes - baseline);
    if (shortfall > 0) {
      // '₹' is 3 bytes in UTF-8 and 1 char, so the repeat count is the shortfall in thirds.
      payload['__sizeFiller'] = '₹'.repeat(Math.ceil(shortfall / 3));
    }

    // Mirrors kv-store.util.ts: same database, same object store, same 'preview:' namespace
    // that preview-payload.ts writes under.
    (window as any).__seeded = new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('qliclabs-store', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('kv')) {
          request.result.createObjectStore('kv');
        }
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const tx = request.result.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(payload, 'preview:temp_inv_data');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  }, targetBytes);
}

for (const sizeMB of SIZE_TARGETS_MB) {
  test(`a ${sizeMB}MB payload reaches the layout intact`, async ({ page }) => {
    // Generous for the largest cases: building and committing 50MB is the slow part, and a
    // loaded CI machine shouldn't turn that into a flake.
    test.setTimeout(120_000);

    const targetBytes = sizeMB * 1024 * 1024;
    const quotaErrors = failOnQuotaErrors(page);

    await seedPayloadOfSize(page, targetBytes);

    await page.goto('/print/invoice-preview?message=1');
    await page.evaluate(() => (window as any).__seeded);
    // Reloaded so the layout boots with the seeded record already committed - the real sequence
    // for a reloaded preview or a directly-opened /print/ URL.
    await page.reload();

    await expect(page.locator('#excelButton')).toBeVisible();
    const frame = page.frameLocator('#invoicePreviewFrame, iframe');
    await expect(frame.locator('.page').first()).toBeVisible({ timeout: 60_000 });

    const delivered = await frame.locator('body').evaluate(() => {
      const data = (window as any).getReportPayload();
      return {
        invoices: data?.invoices?.length ?? 0,
        filler: typeof data?.__sizeFiller === 'string' ? data.__sizeFiller.length : -1,
        bytes: new TextEncoder().encode(JSON.stringify(data)).length
      };
    });

    // Arrived whole: the real content is present, and the payload is the size it was seeded at
    // rather than a truncated prefix of it.
    expect(delivered.invoices).toBe(3);
    expect(delivered.filler).toBeGreaterThan(0);
    expect(delivered.bytes).toBeGreaterThanOrEqual(targetBytes);

    // No size is special any more. Under the old handoff every case from 6MB up died here.
    expect(quotaErrors).toEqual([]);
    expect(await readWebStorage(page, WEB_STORAGE_KEYS)).toEqual([]);
  });
}
