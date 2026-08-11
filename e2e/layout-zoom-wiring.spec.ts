import { test, expect, Page } from '@playwright/test';

// Every print layout re-paginates itself when the zoom level changes, because pagination is
// measured against the zoom in force when the report was built (see public/assets/js/report-zoom.js
// for the mechanism). Three report layouts had that; the other twelve did not, and were given it
// on 2026-08-11 - Priyanka: "Check that Zoom issue also solved please in all layouts".
//
// report-layout-overlap.spec.ts proves the *behaviour* for the four layouts whose row-height
// pagination the bug actually bites: it renders them at several device pixel ratios and asserts
// rows clear the footer, then changes the ratio and asserts the pages were rebuilt.
//
// This spec covers the other side, across all fifteen: that each layout actually loads the shared
// helper and starts watching. That is the failure mode a per-layout wiring change really has -
// a mistyped relative path (they sit at three different depths from public/assets/js/), or a
// layout that got the script tag but no call. Neither shows up as anything visible until someone
// zooms, and neither is caught by a test of only the layouts that already worked.

const LAYOUTS = [
  'brief-sale', 'gst-sale', 'view-bill', 'loading-list', 'journal-voucher',
  'invoice', 'invoice-d2', 'invoice-d3', 'invoice-d4', 'invoice-d5',
  'invoice-d6', 'invoice-d7', 'invoice-d8', 'invoice-d9', 'invoice-d10'
];

function url(layout: string): string {
  return `/print/${layout}/view/${layout}.html`;
}

const INVOICE_PAYLOAD = {
  heading: { name: 'Tax Invoice', sub_name: '' },
  config: { bill_to: true, print_hsn_summary: false, show_amt_in_words: true },
  copies: [{ type: 'Original', typeOfCopy: 0 }],
  design: { logo: '', signature: '' },
  be_details: { beb_name: 'Sunshine Limited', beb_addline1: '5th Floor Bejai', pin: '560026', phone: '7777777777' },
  bill_to: { party_name: 'Walk - In', party_phone: '9999999991' },
  ship_to: { name: '', add1: '', add2: '', add3: '', pin: '', phone: '', gstin: '' },
  master_details: { inv_no: 'RSP-S-26-00002', pmt_doc_date: '24-07-2026', place_supply: '29 - Karnataka' },
  inv_att: [],
  product_columns: [
    { name: 'sl_no', display_name: 'SL.No' },
    { name: 'pro_name', display_name: 'Description of Goods' },
    { name: 'qty', display_name: 'Qty' },
    { name: 'rate', display_name: 'Rate' },
    { name: 'amount', display_name: 'Amount' }
  ],
  // Enough rows to run to several pages, so a rebuild is visible as more than one page.
  items: Array.from({ length: 90 }, (_, i) => ({
    sl_no: i + 1, pro_name: `JABSON P NUT KARI SING NARIYAL 200GM ${i + 1}`, desc: '',
    qty: '12', rate: '78.50', amount: '942.00', tax_rate: '18 %', hsn: ''
  })),
  tax_details: [],
  tax_details_total: {},
  tax_split_up_total: [],
  footer: [],
  others: {
    name: 'Total', total_qty: 1080, total_amount: '84780.00', page_size: 'a4',
    amt_in_words: 'Rupees Eighty Four Thousand Seven Hundred Eighty Only'
  }
};

async function seed(page: Page): Promise<void> {
  await page.addInitScript((json: string) => {
    sessionStorage.setItem('temp_inv_data', btoa(unescape(encodeURIComponent(json))));
  }, JSON.stringify(INVOICE_PAYLOAD));
}

test('every print layout loads the shared zoom watcher and calls it', async ({ page }) => {
  const failures: string[] = [];
  // Seeded for the whole loop so the ten invoice designs, which all read this one key, actually
  // render - a script tag inserted into the wrong place in the document could break a layout's
  // own code, and a report that renders nothing would pass every other assertion here.
  await seed(page);

  for (const layout of LAYOUTS) {
    // The report layouts read other keys and are left without data on purpose: the helper is
    // wired up as the document loads, so a layout with nothing to render still proves its script
    // tag resolved. Their pagination is covered by report-layout-overlap.spec.ts.
    const response = await page.goto(`${url(layout)}?message=1`);
    if (!response || !response.ok()) {
      failures.push(`${layout}: page did not load`);
      continue;
    }

    // Two separate mistakes, so two separate checks. The relative path can be wrong (these
    // layouts sit at three different depths from public/assets/js/), which leaves the global
    // undefined...
    const loaded = await page.evaluate(() => typeof (window as any).watchZoomAndRepaginate === 'function');
    if (!loaded) {
      failures.push(`${layout}: watchZoomAndRepaginate is not defined - check the script src path`);
    }
    // ...or the tag can be there with nothing calling it, which no runtime probe would notice,
    // since the global exists either way. Read from the served document rather than from disk so
    // it is the file the browser actually got.
    if (!(await response.text()).includes('watchZoomAndRepaginate(')) {
      failures.push(`${layout}: loads the helper but never calls it`);
    }

    if (layout.startsWith('invoice')) {
      const pages = await page.locator('.page').count();
      if (pages === 0) {
        failures.push(`${layout}: rendered no pages from the seeded payload`);
      }
    }
  }

  expect(failures, failures.join('\n')).toEqual([]);
});

test('the shared helper files are served where the layouts ask for them', async ({ page }) => {
  // The layouts reference these by relative path, so a rename or a move breaks fifteen files at
  // once and silently - the assertion above would catch it, this one says why.
  for (const name of ['report-zoom.js', 'report-scope.js']) {
    const response = await page.goto(`/assets/js/${name}`);
    expect(response?.ok(), `${name} should be served`).toBe(true);
  }
});

// The behavioural half for the invoice layouts, which the report spec does not cover: the same
// zoom change, on the design an invoice actually prints with. Worth having beyond the wiring
// check above because these layouts already had a resize listener of their own - the question is
// whether a zoom change with no accompanying size change (exactly what happens inside the
// preview's fixed-width iframe) now rebuilds the pages, which it previously did not.
for (const layout of ['invoice', 'invoice-d2']) {
  test(`${layout}: re-paginates when the zoom changes after generating`, async ({ browser }) => {
    const context = await browser.newContext({ deviceScaleFactor: 0.75 });
    const page = await context.newPage();
    await seed(page);
    await page.goto(`${url(layout)}?message=1`);
    await page.locator('.page').first().waitFor();

    // Tags the pages that exist now: a re-render replaces them wholesale, so a survivor means
    // pagination never re-ran.
    const pagesBefore = await page.evaluate(() => {
      const pages = Array.from(document.querySelectorAll('.page'));
      pages.forEach((pg) => pg.setAttribute('data-generation', 'first'));
      return pages.length;
    });

    const client = await context.newCDPSession(page);
    const viewport = page.viewportSize()!;
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false
    });

    // Past the helper's 400ms poll plus its 100ms debounce, with room to spare.
    await page.waitForTimeout(1500);

    const after = await page.evaluate(() => ({
      total: document.querySelectorAll('.page').length,
      stale: document.querySelectorAll('.page[data-generation="first"]').length
    }));

    expect(pagesBefore).toBeGreaterThan(1);
    expect(after.stale, 'the zoom change must trigger a fresh pagination').toBe(0);
    expect(after.total, 'the rebuilt invoice should still have pages').toBeGreaterThan(1);

    await context.close();
  });
}
