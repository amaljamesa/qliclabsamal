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
}
