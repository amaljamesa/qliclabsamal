import { Injectable } from '@angular/core';
import { applyPaperSize, CARRIED_TOTAL_DEMO_INVOICE, HARDCODED_BULK_TEST_INVOICE, PaperSize } from './invoice-print.service';
import { PreviewDialogService } from './preview-dialog.service';
import { getPreviewPayload, setPreviewPayload } from './preview-payload';

// Re-exported so the report preview keeps importing everything it needs from one place; the
// type lives with the payload helpers in invoice-print.service.
export type { PaperSize };


// The key each layout looks its payload up by. These are the keys the layouts themselves
// already use (they predate this app), so they're dictated by the layouts, not chosen here -
// changing one means changing that layout's own lookup to match. They were Web Storage keys
// originally; they are now just the name a payload is handed over under (preview-payload.ts),
// which is why nothing here records which store a layout used to read.
interface ReportTarget {
  key: string;
  label: string;
  // Only the invoice designs render at more than one paper size (from the same HTML - the
  // size is a field in the payload). Listing them here is what puts the A4/A5 switch on
  // their preview; the layouts without it never show one.
  paperSizes?: PaperSize[];
  // Puts an HSN summary switch on the preview. Same idea as the paper size: the summary is a
  // flag in the payload, so turning it off is a re-render of the same layout rather than a
  // different one. Only worth offering where the layout draws a summary at all.
  hsnToggle?: boolean;
}

const REPORT_TARGETS: Record<string, ReportTarget> = {
  'loading-list': { key: 'loadingData', label: 'Loading List' },
  'view-bill': { key: 'loadingDataViewBills', label: 'View Bills' },
  'journal-voucher': { key: 'journalVoucherData', label: 'Journal Voucher' },
  'gst-sale': { key: 'temp_tax_register', label: 'GST Sales Register' },
  'brief-sale': { key: 'temp_sale_report', label: 'Brief Sale Report' },
  // Alternative invoice designs. Same payload and same key as the main invoice layout - only
  // the HTML design differs between them.
  'invoice-d2': { key: 'temp_inv_data', label: 'Invoice Design 2', paperSizes: ['a4', 'a5'] },
  'invoice-d3': { key: 'temp_inv_data', label: 'Invoice Design 3', paperSizes: ['a4', 'a5'] },
  'invoice-d4': { key: 'temp_inv_data', label: 'Invoice Design 4', paperSizes: ['a4', 'a5'] },
  // The main invoice layout, loaded with enough lines that the total is carried onto a page of
  // its own. Listed here because nothing else in the app reaches that page: the invoice preview
  // and the bulk print both show a sample that fits on one sheet, so the padding that page gets
  // could only be seen from a test fixture.
  'invoice-carried-total': { key: 'temp_inv_data', label: 'Invoice - total on its own page' },
  // The same invoice with the HSN summary switched on, so the two can be shown side by side.
  // The summary follows the total over and fills most of that page, which is a different picture
  // from the total sitting alone - both are worth being able to point at.
  'invoice-carried-total-hsn': { key: 'temp_inv_data', label: 'Invoice - total on its own page (with HSN)' },
  // Every optional column at once - HSN/SAC, MRP, both discounts and the tax rate - which is the
  // shape a real customer invoice takes and which none of the other samples exercise. The header
  // row is where it shows: at ten columns the narrow ones have less width than their own titles
  // need, so "HSN/SAC" and "MRP" run into each other, as do "Disc2.%" and "Tax%".
  'invoice-all-fields': { key: 'temp_inv_data', label: 'Invoice - all fields', hsnToggle: true }
};

export const REPORT_LAYOUTS = Object.entries(REPORT_TARGETS).map(([id, target]) => ({
  id,
  label: target.label
}));

@Injectable({ providedIn: 'root' })
export class ReportPrintService {
  constructor(private previewDialog: PreviewDialogService) {}

  // Opens a layout's responsive preview as a dialog over the current screen, handing the
  // payload over under the key that layout looks itself up by. Same handoff the invoice and
  // ledger previews use: the object goes across in memory rather than through the URL or Web
  // Storage, neither of which can carry a full report's JSON (see preview-payload.ts). The
  // /print/report/:report route still serves the same preview for anyone opening it directly.
  openReportPreview(reportId: string, data: unknown): void {
    const target = REPORT_TARGETS[reportId];
    if (!target) {
      console.error('Unknown report layout:', reportId);
      return;
    }
    // Before the dialog opens, because opening it is what creates the iframe that reads this.
    setPreviewPayload(target.key, data);
    this.previewDialog.open({ kind: 'report', title: target.label, reportId });
  }

  // Opens a layout preloaded with the sample payload below. Mirrors the bulk-print
  // stand-in already in InvoicePrintService: these layouts have no real data source
  // wired up in this app yet, so the samples are what make the previews testable now and
  // are the single place to swap for a real API call later.
  // Which paper sizes a layout can render, if it can render more than one. The preview uses
  // this to decide whether to offer a size switch at all.
  getPaperSizes(reportId: string): PaperSize[] | undefined {
    return REPORT_TARGETS[reportId]?.paperSizes;
  }

  // Re-stamps the payload already loaded in the preview with a different paper size. These
  // layouts render A4 and A5 from the same HTML - the size lives in the payload, not in the
  // file - so switching is a matter of editing one field and reloading, with no need to go
  // back to wherever the data originally came from. Deliberately edits the payload rather than
  // rebuilding the sample, so this keeps working once real invoice data is wired up.
  setStoredPaperSize(reportId: string, pageSize: PaperSize): boolean {
    const target = REPORT_TARGETS[reportId];
    if (!target) {
      return false;
    }
    const payload = getPreviewPayload(target.key);
    if (!payload) {
      return false;
    }
    applyPaperSize(payload, pageSize);
    return true;
  }

  // Whether this layout's preview should offer an HSN summary switch.
  supportsHsnToggle(reportId: string): boolean {
    return REPORT_TARGETS[reportId]?.hsnToggle === true;
  }

  /** Whether the payload currently loaded in the preview asks for an HSN summary. */
  isHsnSummaryOn(reportId: string): boolean {
    const invoice = firstInvoiceOf(reportId);
    return invoice?.config?.print_hsn_summary === true;
  }

  // Flips the flag on the payload already loaded and reports whether anything changed, so the
  // caller knows to reload the frame. Edits the payload rather than rebuilding the sample, for
  // the same reason setStoredPaperSize does: it keeps working once real invoice data is wired up.
  setHsnSummary(reportId: string, on: boolean): boolean {
    const invoice = firstInvoiceOf(reportId);
    if (!invoice?.config) {
      return false;
    }
    invoice.config.print_hsn_summary = on;
    return true;
  }

  openSampleReportPreview(reportId: string, pageSize: PaperSize = 'a4'): void {
    const sample = INVOICE_DESIGN_IDS.includes(reportId)
      ? buildInvoiceDesignSample(pageSize)
      : SAMPLE_REPORT_DATA[reportId];
    if (!sample) {
      console.error('No sample data for report layout:', reportId);
      return;
    }
    this.openReportPreview(reportId, sample);
  }
}

const INVOICE_DESIGN_IDS = ['invoice-d2', 'invoice-d3', 'invoice-d4'];

// Names for the all-fields demo, long enough that the description column wraps the way a real
// customer's does rather than sitting on one tidy line.
const ALL_FIELDS_PRODUCT_NAMES = [
  'MDH DEGGI MIRCH CHILLY POWDER 100GM',
  'JABSONS P NUT KARI SING NARIYAL 200GM',
  'R-PURE YELLOW CHILLI POWDER 500GM POUCH',
  'MUKUNDA CASHEW SALTED 100GM',
  'SNAPIN CHILLI FLAKES 35GM',
  'BASMATI RICE PREMIUM LONG GRAIN 5KG BAG',
  'MDH KASOORI METHI 500GM CANISTER',
  'FILTER COFFEE POWDER 80:20 500GM'
];

// The invoice payloads travel either bare or wrapped in { invoices: [...] } - a bulk print sends
// the array, a single preview sends the invoice itself - so both shapes are unwrapped here rather
// than at every call site.
interface InvoicePayloadShape {
  config?: { print_hsn_summary?: boolean };
}

function firstInvoiceOf(reportId: string): InvoicePayloadShape | null {
  const target = REPORT_TARGETS[reportId];
  if (!target) {
    return null;
  }
  const payload = getPreviewPayload(target.key) as
    { invoices?: InvoicePayloadShape[] } & InvoicePayloadShape | null;
  if (!payload) {
    return null;
  }
  return Array.isArray(payload.invoices) ? payload.invoices[0] ?? null : payload;
}

// The invoice designs read the same JSON schema as the main invoice layout, so their sample
// is that layout's payload rather than a second copy that would drift from it. Two changes
// on top: the item list is stretched well past a single page (the original 11 rows fit on
// one A4 sheet, which would never exercise pagination), and the bank/UPI fields are filled
// in so the footer block these designs put under the totals is actually rendered.
function buildInvoiceDesignSample(pageSize: PaperSize): unknown {
  const source = HARDCODED_BULK_TEST_INVOICE;
  const items = Array.from({ length: 26 }, (_, index) => ({
    ...source.items[index % source.items.length],
    sl_no: index + 1
  }));

  return {
    ...source,
    items,
    footer: [
      { value: 'HDFC Bank A/c 50200012345678, IFSC HDFC0001234' },
      { value: 'GSTIN 29AABXG0724Q8Z9' },
      { value: '5th Floor Bejai, Bangalore 560026' }
    ],
    others: {
      ...source.others,
      page_size: pageSize,
      upi_id: 'upi://pay?pa=sunshine@hdfcbank&pn=Sunshine%20Limited'
    }
  };
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

// Deliberately mixes in names long enough to wrap onto two and three lines. The sample data
// used to be five short names, every row exactly one line tall - which is why the footer
// overlap Priyanka reported (Slack, 2026-08-07) never showed up here, even though it was
// reproducible on real customer data straight away. A sample that only exercises the easy
// case is what let a row-height bug sit in a layout nobody could see it in.
const BRIEF_SALE_ACCOUNT_NAMES = [
  'Walk In',
  'PINNACLE GLOBE',
  'MANJUSHREE CHICKEN AND FRESH MUTTON SUPPLIERS - MAVINAKATTE MAIN ROAD BRANCH, MANGALORE DAKSHINA KANNADA',
  'PAI CATERERS',
  'SRI DURGA HOME NEEDS AND GENERAL STORE - SHIROOR VILLAGE, KUNDAPURA TALUK, UDUPI DISTRICT KARNATAKA 576222',
  'RIGID FORMS',
  // No spaces to wrap at - checks that a single unbroken name breaks mid-word instead of
  // widening its column and pushing the Amount column off the sheet.
  'SUPERCALIFRAGILISTICEXPIALIDOCIOUSTRADINGCOMPANYPRIVATELIMITEDMANGALOREBRANCH',
  'DINESH NAIK'
];

function buildBriefSaleRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    row_sl: index + 1,
    reference: `S/26/${String(100 + index).padStart(5, '0')}`,
    date: `${String((index % 28) + 1).padStart(2, '0')}-Jun-26`,
    paid_topay: index % 3 === 0 ? 'Credit' : 'Paid',
    'Account Name': BRIEF_SALE_ACCOUNT_NAMES[index % BRIEF_SALE_ACCOUNT_NAMES.length],
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
      page_size: 'a4',
      // Shown above the report title, so a printed copy records which slice of the business it
      // covers - the same header the brief sale report carries (Priyanka, Slack 2026-08-11).
      region_name: 'SHIVAMOGGA',
      route_name: 'NAGARA',
      area_name: 'Jaynagara'
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
    // Shown above the date range, so a printed copy records which slice of the business it covers
    // (Priyanka, Slack 2026-08-11). In its own object because this layout's schema has no agreed
    // home for these - see the comment on `other` in view-bill.html.
    other: {
      region_name: 'SHIVAMOGGA',
      route_name: 'NAGARA',
      area_name: 'Jaynagara'
    },
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

  'invoice-carried-total': { invoices: [CARRIED_TOTAL_DEMO_INVOICE] },

  // The reference Priyanka sent is an invoice with every optional column turned on, which is
  // what a real customer's looks like and what none of the other samples cover. Built from the
  // same base payload so only the columns differ.
  'invoice-all-fields': {
    invoices: [{
      ...CARRIED_TOTAL_DEMO_INVOICE,
      config: { ...CARRIED_TOTAL_DEMO_INVOICE.config, print_hsn_summary: true },
      // Ten columns, in the order the reference shows them.
      product_columns: [
        { id: '1', name: 'sl_no', visible: '', sequence: '', display_name: 'SL' },
        { id: '6', name: 'pro_name', visible: '', sequence: '', display_name: 'Description of Goods/Services' },
        { id: '10', name: 'hsn', visible: '', sequence: '', display_name: 'HSN/SAC' },
        { id: '18', name: 'mrp', visible: '', sequence: '', display_name: 'MRP' },
        { id: '14', name: 'qty', visible: '', sequence: '', display_name: 'Qty' },
        { id: '17', name: 'rate', visible: '', sequence: '', display_name: 'Rate' },
        { id: '20', name: 'disc1_per', visible: '', sequence: '', display_name: 'Disc.%' },
        { id: '22', name: 'disc2_per', visible: '', sequence: '', display_name: 'Disc2.%' },
        { id: '25', name: 'tax_rate', visible: '', sequence: '', display_name: 'Tax%' },
        { id: '26', name: 'amount', visible: '', sequence: '', display_name: 'Amount' }
      ],
      // Values in every one of those columns, so no cell is empty by accident and the widths are
      // tested against real content rather than blanks.
      items: CARRIED_TOTAL_DEMO_INVOICE.items.map((item, index) => ({
        ...item,
        sl_no: index + 1,
        // The base payload carries placeholders like "nan" and "N/A" in its name column, which
        // read as a bug rather than as sample data on a page whose whole point is being looked at.
        pro_name: ALL_FIELDS_PRODUCT_NAMES[index % ALL_FIELDS_PRODUCT_NAMES.length],
        hsn: ['09042211', '21069099', '30049099', '34011190'][index % 4],
        mrp: (100 + index * 12.5).toFixed(2),
        disc1_per: String(5 + (index % 3)),
        disc2_per: String(2 + (index % 2)),
        tax_rate: ['5', '12', '18'][index % 3]
      }))
    }]
  },

  'invoice-carried-total-hsn': {
    invoices: [{
      ...CARRIED_TOTAL_DEMO_INVOICE,
      config: { ...CARRIED_TOTAL_DEMO_INVOICE.config, print_hsn_summary: true }
    }]
  },

  'brief-sale': {
    other: {
      from_ref_no: '',
      to_ref_no: '',
      from_date: '01-04-2026',
      to_date: '30-06-2026',
      transaction_type: 'Sales',
      // Shown above the report title, so a printed copy records which slice of the business
      // it covers (Priyanka, Slack 2026-08-07).
      region_name: 'SHIVAMOGGA',
      route_name: 'NAGARA',
      area_name: 'Jaynagara'
    },
    company_details: COMPANY_DETAILS,
    loading_list_details: buildBriefSaleRows(120)
  }
};
