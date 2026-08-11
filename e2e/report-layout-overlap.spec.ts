import { test, expect } from '@playwright/test';

// Covers the three report layouts that paginated by a hard-coded rows-per-page count:
// brief-sale, gst-sale and view-bill. All three assumed every row was exactly one line tall,
// so a long name - or simply a different browser zoom level - made rows taller than the budget
// allowed, and the table printed over the footer underneath it.
//
// Each layout is rendered at several device pixel ratios. That is the mechanism behind the
// recording Priyanka shared (layout.mp4): the same page 1 of the Brief Sales Report is clean at
// 80% zoom and prints its last two rows through the footer at 100%, because a line box's height
// rounds to whole device pixels and those fractions accumulate over ~50 rows.
//
// Assertions are geometric on purpose - rendered rectangles are the only thing that catches an
// overlap. Row counts and page counts pass happily against a visibly broken report.

const LONG_NAME = 'MANJUSHREE CHICKEN AND FRESH MUTTON SUPPLIERS - MAVINAKATTE MAIN ROAD BRANCH, MANGALORE DAKSHINA KANNADA';
const UNBROKEN_NAME = 'SUPERCALIFRAGILISTICEXPIALIDOCIOUSTRADINGCOMPANYPRIVATELIMITEDMANGALOREBRANCH';

// The zoom levels the recording moves between, plus the extremes either side.
const SCALE_FACTORS = [1, 1.25, 1.5, 2];

const COMPANY = {
  be_name: 'Lakshmi Home Industries', be_addline1: 'Abhiruchi Masala, NH-66, Thallur',
  be_addline2: 'Kundapura Udupi District', be_addline3: '', be_state: 'Karnataka',
  be_pin: '576230', be_phone: '9481977634', be_gstin: '29BOTPS8264Q1ZD'
};

function name(index: number): string {
  if (index % 17 === 0) return UNBROKEN_NAME;
  if (index % 3 === 0) return `${LONG_NAME} ${index}`;
  return `D P STORE MAIRKOME - ${index}`;
}

function briefSalePayload(count: number) {
  return {
    other: { from_ref_no: '0', to_ref_no: '0', from_date: '01-Apr-2026', to_date: '07-Aug-2026', transaction_type: 'Sales' },
    company_details: COMPANY,
    loading_list_details: Array.from({ length: count }, (_, i) => ({
      row_sl: i + 1, reference: `HO/S/26/${String(i + 1).padStart(5, '0')}`, date: '01-Aug-26',
      paid_topay: 'Credit', 'Account Name': name(i + 1), value: (100 + i * 7).toFixed(2)
    }))
  };
}

function gstSalePayload(count: number) {
  return {
    columns: [], heading: { name: 'Sales Register' },
    be_details: {
      beb_name: COMPANY.be_name, beb_addline1: COMPANY.be_addline1, beb_addline2: COMPANY.be_addline2,
      beb_addline3: '', pin: COMPANY.be_pin, phone: COMPANY.be_phone, beb_gstin: COMPANY.be_gstin
    },
    master_details: { tax_date: '01-04-2026 to 30-06-2026' },
    items: Array.from({ length: count }, (_, i) => {
      const basic = Number((900 + i * 412.75).toFixed(2));
      const isB2b = i % 3 !== 0;
      return {
        pmt_mid: String(50824 + i), inouts: 'Outward', pstt_name: 'Sales', psttl2_name: 'Local Sales',
        pmt_doc_date: `2026-06-${String((i % 28) + 1).padStart(2, '0')}`,
        reference: `S/26/${String(47 + i).padStart(5, '0')}`,
        paidtopay: i % 2 === 0 ? 'Paid-Cash' : 'Credit',
        account_name: name(i + 1), GSTIN: isB2b ? '29ABCFP4059K1ZT' : '',
        B2BB2C: isB2b ? 'B2B' : 'B2C', gst_region: 'Local', gst_supply_type: 'Regular',
        basic_tot: basic, taxes_tot: Number((basic * 0.18).toFixed(2)), round_off: 0,
        total_value: Number((basic * 1.18).toFixed(2)), ExemptedBasic: 0,
        TaxableGST18: basic, TaxGST18: Number((basic * 0.18).toFixed(2))
      };
    })
  };
}

function loadingListPayload(count: number) {
  return {
    other: {
      from_ref_no: '', to_ref_no: '', from_date: '01-Apr-2026', to_date: '07-Aug-2026',
      transaction_type: 'Sales', page_size: 'a4'
    },
    config: { main_table_border: true },
    company_details: COMPANY,
    loading_list_details: Array.from({ length: count }, (_, i) => ({
      row_sl: i + 1, 'Brand Short Name': ['JABSONS', 'MDH', 'R-PURE', 'SNAPIN'][i % 4],
      pro_code: `PRD${String(1000 + i)}`, 'Product Name': name(i + 1),
      pro_mrp: (50 + (i % 20) * 7.5).toFixed(2), qty: String(12 * ((i % 8) + 1))
    }))
  };
}

function viewBillPayload(count: number) {
  return {
    heading: { name: 'View Bills' },
    be_details: {
      beb_name: COMPANY.be_name, beb_addline1: COMPANY.be_addline1, beb_addline2: COMPANY.be_addline2,
      beb_addline3: '', pin: COMPANY.be_pin, phone: COMPANY.be_phone, beb_gstin: COMPANY.be_gstin
    },
    master_details: { tax_date: '01-04-2026 to 30-06-2026', consolidate_check: 2 },
    items: Array.from({ length: count }, (_, i) => {
      const basic = Number((1000 + i * 87.5).toFixed(2));
      return {
        pmt_mid: 2328 + i, type: 'Purchase', date: `${String((i % 28) + 1).padStart(2, '0')}-06-2026`,
        reference: `P/26/${String(60 + Math.floor(i / 4)).padStart(5, '0')}`,
        account: 'JABSONS FOODS PVT LTD', account_name: 'JABSONS FOODS PVT LTD',
        products: name(i + 1), mrp: (70 + (i % 10) * 10).toFixed(3),
        qty: `${24 * ((i % 4) + 1)}.000`, rate: basic.toFixed(2), disc1: 0, disc1_amt: 0,
        disc2: 0, disc2_amt: 0, basic, tax_per: 18,
        taxes: Number((basic * 0.18).toFixed(2)), total: Number((basic * 1.18).toFixed(2))
      };
    })
  };
}

interface LayoutCase {
  id: string;
  url: string;
  storageKey: string;
  storage: 'local' | 'session';
  table: string;
  /** Element the table must stay clear of. */
  footer: string;
  nameCell: string;
  payload: unknown;
}

const CASES: LayoutCase[] = [
  {
    id: 'brief-sale', url: '/print/brief-sale/view/brief-sale.html?message=1',
    storageKey: 'temp_sale_report', storage: 'local',
    table: '#maintable', footer: '.Dfoot', nameCell: 'td.buyer-name',
    payload: briefSalePayload(140)
  },
  {
    id: 'gst-sale', url: '/print/gst-sale/view/gst-sale.html?message=1',
    storageKey: 'temp_tax_register', storage: 'local',
    table: '#bodytable', footer: '.footDiv', nameCell: 'td.account-name',
    payload: gstSalePayload(90)
  },
  {
    id: 'view-bill', url: '/print/view-bill/view/view-bill.html?message=1',
    storageKey: 'loadingDataViewBills', storage: 'session',
    table: '#bodytable', footer: '.footDiv', nameCell: 'td.product-name',
    payload: viewBillPayload(90)
  },
  // Added when the zoom re-pagination was extended to every layout (Priyanka, Slack
  // 2026-08-11). This one paginates by measured row heights like the three above, so it is
  // exposed to exactly the same accumulated line-box rounding - it simply had not been covered.
  // Its rows carry no class names, so the product column is addressed by position.
  {
    id: 'loading-list', url: '/print/loading-list/view/loading-list.html?message=1',
    storageKey: 'loadingData', storage: 'local',
    table: '.body-table', footer: '.footer-section', nameCell: 'tbody td:nth-child(4)',
    payload: loadingListPayload(120)
  }
];

for (const layout of CASES) {
  for (const scale of SCALE_FACTORS) {
    test(`${layout.id}: rows clear the footer at device scale ${scale}`, async ({ browser }) => {
      const context = await browser.newContext({ deviceScaleFactor: scale });
      const page = await context.newPage();

      await page.addInitScript(
        ({ key, json, storage }: { key: string; json: string; storage: string }) => {
          const encoded = btoa(unescape(encodeURIComponent(json)));
          (storage === 'local' ? localStorage : sessionStorage).setItem(key, encoded);
        },
        { key: layout.storageKey, json: JSON.stringify(layout.payload), storage: layout.storage }
      );
      await page.goto(layout.url);
      await page.locator('.page').first().waitFor();

      const result = await page.evaluate(
        ({ tableSel, footerSel, nameSel }: { tableSel: string; footerSel: string; nameSel: string }) => {
          // A Range over the cell's contents yields one rect per line box. getClientRects()
          // on the td itself returns a single rect for the whole block box however many lines
          // are inside it, so it can never detect wrapping.
          const lineCount = (el: Element) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            return range.getClientRects().length;
          };

          const pages = Array.from(document.querySelectorAll('.page'));
          return {
            pageCount: pages.length,
            wrappedNames: Array.from(document.querySelectorAll(nameSel))
              .filter((td) => lineCount(td) > 1).length,
            worstOverlapPx: Math.max(
              ...pages.map((pg) => {
                const table = pg.querySelector(tableSel);
                const footer = pg.querySelector(footerSel);
                if (!table || !footer) return -Infinity;
                return table.getBoundingClientRect().bottom - footer.getBoundingClientRect().top;
              })
            ),
            // .page has overflow:hidden, so anything past its bottom edge is silently lost.
            worstClipPx: Math.max(
              ...pages.map((pg) => {
                const table = pg.querySelector(tableSel);
                if (!table) return -Infinity;
                return table.getBoundingClientRect().bottom - pg.getBoundingClientRect().bottom;
              })
            )
          };
        },
        { tableSel: layout.table, footerSel: layout.footer, nameSel: layout.nameCell }
      );

      expect(result.pageCount).toBeGreaterThan(1);
      // Without wrapped rows the overlap assertions would prove nothing.
      expect(result.wrappedNames, 'fixture should produce rows taller than one line').toBeGreaterThan(0);
      expect(result.worstOverlapPx, 'table must stay above the footer on every page').toBeLessThanOrEqual(0);
      expect(result.worstClipPx, 'table must stay inside the sheet on every page').toBeLessThanOrEqual(0);

      await context.close();
    });
  }

  // Priyanka's sequence: set the browser to 75%, open the preview so the report generates at
  // that zoom, then change to 100%. A fixed safety gap was the first attempt and was not
  // enough - a 25-point zoom change shifts the accumulated line-box rounding by roughly twenty
  // pixels over thirty-odd rows, and that drift has no bounded size to reserve against. The
  // layouts re-paginate on a devicePixelRatio change instead.
  //
  // What this test can and cannot prove, stated plainly: CDP's deviceScaleFactor override
  // moves devicePixelRatio and fires a resize, but it does NOT reproduce the line-box rounding
  // that Chrome's real zoom applies - checked by running this against the unfixed layouts,
  // where it passed. Nothing in Playwright drives real browser zoom at runtime.
  //
  // So the guarantee is split across two tests rather than claimed by one. The per-scale tests
  // above prove pagination is correct at any given zoom; this one proves a zoom change
  // actually triggers a fresh pagination. Together they cover the reported sequence. On its
  // own, this test would be worthless - which is why it asserts the pages were rebuilt rather
  // than merely that nothing overlaps.
  test(`${layout.id}: re-paginates when the zoom changes after generating`, async ({ browser }) => {
    const context = await browser.newContext({ deviceScaleFactor: 0.75 });
    const page = await context.newPage();

    await page.addInitScript(
      ({ key, json, storage }: { key: string; json: string; storage: string }) => {
        const encoded = btoa(unescape(encodeURIComponent(json)));
        (storage === 'local' ? localStorage : sessionStorage).setItem(key, encoded);
      },
      { key: layout.storageKey, json: JSON.stringify(layout.payload), storage: layout.storage }
    );
    await page.goto(layout.url);
    await page.locator('.page').first().waitFor();

    // Tags the pages that exist now. A re-render replaces them wholesale, so if any tagged
    // element survives, pagination did not re-run - which is the failure this guards against.
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

    // Past the layout's 400ms zoom poll plus its 100ms re-render debounce, with room to spare.
    await page.waitForTimeout(1500);

    const worstOverlapPx = await page.evaluate(
      ({ tableSel, footerSel }: { tableSel: string; footerSel: string }) =>
        Math.max(
          ...Array.from(document.querySelectorAll('.page')).map((pg) => {
            const table = pg.querySelector(tableSel);
            const footer = pg.querySelector(footerSel);
            if (!table || !footer) return -Infinity;
            return table.getBoundingClientRect().bottom - footer.getBoundingClientRect().top;
          })
        ),
      { tableSel: layout.table, footerSel: layout.footer }
    );

    const after = await page.evaluate((tableSel: string) => ({
      total: document.querySelectorAll('.page').length,
      // Any survivor means the pages were never rebuilt.
      stale: document.querySelectorAll('.page[data-generation="first"]').length,
      // Re-rendering must replace the pages, not stack a second run on top of the first.
      pagesWithWrongTableCount: Array.from(document.querySelectorAll('.page'))
        .filter((pg) => pg.querySelectorAll(tableSel).length !== 1).length
    }), layout.table);

    expect(pagesBefore).toBeGreaterThan(1);
    expect(after.stale, 'the zoom change must trigger a fresh pagination').toBe(0);
    expect(after.total, 'the rebuilt report should still have pages').toBeGreaterThan(1);
    expect(after.pagesWithWrongTableCount, 're-render should leave one table per page').toBe(0);
    expect(worstOverlapPx, 'rows must still clear the footer after a zoom change').toBeLessThanOrEqual(0);

    await context.close();
  });
}

test('the brief sale header shows the region, route and area it was run for', async ({ page }) => {
  await page.addInitScript((json: string) => {
    localStorage.setItem('temp_sale_report', btoa(unescape(encodeURIComponent(json))));
  }, JSON.stringify({
    ...briefSalePayload(20),
    other: {
      from_ref_no: '0', to_ref_no: '0', from_date: '01-May-2026', to_date: '07-Aug-2026',
      transaction_type: 'Sales', region_name: 'SHIVAMOGGA', route_name: 'NAGARA', area_name: 'Jaynagara'
    }
  }));
  await page.goto('/print/brief-sale/view/brief-sale.html?message=1');
  await page.locator('.page').first().waitFor();

  const heading = (await page.locator('.page').first().locator('.floatrightp').innerText()).replace(/\s+/g, ' ');
  expect(heading).toContain('SHIVAMOGGA | NAGARA | Jaynagara');
  // Above the title, not merged into it.
  expect(heading.indexOf('SHIVAMOGGA')).toBeLessThan(heading.indexOf('Brief Sales Report'));
  expect(heading).toContain('From 01-May-2026 to 07-Aug-2026');

  // The heading block is pulled up by a negative margin to sit alongside the company address,
  // so adding a line to it pushes the title down into the table header unless the offset is
  // adjusted too - which is what happened on the first attempt.
  const clearance = await page.locator('.page').first().evaluate((pg) => {
    const heading = pg.querySelector('.floatrightp')!.getBoundingClientRect();
    const table = pg.querySelector('#maintable')!.getBoundingClientRect();
    return table.top - heading.bottom;
  });
  expect(clearance, 'the heading must not run into the table').toBeGreaterThanOrEqual(0);
});

// The same header on the two layouts it was extended to (Priyanka, Slack 2026-08-11). Both
// assert the same three things as the brief sale test above - that the line is there, that it
// sits above the title rather than merging into it, and that the extra line it adds does not
// push the table into the footer. That last one is the reason these are geometric tests and not
// string checks: both layouts budget their rows against measured heights, so a taller header has
// to cost a row rather than overflow the sheet.
const SCOPE = { region_name: 'SHIVAMOGGA', route_name: 'NAGARA', area_name: 'Jaynagara' };

async function worstOverlap(page: import('@playwright/test').Page, tableSel: string, footerSel: string) {
  return page.evaluate(
    ({ tableSel, footerSel }: { tableSel: string; footerSel: string }) =>
      Math.max(
        ...Array.from(document.querySelectorAll('.page')).map((pg) => {
          const table = pg.querySelector(tableSel);
          const footer = pg.querySelector(footerSel);
          if (!table || !footer) return -Infinity;
          return table.getBoundingClientRect().bottom - footer.getBoundingClientRect().top;
        })
      ),
    { tableSel, footerSel }
  );
}

test('the loading list header shows the region, route and area it was run for', async ({ page }) => {
  const payload = loadingListPayload(60);
  await page.addInitScript((json: string) => {
    localStorage.setItem('loadingData', btoa(unescape(encodeURIComponent(json))));
  }, JSON.stringify({ ...payload, other: { ...payload.other, ...SCOPE } }));
  await page.goto('/print/loading-list/view/loading-list.html?message=1');
  await page.locator('.page').first().waitFor();

  const heading = (await page.locator('.page').first().locator('.header-right p').innerText()).replace(/\s+/g, ' ');
  expect(heading).toContain('SHIVAMOGGA | NAGARA | Jaynagara');
  expect(heading.indexOf('SHIVAMOGGA')).toBeLessThan(heading.indexOf('Brief Sales Report'));

  expect(await page.locator('.page').count()).toBeGreaterThan(1);
  expect(await worstOverlap(page, '.body-table', '.footer-section'),
    'the extra header line must cost a row, not overflow the footer').toBeLessThanOrEqual(0);
});

test('the view bills header shows the region, route and area it was run for', async ({ page }) => {
  await page.addInitScript((json: string) => {
    sessionStorage.setItem('loadingDataViewBills', btoa(unescape(encodeURIComponent(json))));
  }, JSON.stringify({ ...viewBillPayload(90), other: SCOPE }));
  await page.goto('/print/view-bill/view/view-bill.html?message=1');
  await page.locator('.page').first().waitFor();

  const heading = (await page.locator('.page').first().locator('.floatrightp').innerText()).replace(/\s+/g, ' ');
  expect(heading).toContain('SHIVAMOGGA | NAGARA | Jaynagara');
  // Above the date range, not merged into it.
  expect(heading.indexOf('SHIVAMOGGA')).toBeLessThan(heading.indexOf('From'));

  expect(await page.locator('.page').count()).toBeGreaterThan(1);
  expect(await worstOverlap(page, '#bodytable', '.footDiv'),
    'the extra header line must cost a row, not overflow the footer').toBeLessThanOrEqual(0);
});

// A pre-existing defect found while adding the header above, and fixed with it: the view bills
// header block was a fixed 5% of the sheet, which its own content overflows as soon as there is a
// GSTIN to print - the last line ended up flush against the table header row below, reading as one
// run-together line.
//
// The assertion has to measure the TEXT, not the block: that block is a stretched flex item, so
// its own box bottom is the container's bottom by definition and always reports zero clearance
// whether the text inside fits or not. A Range over its contents gives the real line boxes.
test('the view bills company block clears the table below it', async ({ page }) => {
  await page.addInitScript((json: string) => {
    sessionStorage.setItem('loadingDataViewBills', btoa(unescape(encodeURIComponent(json))));
  }, JSON.stringify({ ...viewBillPayload(40), other: SCOPE }));
  await page.goto('/print/view-bill/view/view-bill.html?message=1');
  await page.locator('.page').first().waitFor();

  const clearance = await page.locator('.page').first().evaluate((pg) => {
    const range = document.createRange();
    range.selectNodeContents(pg.querySelector('.maintable')!);
    const textBottom = Math.max(...Array.from(range.getClientRects()).map((r) => r.bottom));
    return pg.querySelector('#bodytable')!.getBoundingClientRect().top - textBottom;
  });

  // Zero is the expected value, not a near miss: the block sizes exactly to its own content, so
  // its last line ends where the table begins and the table header's own padding carries the gap.
  // Against the fixed-height version this measured -17.9px, which is the overlap being guarded.
  expect(clearance, 'the company/GSTIN lines must not run into the table header').toBeGreaterThanOrEqual(0);
});

test('the loading list and view bills headers omit the scope line when it was not filtered', async ({ page }) => {
  await page.addInitScript((json: string) => {
    localStorage.setItem('loadingData', btoa(unescape(encodeURIComponent(json))));
  }, JSON.stringify(loadingListPayload(20)));
  await page.goto('/print/loading-list/view/loading-list.html?message=1');
  await page.locator('.page').first().waitFor();
  let heading = (await page.locator('.page').first().locator('.header-right p').innerText()).replace(/\s+/g, ' ').trim();
  expect(heading).not.toContain('|');
  expect(heading.startsWith('Brief')).toBe(true);

  await page.addInitScript((json: string) => {
    sessionStorage.setItem('loadingDataViewBills', btoa(unescape(encodeURIComponent(json))));
  }, JSON.stringify(viewBillPayload(20)));
  await page.goto('/print/view-bill/view/view-bill.html?message=1');
  await page.locator('.page').first().waitFor();
  heading = (await page.locator('.page').first().locator('.floatrightp').innerText()).replace(/\s+/g, ' ').trim();
  expect(heading).not.toContain('|');
  expect(heading.startsWith('From')).toBe(true);
});

test('the brief sale header omits the scope line when there is no region, route or area', async ({ page }) => {
  // A report run without those filters must look exactly as it did before, not gain an empty
  // line or a row of stray separators.
  await page.addInitScript((json: string) => {
    localStorage.setItem('temp_sale_report', btoa(unescape(encodeURIComponent(json))));
  }, JSON.stringify(briefSalePayload(20)));
  await page.goto('/print/brief-sale/view/brief-sale.html?message=1');
  await page.locator('.page').first().waitFor();

  const heading = (await page.locator('.page').first().locator('.floatrightp').innerText()).replace(/\s+/g, ' ').trim();
  expect(heading).not.toContain('|');
  expect(heading.startsWith('Brief')).toBe(true);
});
