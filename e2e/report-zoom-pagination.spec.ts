import { test, expect, chromium } from '@playwright/test';

// Pagination must not depend on the zoom the report was generated at.
//
// Amal and Sabhya both reported the transaction-wise report (brief-sale) printing rows through
// the footer and losing rows outright at a page boundary - "page one ends at 50, page two starts
// at 53" - after previewing at 75% or 80%. The cause is that `line-height: normal` is not
// proportional across zoom levels: Chrome derives it from the font's metrics and rounds to device
// pixels, so one row of this report measures 17px at 100%, 16.67px at 75% and 15.74px at 80%.
// Pagination budgets rows against a page box fixed in centimetres, so an 80% preview packed 40
// rows onto a sheet that has room for 35 when printed - and printing always renders at 100%,
// whatever the browser is zoomed to. The five rows over were painted past a box that is
// overflow:hidden, so they were not moved to the next sheet, they were gone.
//
// These tests drive real zoom through --force-device-scale-factor. That is a LAUNCH flag and is
// not the same thing as Playwright's deviceScaleFactor context option, which only overrides
// devicePixelRatio and leaves text metrics untouched - the note in report-layout-overlap.spec.ts
// says real zoom could not be driven here, and with the context option it could not. It can with
// this flag: against the unpinned layout these cases produce 36 / 40 / 35 rows on page one at
// 75 / 80 / 100%.
//
// The assertion is equality across zoom levels rather than an absolute row count, because that
// equality is exactly the property the printout depends on: whatever the preview decided, the
// print job lays out the same rows at 100% and must reach the same page breaks.

const COMPANY = {
  be_name: 'Lakshmi Home Industries', be_addline1: 'Abhiruchi Masala, NH-66, Thallur',
  be_addline2: 'Kundapura Udupi District', be_addline3: '', be_state: 'Karnataka',
  be_pin: '576230', be_phone: '9481977634', be_gstin: '29BOTPS8264Q1ZD'
};

const LONG_NAME = 'MANJUSHREE CHICKEN AND FRESH MUTTON SUPPLIERS - MAVINAKATTE MAIN ROAD BRANCH, MANGALORE DAKSHINA KANNADA';

// The zoom levels from the two reports, plus one either side.
const ZOOMS = [0.75, 0.8, 0.9, 1, 1.25];

function briefSalePayload(count: number) {
  return {
    other: {
      from_ref_no: '0', to_ref_no: '0', from_date: '01-Apr-2026', to_date: '07-Aug-2026',
      transaction_type: 'Sales'
    },
    company_details: COMPANY,
    loading_list_details: Array.from({ length: count }, (_, i) => ({
      row_sl: i + 1, reference: `HO/S/26/${String(i + 1).padStart(5, '0')}`, date: '01-Aug-26',
      paid_topay: 'Credit',
      // Every fifth row wraps onto more than one line. Rows of a single fixed height would make
      // the budget trivially stable and prove nothing.
      'Account Name': i % 5 === 0 ? `${LONG_NAME} ${i}` : `D P STORE MAIRKOME - ${i + 1}`,
      value: (100 + i * 7).toFixed(2)
    }))
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
      row_sl: i + 1, 'Brand Short Name': 'JABSONS', pro_code: `PRD${1000 + i}`,
      'Product Name': i % 5 === 0 ? `${LONG_NAME} ${i}` : `MDH GARAM MASALA ${i}`,
      pro_mrp: (50 + i).toFixed(2), qty: '12'
    }))
  };
}

const BE_DETAILS = {
  beb_name: COMPANY.be_name, beb_addline1: COMPANY.be_addline1, beb_addline2: COMPANY.be_addline2,
  beb_addline3: '', pin: COMPANY.be_pin, phone: COMPANY.be_phone, beb_gstin: COMPANY.be_gstin
};

function viewBillPayload(count: number) {
  return {
    heading: { name: 'View Bills' },
    be_details: BE_DETAILS,
    master_details: { tax_date: '01-04-2026 to 30-06-2026', consolidate_check: 2 },
    items: Array.from({ length: count }, (_, i) => {
      const basic = 1000 + i * 87.5;
      return {
        pmt_mid: 2328 + i, type: 'Purchase', date: '01-06-2026',
        reference: `P/26/${String(60 + i).padStart(5, '0')}`,
        account: 'JABSONS FOODS PVT LTD', account_name: 'JABSONS FOODS PVT LTD',
        products: i % 4 === 0 ? `${LONG_NAME} ${i}` : `MDH GARAM MASALA ${i}`,
        mrp: '70.000', qty: '24.000', rate: basic.toFixed(2),
        disc1: 0, disc1_amt: 0, disc2: 0, disc2_amt: 0, basic, tax_per: 18,
        taxes: Number((basic * 0.18).toFixed(2)), total: Number((basic * 1.18).toFixed(2))
      };
    })
  };
}

function gstSalePayload(count: number) {
  return {
    columns: [], heading: { name: 'Sales Register' },
    be_details: BE_DETAILS,
    master_details: { tax_date: '01-04-2026 to 30-06-2026' },
    items: Array.from({ length: count }, (_, i) => {
      const basic = Number((900 + i * 412.75).toFixed(2));
      return {
        pmt_mid: String(50824 + i), inouts: 'Outward', pstt_name: 'Sales', psttl2_name: 'Local Sales',
        pmt_doc_date: '2026-06-01', reference: `S/26/${String(47 + i).padStart(5, '0')}`,
        paidtopay: 'Credit',
        account_name: i % 4 === 0 ? `${LONG_NAME} ${i}` : `PINNACLE GLOBE ${i}`,
        GSTIN: '29ABCFP4059K1ZT', B2BB2C: 'B2B', gst_region: 'Local', gst_supply_type: 'Regular',
        basic_tot: basic, taxes_tot: Number((basic * 0.18).toFixed(2)), round_off: 0,
        total_value: Number((basic * 1.18).toFixed(2)), ExemptedBasic: 0,
        TaxableGST18: basic, TaxGST18: Number((basic * 0.18).toFixed(2))
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
  payload: unknown;
}

// Every report layout that paginates by measuring its own rows. All four had the same defect and
// all four are now pinned against it: a line box left to `normal`, and border-spacing, are both
// rounded to device pixels, so both moved with the zoom level and took the page breaks with them.
//
// The two invoice-shaped layouts are deliberately absent: the journal voucher prints two fixed
// rows and never paginates, and the invoice designs measure nothing per row.
const CASES: LayoutCase[] = [
  {
    id: 'brief-sale', url: '/print/brief-sale/view/brief-sale.html?message=1',
    storageKey: 'temp_sale_report', storage: 'local', table: '#maintable',
    payload: briefSalePayload(120)
  },
  {
    id: 'loading-list', url: '/print/loading-list/view/loading-list.html?message=1',
    storageKey: 'loadingData', storage: 'local', table: '.body-table',
    payload: loadingListPayload(120)
  },
  {
    id: 'view-bill', url: '/print/view-bill/view/view-bill.html?message=1',
    storageKey: 'loadingDataViewBills', storage: 'session', table: '#bodytable',
    payload: viewBillPayload(180)
  },
  {
    id: 'gst-sale', url: '/print/gst-sale/view/gst-sale.html?message=1',
    storageKey: 'temp_tax_register', storage: 'local', table: '#bodytable',
    payload: gstSalePayload(92)
  }
];

// Each case launches a whole browser per zoom level - the zoom has to be a launch flag, there
// being no way to change it at runtime - and five launches plus five full report renders runs to
// around 28 seconds, close enough to the 30s default to fail on timing alone when the suite is
// run alongside others. The work is genuinely this slow rather than stuck.
test.describe.configure({ timeout: 120_000 });

for (const layout of CASES) {
  test(`${layout.id}: paginates the same at every zoom level`, async () => {
    const results: Record<number, { perPage: number[]; worstClip: number }> = {};

    for (const zoom of ZOOMS) {
      const browser = await chromium.launch({ args: [`--force-device-scale-factor=${zoom}`] });
      try {
        const page = await browser.newPage();
        await page.addInitScript(
          ({ key, json, storage }: { key: string; json: string; storage: string }) => {
            const encoded = btoa(unescape(encodeURIComponent(json)));
            (storage === 'local' ? localStorage : sessionStorage).setItem(key, encoded);
          },
          { key: layout.storageKey, json: JSON.stringify(layout.payload), storage: layout.storage }
        );
        await page.goto(`http://localhost:4200${layout.url}`);
        await page.locator('.page').first().waitFor();
        await page.waitForTimeout(400);

        results[zoom] = await page.evaluate((tableSel: string) => {
          const pages = Array.from(document.querySelectorAll('.page'));
          return {
            perPage: pages.map((pg) =>
              Array.from(pg.querySelectorAll(`${tableSel} tr`)).filter((r) => r.querySelector('td')).length),
            // .page is overflow:hidden, so anything past its bottom edge is dropped from the sheet.
            worstClip: Math.max(...pages.map((pg) => {
              const table = pg.querySelector(tableSel);
              return table
                ? table.getBoundingClientRect().bottom - pg.getBoundingClientRect().bottom
                : -Infinity;
            }))
          };
        }, layout.table);
      } finally {
        await browser.close();
      }
    }

    const reference = results[1];
    expect(reference.perPage.length, 'the fixture must span several pages').toBeGreaterThan(1);

    for (const zoom of ZOOMS) {
      expect(
        results[zoom].perPage,
        `rows per page at ${zoom * 100}% must match what printing at 100% lays out`
      ).toEqual(reference.perPage);
      expect(
        results[zoom].worstClip,
        `no row may fall past the sheet at ${zoom * 100}%`
      ).toBeLessThanOrEqual(0);
    }
  });
}
