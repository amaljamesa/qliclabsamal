import { test, expect, Page } from '@playwright/test';

// Guards the payload handoff that replaced base64-in-Web-Storage.
//
// The old route base64'd the payload into sessionStorage/localStorage, which is capped at ~5MB
// per origin and shared with every other feature in the app. A bulk print repeats a full
// invoice payload per selected id, so a large enough batch made the write throw
// QuotaExceededError and the preview rendered blank. Payloads now cross in memory - the layout
// reads the live object off its parent window (src/app/services/preview-payload.ts) - with
// IndexedDB as the reload/direct-open fallback.
//
// The two tests below check the two halves of that claim: nothing lands in Web Storage at all
// on the normal path, and a payload far past 5MB survives the fallback path intact.
//
// Needs only the Angular dev server; no backend or seeded fixture is involved.

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

// Fails the test on the specific error the old handoff died with, rather than letting a blank
// preview show up as some downstream assertion failing for an unclear reason.
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

test('bulk print renders without writing the payload to Web Storage', async ({ page }) => {
  const quotaErrors = failOnQuotaErrors(page);

  await page.goto('/invoices');
  // Every invoice at once - the largest batch this screen can produce, and the case that used
  // to grow the encoded payload fastest.
  const selectAll = page.locator('th.checkbox-th input[type="checkbox"]');
  await selectAll.waitFor();
  await selectAll.check();

  await page.locator('.bulk-print-btn').click();
  const preview = page.locator('app-preview-dialog');
  await expect(preview.locator('#excelButton')).toBeVisible();

  const frame = page.frameLocator('app-preview-dialog iframe');
  await expect(frame.locator('.page').first()).toBeVisible();

  // The point of the change: the payload never touches the capped store, so there is no size
  // at which this write can fail.
  expect(await readWebStorage(page, WEB_STORAGE_KEYS)).toEqual([]);
  expect(quotaErrors).toEqual([]);

  // The whole batch arrived, not a truncated prefix of it.
  const selectedRows = await page.locator('td.checkbox-td input[type="checkbox"]').count();
  const delivered = await page
    .frameLocator('app-preview-dialog iframe')
    .locator('body')
    .evaluate(() => (window as any).getReportPayload()?.invoices?.length ?? 0);
  expect(delivered).toBe(selectedRows);
});

test('a payload larger than the Web Storage quota reaches the layout through IndexedDB', async ({ page }) => {
  // Rendering several thousand pages is the slow part here, not the handoff under test - the
  // payload itself resolves in milliseconds. Generous enough that a slow machine doesn't turn
  // this into a flake.
  test.setTimeout(180_000);
  const quotaErrors = failOnQuotaErrors(page);

  // Seeded before any app code runs, standing in for what setPreviewPayload mirrors there -
  // this is the path a reloaded preview or a directly-opened /print/ URL takes, since neither
  // has a parent window to read. Deliberately built past 5MB: sessionStorage physically could
  // not have carried this, which is what makes it a test of the ceiling being gone rather than
  // just raised.
  // ~7KB of JSON each, so this lands around 7MB - comfortably past the ~5MB ceiling, which is
  // the whole point of the size assertion at the end.
  const invoiceCount = 1000;
  await page.addInitScript((count: number) => {
    const invoice = {
      heading: { name: 'Tax Invoice', sub_name: '' },
      config: { bill_to: true, print_hsn_summary: false, show_amt_in_words: true },
      copies: [{ type: 'Original', typeOfCopy: 0 }],
      be_details: { beb_name: 'Sunshine Limited', beb_addline1: '5th Floor Bejai', pin: '560026', phone: '7777777777' },
      bill_to: { party_name: 'Walk - In', party_phone: '9999999991' },
      master_details: { inv_no: 'BIG-0001', pmt_doc_date: '24-07-2026', place_supply: '29 - Karnataka' },
      product_columns: [
        { name: 'sl_no', display_name: 'SL.No' },
        { name: 'pro_name', display_name: 'Description of Goods' },
        { name: 'qty', display_name: 'Qty' },
        { name: 'rate', display_name: 'Rate' },
        { name: 'amount', display_name: 'Amount' }
      ],
      // Long, non-ASCII product names: the rupee sign is exactly what made the old encode
      // balloon (encodeURIComponent turns it into '%E2%82%B9' before base64 adds a third on top).
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
    const payload = { invoices: Array.from({ length: count }, () => invoice) };

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
  }, invoiceCount);

  await page.goto('/print/invoice-preview?message=1');
  await page.evaluate(() => (window as any).__seeded);
  // Reloaded so the layout boots with the seeded record already committed, which is the real
  // sequence: the payload is in IndexedDB before the preview opens.
  await page.reload();

  await expect(page.locator('#excelButton')).toBeVisible();
  const frame = page.frameLocator('#invoicePreviewFrame, iframe');
  await expect(frame.locator('.page').first()).toBeVisible({ timeout: 60_000 });

  const delivered = await frame.locator('body').evaluate(() => {
    const data = (window as any).getReportPayload();
    return {
      invoices: data?.invoices?.length ?? 0,
      bytes: new TextEncoder().encode(JSON.stringify(data)).length
    };
  });

  expect(delivered.invoices).toBe(invoiceCount);
  // The assertion that matters: this is past the ~5MB ceiling the old handoff died at, and it
  // arrived whole.
  expect(delivered.bytes).toBeGreaterThan(5 * 1024 * 1024);
  expect(quotaErrors).toEqual([]);
  expect(await readWebStorage(page, WEB_STORAGE_KEYS)).toEqual([]);
});
