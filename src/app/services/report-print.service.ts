import { Injectable } from '@angular/core';

// UTF-8 safe base64 encode - mirrors the base64ToUtf8 decode every report layout expects.
// Plain btoa() throws on any multi-byte character (₹, accented names), so this must stay in
// step with the decode side rather than being simplified away.
function utf8ToBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

// Which storage key each layout reads its payload from. These are the keys the layouts
// themselves already look up (they predate this app), so they're dictated by the layouts,
// not chosen here - changing one means changing that layout's own lookup to match.
type StorageKind = 'local' | 'session';

interface ReportTarget {
  key: string;
  storage: StorageKind;
  label: string;
}

const REPORT_TARGETS: Record<string, ReportTarget> = {
  'loading-list': { key: 'loadingData', storage: 'local', label: 'Loading List' },
  'view-bill': { key: 'loadingDataViewBills', storage: 'session', label: 'View Bills' },
  'journal-voucher': { key: 'journalVoucherData', storage: 'local', label: 'Journal Voucher' },
  'gst-sale': { key: 'temp_tax_register', storage: 'local', label: 'GST Sales Register' },
  'brief-sale': { key: 'temp_sale_report', storage: 'local', label: 'Brief Sale Report' }
};

export const REPORT_LAYOUTS = Object.entries(REPORT_TARGETS).map(([id, target]) => ({
  id,
  label: target.label
}));

@Injectable({ providedIn: 'root' })
export class ReportPrintService {
  // Opens a layout's responsive preview, stashing the payload where that layout reads it
  // from. Same handoff the invoice/ledger previews already use: the data goes through
  // storage rather than the URL because a full report's JSON comfortably exceeds what a
  // query string can carry, while `?message=1` stays as the flag the layouts check.
  openReportPreview(reportId: string, data: unknown): void {
    const target = REPORT_TARGETS[reportId];
    if (!target) {
      console.error('Unknown report layout:', reportId);
      return;
    }
    const encoded = utf8ToBase64(JSON.stringify(data));
    const store = target.storage === 'session' ? sessionStorage : localStorage;
    store.setItem(target.key, encoded);
    window.open(`/print/report/${reportId}?message=1`, '_blank');
  }

  // Opens a layout preloaded with the sample payload below. Mirrors the bulk-print
  // stand-in already in InvoicePrintService: these five layouts have no real data source
  // wired up in this app yet, so the samples are what make the previews testable now and
  // are the single place to swap for a real API call later.
  openSampleReportPreview(reportId: string): void {
    const sample = SAMPLE_REPORT_DATA[reportId];
    if (!sample) {
      console.error('No sample data for report layout:', reportId);
      return;
    }
    this.openReportPreview(reportId, sample);
  }
}

const COMPANY_DETAILS = {
  be_name: 'Sunshine Limited',
  be_state: 'Karnataka',
  be_addline1: '5th Floor Bejai',
  be_addline2: 'Bangalore',
  be_addline3: '',
  be_gstin: '29AABXG0724Q8Z9',
  be_pin: '560026',
  be_phone: '7777777777'
};

const BE_DETAILS = {
  beb_name: 'Sunshine Limited',
  beb_addline1: '5th Floor Bejai',
  beb_addline2: 'Bangalore',
  beb_addline3: '',
  beb_pin: '560026',
  beb_phone: '7777777777',
  beb_gstin: '29AABXG0724Q8Z9',
  from_date: '01-04-2026',
  to_date: '30-06-2026'
};

const PRODUCT_NAMES = [
  'JABSON P NUT KARI SING NARIYAL', 'JABSON P NUT KHARI SING SKIN', 'MDH GARAM MASALA 100GM',
  'MDH CHANA MASALA 100GM', 'R-PURE YELLOW CHILLI POWDER', 'SNAPIN CHILLI FLAKES 35GM',
  'JABSONS KHAKRA GOLGAPPA 180', 'MUKUNDA CASHEW SALTED 100GM', 'MDH KASOORI METHI 500GM',
  'JABSONS SOYA STICKS TANGY TOMATO', 'MDH DEGGI CHILLY 100GM', 'SNAPIN ONION POWDER 40GM'
];

// Deliberately more rows than fit on one page, so the previews exercise real multi-page
// pagination (and the page-break/footer handling that goes with it) rather than only ever
// showing the easy single-page case.
function buildLoadingListRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    row_sl: index + 1,
    'Brand Short Name': ['JABSONS', 'MDH', 'R-PURE', 'SNAPIN'][index % 4],
    pro_code: `PRD${String(1000 + index)}`,
    'Product Name': PRODUCT_NAMES[index % PRODUCT_NAMES.length],
    pro_mrp: (50 + (index % 20) * 7.5).toFixed(2),
    qty: String(12 * ((index % 8) + 1))
  }));
}

function buildBriefSaleRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    row_sl: index + 1,
    reference: `S/26/${String(100 + index).padStart(5, '0')}`,
    date: `${String((index % 28) + 1).padStart(2, '0')}-Jun-26`,
    paid_topay: index % 3 === 0 ? 'Credit' : 'Paid',
    'Account Name': ['Walk In', 'PINNACLE GLOBE', 'PAI CATERERS', 'RIGID FORMS', 'DINESH NAIK'][index % 5],
    value: (500 + index * 137.25).toFixed(2)
  }));
}

function buildViewBillRows(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const basic = 1000 + index * 87.5;
    const taxPer = [5, 12, 18][index % 3];
    const taxes = Number((basic * (taxPer / 100)).toFixed(2));
    return {
      pmt_mid: 2328 + index,
      type: 'Purchase',
      date: `${String((index % 28) + 1).padStart(2, '0')}-06-2026`,
      reference: `P/26/${String(60 + Math.floor(index / 4)).padStart(5, '0')}`,
      account: 'JABSONS FOODS PVT LTD A-2 Bholav, Udyog Na',
      account_name: 'JABSONS FOODS PVT LTD',
      products: PRODUCT_NAMES[index % PRODUCT_NAMES.length],
      mrp: (70 + (index % 10) * 10).toFixed(3),
      qty: String(24 * ((index % 4) + 1)) + '.000',
      rate: (40 + (index % 15) * 3.2).toFixed(3),
      disc1: '0.00',
      disc1_amt: 0,
      disc2: '0.00',
      disc2_amt: 0,
      basic: Number(basic.toFixed(2)),
      tax_per: taxPer,
      taxes,
      total: Number((basic + taxes).toFixed(2))
    };
  });
}

function buildGstSaleRows(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const basic = Number((900 + index * 412.75).toFixed(2));
    const taxes = Number((basic * 0.18).toFixed(2));
    const isB2b = index % 3 !== 0;
    return {
      pmt_mid: String(50824 + index),
      inouts: 'Outward',
      pstt_name: 'Sales',
      psttl2_name: 'Local Sales',
      pmt_doc_date: `2026-06-${String((index % 28) + 1).padStart(2, '0')}`,
      reference: `S/26/${String(47 + index).padStart(5, '0')}`,
      paidtopay: index % 2 === 0 ? 'Paid-Cash' : 'Credit',
      account_name: ['Walk In', 'PINNACLE GLOBE', 'Pailands Interiors', 'PAI CATERERS'][index % 4],
      GSTIN: isB2b ? '29ABCFP4059K1ZT' : '',
      B2BB2C: isB2b ? 'B2B' : 'B2C',
      gst_region: 'Local',
      gst_supply_type: 'Regular',
      basic_tot: basic,
      taxes_tot: taxes,
      round_off: 0,
      total_value: Number((basic + taxes).toFixed(2)),
      ExemptedBasic: 0,
      Tax0Basic: 0,
      Tax0Tax: 0,
      Tax5Basic: 0,
      Tax5Tax: 0,
      Tax12Basic: 0,
      Tax12Tax: 0,
      Tax18Basic: basic,
      Tax18Tax: taxes
    };
  });
}

// Sample payloads, one per layout, shaped exactly as each layout's own code reads it.
// Row counts are chosen to span several pages so pagination is actually exercised.
const SAMPLE_REPORT_DATA: Record<string, unknown> = {
  'loading-list': {
    other: {
      from_ref_no: '',
      to_ref_no: '',
      from_date: '01-04-2026',
      to_date: '30-06-2026',
      transaction_type: 'Sales',
      page_size: 'a4'
    },
    config: { main_table_border: true },
    company_details: COMPANY_DETAILS,
    loading_list_details: buildLoadingListRows(95)
  },

  'view-bill': {
    columns: [],
    be_details: BE_DETAILS,
    heading: { name: 'Bill Register' },
    master_details: { tax_date: '30-06-2026', consolidate_check: 0 },
    items: buildViewBillRows(70)
  },

  'journal-voucher': {
    beb_details: {
      beb_name: 'Sunshine Limited',
      beb_address: '5th Floor Bejai<br>Bangalore',
      beb_pin: '560026',
      beb_phone: '7777777777',
      beb_gstin: '29AABXG0724Q8Z9'
    },
    journal_voucher_details: [
      {
        journal_date: '2026-06-19',
        journal_unique_id: 'J609',
        byto: 'By',
        drcr: 'Debit',
        account: 'Office Rent',
        debit: 25000.0,
        credit: 0.0,
        narration: ''
      },
      {
        journal_date: '2026-06-19',
        journal_unique_id: 'J609',
        byto: 'To',
        drcr: 'Credit',
        account: 'Cash in hand',
        debit: 0.0,
        credit: 25000.0,
        narration: 'Being office rent paid for the month of June 2026.'
      }
    ]
  },

  'gst-sale': {
    columns: [],
    be_details: BE_DETAILS,
    heading: { name: 'Sales Register' },
    master_details: { tax_date: '01-04-2026 to 30-06-2026' },
    items: buildGstSaleRows(55)
  },

  'brief-sale': {
    other: {
      from_ref_no: '',
      to_ref_no: '',
      from_date: '01-04-2026',
      to_date: '30-06-2026',
      transaction_type: 'Sales'
    },
    company_details: COMPANY_DETAILS,
    loading_list_details: buildBriefSaleRows(120)
  }
};
