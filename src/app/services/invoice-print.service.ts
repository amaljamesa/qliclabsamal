import { Injectable } from '@angular/core';
import { DataService, Invoice, InvoiceItem } from './data.service';
import { PreviewDialogService } from './preview-dialog.service';
import { getPreviewPayload, setPreviewPayload } from './preview-payload';

// Decodes a payload left by an older build, which is the only thing that still writes base64
// into Web Storage - see readInvoicePayload. Nothing here encodes any more: the layouts read
// the live object off the parent window instead (see preview-payload.ts for why).
function base64ToUtf8(value: string): string {
  return decodeURIComponent(escape(atob(value)));
}

// Where every invoice layout looks for its payload. Dictated by the layouts themselves (they
// predate this app), so it is named once here rather than spelled out at each use.
export const INVOICE_STORAGE_KEY = 'temp_inv_data';

export type PaperSize = 'a4' | 'a5';

// The invoice layouts, all reading the same payload from the same storage key - only the
// HTML design differs between them, which is what lets the preview switch designs by
// pointing its frame at a different file, with nothing else to change.
export interface InvoiceLayoutOption {
  id: string;
  label: string;
  src: string;
}

export const INVOICE_LAYOUTS: InvoiceLayoutOption[] = [
  { id: 'default', label: 'Default (classic grid)', src: '/print/invoice/view/invoice.html?message=1' },
  { id: 'd2', label: 'Design 2 - Centred title', src: '/print/invoice-d2/view/invoice-d2.html?message=1' },
  { id: 'd3', label: 'Design 3 - Blue table', src: '/print/invoice-d3/view/invoice-d3.html?message=1' },
  { id: 'd4', label: 'Design 4 - Blue rules', src: '/print/invoice-d4/view/invoice-d4.html?message=1' },
  { id: 'd5', label: 'Design 5 - Minimal mono', src: '/print/invoice-d5/view/invoice-d5.html?message=1' },
  { id: 'd6', label: 'Design 6 - Colour band', src: '/print/invoice-d6/view/invoice-d6.html?message=1' },
  { id: 'd7', label: 'Design 7 - Corporate grid', src: '/print/invoice-d7/view/invoice-d7.html?message=1' },
  { id: 'd8', label: 'Design 8 - Accent rail', src: '/print/invoice-d8/view/invoice-d8.html?message=1' },
  { id: 'd9', label: 'Design 9 - Elegant serif', src: '/print/invoice-d9/view/invoice-d9.html?message=1' },
  { id: 'd10', label: 'Design 10 - Dark header', src: '/print/invoice-d10/view/invoice-d10.html?message=1' }
];

// A bulk print payload carries one entry per invoice; a single preview is the invoice itself.
// Normalised here so nothing downstream has to know which of the two shapes it is holding.
function invoicesOf(payload: any): Record<string, any>[] {
  return Array.isArray(payload?.invoices) ? payload.invoices : [payload];
}

// Stamps a different paper size onto a payload in place. The layouts render A4 and A5 from the
// same HTML - the size is a field in the payload, not a property of the file - so a size switch
// is this one edit plus a frame reload. Shared with ReportPrintService so both previews change
// size by exactly the same route.
//
// Mutates rather than rebuilding: the layout is holding this very object (see
// preview-payload.ts), so editing it is what the reload then picks up. Rebuilding would also
// mean re-serialising a whole bulk batch to change one field per invoice.
export function applyPaperSize(payload: unknown, pageSize: PaperSize): void {
  for (const invoice of invoicesOf(payload)) {
    if (invoice) {
      invoice['others'] = { ...(invoice['others'] ?? {}), page_size: pageSize };
    }
  }
}

// The payload the preview currently holds, as the live object every layout is rendering.
//
// Falls back to a base64 payload left in sessionStorage by an older build - a tab opened before
// this deploy, say - and promotes it into the in-memory bridge on the way through, so that from
// then on it behaves like any other payload (including being mutable by the paper-size switch,
// which no longer writes anything back to storage).
export function readInvoicePayload(): unknown | null {
  const live = getPreviewPayload(INVOICE_STORAGE_KEY);
  if (live) {
    return live;
  }

  const stored = sessionStorage.getItem(INVOICE_STORAGE_KEY);
  if (!stored) {
    return null;
  }
  try {
    const payload = JSON.parse(base64ToUtf8(stored));
    setPreviewPayload(INVOICE_STORAGE_KEY, payload);
    return payload;
  } catch (error) {
    console.error('Could not read the stored invoice payload:', error);
    return null;
  }
}

// The invoices the preview currently holds, normalised to an array. Shared by the two exports
// that read the payload rather than the rendered design (Excel and PDF filenames), so neither
// has to know which shape it is looking at. Null means there is nothing usable - already
// logged, so callers only have to decide what to do about it.
export function readStoredInvoices(): Record<string, any>[] | null {
  const payload = readInvoicePayload();
  if (!payload) {
    console.error('No invoice payload available - nothing to read.');
    return null;
  }
  return invoicesOf(payload);
}

// The download filename (without extension) for the invoice(s) in the preview. Shared so the
// Excel and PDF exports of the same invoice land next to each other in the user's downloads
// folder under matching names instead of drifting apart.
export function invoiceFileBaseName(invoices: Record<string, any>[]): string {
  if (invoices.length > 1) {
    return `invoices-${invoices.length}`;
  }
  const raw = String(invoices[0]?.['master_details']?.['inv_no'] ?? '').trim();
  // The bulk print sample data uses these as "no value" placeholders - a file called
  // invoice-nan says less than a plain invoice.
  const meaningful = raw === 'nan' || raw === 'N/A' || raw === 'null' ? '' : raw;
  // Invoice numbers legitimately contain slashes (e.g. "INV/26-27/001"), which a filename
  // cannot.
  const invoiceNo = meaningful.replace(/[^A-Za-z0-9._-]+/g, '-');
  return invoiceNo ? `invoice-${invoiceNo}` : 'invoice';
}

function formatInvoiceDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  return `${day}-${month}-${date.getFullYear()}`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigitsToWords(n: number): string {
  if (n < 20) {
    return ONES[n];
  }
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${TENS[tens]}${ones ? ' ' + ONES[ones] : ''}`;
}

function threeDigitsToWords(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) {
    parts.push(`${ONES[hundreds]} Hundred`);
  }
  if (rest) {
    parts.push(twoDigitsToWords(rest));
  }
  return parts.join(' ');
}

// Indian numbering system (lakh/crore), whole rupees only - matches the "Amount Chargeable
// (in words)" line the invoice layout renders under the item table.
function amountToWords(amount: number): string {
  const whole = Math.round(amount);
  if (whole === 0) {
    return 'Rupees Zero Only';
  }
  const crore = Math.floor(whole / 10000000);
  const lakh = Math.floor((whole % 10000000) / 100000);
  const thousand = Math.floor((whole % 100000) / 1000);
  const hundred = whole % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigitsToWords(crore)} Crore`);
  if (lakh) parts.push(`${threeDigitsToWords(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigitsToWords(thousand)} Thousand`);
  if (hundred) parts.push(threeDigitsToWords(hundred));

  return `Rupees ${parts.join(' ')} Only`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseTaxPercent(taxRate: string): number {
  const match = (taxRate || '').match(/(\d+(\.\d+)?)\s*%/);
  return match ? parseFloat(match[1]) : 0;
}

interface TaxGroup {
  taxRate: string;
  percent: number;
  taxableValue: number;
  centralTaxAmount: number;
  stateTaxAmount: number;
}

@Injectable({
  providedIn: 'root'
})
export class InvoicePrintService {
  constructor(
    private dataService: DataService,
    private previewDialog: PreviewDialogService
  ) {}

  // Maps this app's real Invoice record onto the target JSON schema the invoice print layout
  // (public/print/invoice/view/invoice.html) expects. The layout's schema covers far more
  // than this app currently captures per invoice (HSN codes, ship-to address, e-invoice IRN,
  // bank details, signature, terms) - config toggles for all of that are left off/empty
  // rather than faked, same approach ledger.service.ts already takes for the ledger's
  // company_details. Fields that genuinely exist on the Invoice/InvoiceItem models (party
  // name, item name/qty/rate/amount, totals, tax rate) map through directly.
  buildInvoiceData(invoice: Invoice, pageSize: PaperSize = 'a4'): unknown {
    const taxGroups = this.buildTaxGroups(invoice.items);
    const totalCentralTax = round2(taxGroups.reduce((sum, g) => sum + g.centralTaxAmount, 0));
    const totalStateTax = round2(taxGroups.reduce((sum, g) => sum + g.stateTaxAmount, 0));
    const totalTax = round2(totalCentralTax + totalStateTax);
    const totalQty = invoice.items.reduce((sum, item) => sum + (item.qty || 0), 0);

    return {
      heading: { name: 'Tax Invoice', sub_name: '' },
      copies: [{ type: 'Original', typeOfCopy: 0 }],
      config: {
        is_canceled: false,
        be_details: true,
        bill_to: true,
        ship_to: false,
        display_desc: 0,
        is_packing_slip: false,
        print_hsn_summary: taxGroups.length > 0,
        print_tax_summary: false,
        display_arrears: false,
        tax_in_words: false,
        show_amt_in_words: true,
        logo_watermark: false,
        is_rcm: false,
        authorised_signatory: true,
        include_signature: false,
        authorised_border: true,
        include_payment_qrcode: false,
        footer_date: true
      },
      design: { logo: '', signature: '' },
      // Hardcoded to match the company already used for the ledger (ledger.service.ts) -
      // this app has no business-entity settings screen yet (BrandWindowConfig is the
      // closest thing, but is scoped to the customer weblink branding, not GST/tax-invoice
      // fields like FSSAI number).
      be_details: {
        beb_name: 'Eprise Activity - Bejai',
        beb_addline1: 'PVS Building',
        beb_addline2: 'Kodialbail',
        beb_addline3: '',
        pin: '575003',
        fssai_number: '',
        phone: '',
        beb_gstin: ''
      },
      bill_to: {
        party_name: invoice.partyName,
        party_add1: '',
        party_add2: '',
        party_add3: '',
        party_pin: '',
        party_phone: '',
        party_gstin: ''
      },
      ship_to: {
        name: '', add1: '', add2: '', add3: '', pin: '', phone: '', gstin: ''
      },
      master_details: {
        inv_no: invoice.invoiceNo,
        pmt_doc_date: formatInvoiceDate(invoice.date),
        place_supply: '',
        paid_topay: invoice.paymentType || invoice.paymentMode || '',
        doc_reference: '',
        due_by_date: '',
        master_transaction: 2
      },
      inv_att: [],
      product_columns: [
        { name: 'sl_no', display_name: 'SL' },
        { name: 'pro_name', display_name: 'Description of Goods' },
        { name: 'qty', display_name: 'Qty' },
        { name: 'rate', display_name: 'Rate' },
        { name: 'amount', display_name: 'Amount' }
      ],
      hsncolumns: [
        { display_name: 'HSN/SAC' },
        { display_name: 'Taxable Value' },
        { display_name: 'Central Tax', display_name_rate: 'Rate', display_name_amt: 'Amount' },
        { display_name: 'State Tax', display_name_rate: 'Rate', display_name_amt: 'Amount' },
        { display_name: 'Integrated Tax', display_name_rate: 'Rate', display_name_amt: 'Amount' },
        { display_name: 'Cess', display_name_rate: 'Rate', display_name_amt: 'Amount' },
        { display_name: 'Total Tax Amount' }
      ],
      items: invoice.items.map((item, index) => ({
        sl_no: index + 1,
        pro_code: '',
        pro_name: item.productName,
        desc: '',
        serial_no: '',
        pro_image: '',
        hsn: '',
        tax_rate: item.taxRate || '',
        qty: String(item.qty),
        free_qty: 0,
        unit: '',
        rate: item.rate.toFixed(2),
        per: '',
        disc1_per: 0,
        disc1_amt: '0.00',
        disc2_per: 0,
        disc2_amt: '0.00',
        amount: item.amount.toFixed(2)
      })),
      tax_details: taxGroups.map((g) => ({
        hsn: '',
        taxable_value: g.taxableValue.toFixed(2),
        central_tax_rate: g.percent ? `${round2(g.percent / 2)}%` : '',
        central_tax_amount: g.centralTaxAmount.toFixed(2),
        state_tax_rate: g.percent ? `${round2(g.percent / 2)}%` : '',
        state_tax_amount: g.stateTaxAmount.toFixed(2),
        integrated_tax_rate: '',
        integrated_tax_amount: 0,
        cess_tax_rate: '',
        cess_tax_amount: 0,
        total_tax_amount: round2(g.centralTaxAmount + g.stateTaxAmount).toFixed(2)
      })),
      tax_summary_details: [],
      tax_details_total: {
        total_taxable_value: round2(taxGroups.reduce((sum, g) => sum + g.taxableValue, 0)).toFixed(2),
        total_central_tax_amount: totalCentralTax.toFixed(2),
        total_state_tax_amount: totalStateTax.toFixed(2),
        total_integrated_tax_amount: 0,
        total_cess_tax_amount: 0,
        total_tax_amount: totalTax.toFixed(2)
      },
      tax_split_up_total: [
        ...(totalCentralTax > 0 ? [{ name: 'CGST', rate: '', amount: totalCentralTax.toFixed(2) }] : []),
        ...(totalStateTax > 0 ? [{ name: 'SGST', rate: '', amount: totalStateTax.toFixed(2) }] : [])
      ],
      footer: [],
      others: {
        page_size: pageSize,
        name: 'Total',
        total_qty: totalQty,
        total_free_qty: 0,
        total_disc1: 0,
        total_disc2: 0,
        total_amount: invoice.totalAmount.toFixed(2),
        arrears: '0.00 Cr',
        total_outstand: invoice.totalAmount.toFixed(2),
        tax_amt_in_words: '',
        amt_in_words: amountToWords(invoice.totalAmount),
        einvoice_details: '',
        irn: '',
        ack_no: '',
        ack_date: '',
        upi_id: '',
        terms_and_conditions: ''
      }
    };
  }

  private buildTaxGroups(items: InvoiceItem[]): TaxGroup[] {
    const groups = new Map<string, InvoiceItem[]>();
    for (const item of items) {
      const key = item.taxRate || '';
      const group = groups.get(key);
      if (group) {
        group.push(item);
      } else {
        groups.set(key, [item]);
      }
    }

    const result: TaxGroup[] = [];
    for (const [taxRate, groupItems] of groups) {
      const percent = parseTaxPercent(taxRate);
      const taxableValue = round2(groupItems.reduce((sum, item) => sum + item.amount, 0));
      const halfPercent = round2(percent / 2);
      const centralTaxAmount = round2(taxableValue * (halfPercent / 100));
      result.push({ taxRate, percent, taxableValue, centralTaxAmount, stateTaxAmount: centralTaxAmount });
    }
    return result;
  }

  // Changes the paper size of the invoice already loaded in the preview. Deliberately edits
  // the payload already being rendered rather than rebuilding it from the invoice record, so
  // this works the same for a single preview, a bulk batch, and (later) any payload that
  // arrives from an API.
  setStoredPaperSize(pageSize: PaperSize): boolean {
    const payload = readInvoicePayload();
    if (!payload) {
      return false;
    }
    applyPaperSize(payload, pageSize);
    return true;
  }

  // Opens the preview as a dialog over the current screen rather than in a new browser tab.
  // The payload is handed over in memory (see preview-payload.ts) - the layout reads the very
  // object built here off the parent window, so nothing is encoded and nothing is capped. The
  // /print/invoice-preview route this also still serves works the same way.
  //
  // Set BEFORE the dialog opens, because opening it is what creates the iframe that reads it.
  openInvoicePreview(invoiceId: string, pageSize: PaperSize = 'a4'): void {
    const invoice = this.dataService.getInvoice(invoiceId);
    if (!invoice) {
      console.error('Invoice not found:', invoiceId);
      return;
    }
    setPreviewPayload(INVOICE_STORAGE_KEY, this.buildInvoiceData(invoice, pageSize));
    this.previewDialog.open({ kind: 'invoice', title: `Invoice ${invoice.invoiceNo}` });
  }

  // Bulk print entry point: takes the ids selected in the invoice list and opens ONE preview
  // covering all of them, back-to-back on the same document - the print layout script
  // (public/print/invoice/view/invoice.html, see generateReport) renders a
  // `{ invoices: [...] }` payload as one continuous run of pages, so the single Print button
  // already wired up on InvoicePreviewComponent fires one window.print() call for the whole
  // batch instead of one dialog per invoice.
  //
  // TEMPORARY testing stand-in per Priyanka's task (Slack, Interns Research 2026, 2026-08-01):
  // the real flow is "Bulk Print" -> API call returning each selected invoice's JSON -> print.
  // That API doesn't exist yet, so for now this ignores the real invoice data and repeats a
  // single hardcoded JSON payload once per selected id, purely to prove out and test the
  // continuous multi-invoice print flow itself. Swap HARDCODED_BULK_TEST_INVOICE (or this
  // whole method body) for a real API call once that endpoint exists.
  openBulkInvoicePreview(invoiceIds: string[]): void {
    if (invoiceIds.length === 0) {
      return;
    }
    // One shared object reference per id, not N copies. That was already true before the
    // payload stopped being serialised (JSON.stringify expanded the repeats); keeping it means
    // a 250-invoice batch costs one invoice's memory rather than 250, which matters most in
    // exactly the large-batch case this handoff exists to support. Safe because the only
    // in-place edits anyone makes to an entry - the paper-size stamp below and the layout's
    // `copies` default - are idempotent, so applying them N times to one object is the same as
    // applying them once to each of N.
    const invoices = invoiceIds.map(() => HARDCODED_BULK_TEST_INVOICE);
    setPreviewPayload(INVOICE_STORAGE_KEY, { invoices });
    this.previewDialog.open({
      kind: 'invoice',
      title: `Bulk print - ${invoices.length} ${invoices.length === 1 ? 'invoice' : 'invoices'}`
    });
  }
}

// Test data for openBulkInvoicePreview() above - the actual JSON Priyanka shared (Slack,
// Interns Research 2026, 2026-08-01) for this task, pasted in verbatim. Exported because the
// alternative invoice designs (invoice-d2/d3/d4) read this exact same schema, so their
// previews reuse it rather than inventing a second, drifting copy - see report-print.service.
export const HARDCODED_BULK_TEST_INVOICE = {
  items: [
    {
      hsn: '', key: '', mrp: '1500.00', per: 'PCS', qty: '1.00', desc: '', rate: '1500.00',
      unit: 'PCS', batch: '', sl_no: 1, value: '', amount: '1271.18', alt_qty: ' ', no_pkgs: '',
      bra_name: 'nan', exp_date: null, free_qty: 0, mfg_date: null, pro_code: '', pro_name: 'nan',
      tax_rate: 18, disc1_amt: 0, disc1_per: 0, disc2_amt: 0, disc2_per: 0, pro_image: '',
      serial_no: '', pro_barcode: '', rate_pre_tax: '1271.18', rate_post_tax: '1500.00',
      with_tax_total_amt: '1500.00', marks_nos_container: ''
    },
    {
      hsn: '3406', key: '', mrp: '10.00', per: 'UNT', qty: '1.00', desc: 'Blue Candle  Last for 2 Hours',
      rate: '10.00', unit: 'UNT', batch: '', sl_no: 2, value: '', amount: '8.48', alt_qty: '1 UNT',
      no_pkgs: '', bra_name: 'N/A', exp_date: '', free_qty: 0, mfg_date: '', pro_code: '12356',
      pro_name: 'N/A', tax_rate: 18, disc1_amt: 0, disc1_per: 0, disc2_amt: 0, disc2_per: 0,
      serial_no: '', pro_barcode: '895447521452', rate_pre_tax: '8.48', rate_post_tax: '10.00',
      with_tax_total_amt: '10.00', marks_nos_container: ''
    },
    {
      hsn: '100640', key: '', mrp: '20.00', per: 'KGS', qty: '1.00', desc: '', rate: '15.00',
      unit: 'KGS', batch: '', sl_no: 3, value: '', amount: '15.00', alt_qty: '0.1 BAG', no_pkgs: '',
      bra_name: 'N/A', exp_date: '', free_qty: 0, mfg_date: '', pro_code: '', pro_name: 'Rice',
      tax_rate: 0, disc1_amt: 0, disc1_per: 0, disc2_amt: 0, disc2_per: 0, serial_no: '',
      pro_barcode: '1800159', rate_pre_tax: '15.00', rate_post_tax: '15.00',
      with_tax_total_amt: '15.00', marks_nos_container: ''
    },
    {
      hsn: '72029990', key: '', mrp: '0.00', per: 'BAG', qty: '1.00', desc: '', rate: '55.00',
      unit: 'BAG', batch: '', sl_no: 4, value: '', amount: '51.34', alt_qty: '1 BAG', no_pkgs: '',
      bra_name: 'N/A', exp_date: '', free_qty: 0, mfg_date: '', pro_code: '', pro_name: 'Wheat',
      tax_rate: 5, disc1_amt: 1.1, disc1_per: 2, disc2_amt: 0, disc2_per: 0, serial_no: '',
      pro_barcode: '89541155454826', rate_pre_tax: '51.34', rate_post_tax: '53.90',
      with_tax_total_amt: '53.90', marks_nos_container: ''
    },
    {
      hsn: '0101', key: '', mrp: '55.00', per: 'NOS', qty: '1.00', desc: '', rate: '51.75',
      unit: 'NOS', batch: '', sl_no: 5, value: '', amount: '32.89', alt_qty: '0.1 BAL', no_pkgs: '',
      bra_name: 'N/A', exp_date: '', free_qty: 0, mfg_date: '', pro_code: '',
      pro_name: 'Chocolate Parle 50 gram Pack', tax_rate: 18, disc1_amt: 12.94, disc1_per: 25,
      disc2_amt: 0, disc2_per: 0, serial_no: '', pro_barcode: '5555555', rate_pre_tax: '32.89',
      rate_post_tax: '38.81', with_tax_total_amt: '38.81', marks_nos_container: ''
    },
    {
      hsn: '010410', key: '', mrp: '225.00', per: 'UNT', qty: '1.00', desc: '', rate: '217.00',
      unit: 'UNT', batch: '', sl_no: 6, value: '', amount: '206.15', alt_qty: '1 UNT', no_pkgs: '',
      bra_name: 'N/A', exp_date: '', free_qty: 0, mfg_date: '', pro_code: '',
      pro_name: 'Bill of Material', tax_rate: 0, disc1_amt: 10.85, disc1_per: 5, disc2_amt: 0,
      disc2_per: 0, serial_no: '', pro_barcode: '8904252525', rate_pre_tax: '206.15',
      rate_post_tax: '206.15', with_tax_total_amt: '206.15', marks_nos_container: ''
    },
    {
      hsn: '2524', key: '', mrp: '0.00', per: 'KGS', qty: '1.00', desc: '', rate: '20.00',
      unit: 'KGS', batch: '', sl_no: 7, value: '', amount: '20.00', alt_qty: '1 KGS', no_pkgs: '',
      bra_name: 'N/A', exp_date: '', free_qty: 0, mfg_date: '', pro_code: '',
      pro_name: 'Bill of Material', tax_rate: 0, disc1_amt: 0, disc1_per: 0, disc2_amt: 0,
      disc2_per: 0, serial_no: '', pro_barcode: 'Bill of Material', rate_pre_tax: '20.00',
      rate_post_tax: '20.00', with_tax_total_amt: '20.00', marks_nos_container: ''
    },
    {
      hsn: '', key: '', mrp: '0.00', per: 'LTR', qty: '1.00', desc: '', rate: '10.00', unit: 'LTR',
      batch: '', sl_no: 8, value: '', amount: '10.00', alt_qty: '1 LTR', no_pkgs: '', bra_name: 'N/A',
      exp_date: '', free_qty: 0, mfg_date: '', pro_code: '', pro_name: 'Bill of Material',
      tax_rate: 0, disc1_amt: 0, disc1_per: 0, disc2_amt: 0, disc2_per: 0, serial_no: '',
      pro_barcode: 'Bill of Material', rate_pre_tax: '10.00', rate_post_tax: '10.00',
      with_tax_total_amt: '10.00', marks_nos_container: ''
    },
    {
      hsn: '17019910', key: '', mrp: '0.00', per: 'KGS', qty: '1.00', desc: '', rate: '50.00',
      unit: 'KGS', batch: '', sl_no: 9, value: '', amount: '50.00', alt_qty: '1 KGS', no_pkgs: '',
      bra_name: 'N/A', exp_date: '', free_qty: 0, mfg_date: '', pro_code: '',
      pro_name: 'Bill of Material', tax_rate: 0, disc1_amt: 0, disc1_per: 0, disc2_amt: 0,
      disc2_per: 0, serial_no: '', pro_barcode: 'Bill of Material', rate_pre_tax: '50.00',
      rate_post_tax: '50.00', with_tax_total_amt: '50.00', marks_nos_container: ''
    },
    {
      hsn: '09109990', key: '', mrp: '0.00', per: 'KGS', qty: '1.00', desc: '', rate: '10.00',
      unit: 'KGS', batch: '', sl_no: 10, value: '', amount: '10.00', alt_qty: ' ', no_pkgs: '',
      bra_name: 'N/A', exp_date: '', free_qty: 0, mfg_date: '', pro_code: '',
      pro_name: 'Garam Masala - BOM', tax_rate: 0, disc1_amt: 0, disc1_per: 0, disc2_amt: 0,
      disc2_per: 0, serial_no: '', pro_barcode: 'Garam Masala - BOM', rate_pre_tax: '10.00',
      rate_post_tax: '10.00', with_tax_total_amt: '10.00', marks_nos_container: ''
    },
    {
      hsn: '39232100', key: '', mrp: '73.00', per: 'NOS', qty: '1.00', desc: '', rate: '73.00',
      unit: 'NOS', batch: '', sl_no: 11, value: '', amount: '61.86', alt_qty: ' ', no_pkgs: '',
      bra_name: 'N/A', exp_date: '', free_qty: 0, mfg_date: '', pro_code: '',
      pro_name: 'GARBAGE BAGS 19*21', tax_rate: 18, disc1_amt: 0, disc1_per: 0, disc2_amt: 0,
      disc2_per: 0, serial_no: '', pro_barcode: '', rate_pre_tax: '61.86', rate_post_tax: '73.00',
      with_tax_total_amt: '73.00', marks_nos_container: ''
    }
  ],
  config: {
    is_rcm: false, bill_to: true, ship_to: false, be_details: true, footer_date: true,
    is_canceled: false, display_desc: '2', rate_pre_tax: true, rate_pre_disc: true,
    logo_watermark: true, display_arrears: false, is_packing_slip: false, include_you_save: false,
    is_order_summary: false, include_signature: true, is_gst_applicable: true,
    print_hsn_summary: true, print_tax_summary: false, tax_below_product: false,
    authorised_signatory: true, include_payment_qrcode: true
  },
  copies: [{ type: 'Original', typeOfCopy: 0 }],
  design: { logo: '', signature: '' },
  footer: [{ value: '' }, { value: '' }, { value: '' }],
  others: {
    irn: '', name: 'Total', ack_no: '', upi_id: '', arrears: '112 Dr', ack_date: '',
    page_size: 'a4', total_qty: 0, total_disc1: 25, total_disc2: 0,
    amt_in_words: 'One Thousand Nine Hundred Eighty Seven  Rupees Only', bank_details: '',
    total_amount: '1987.00', total_free_qty: 0, total_outstand: 112, einvoice_details: '',
    tax_amt_in_words: 'Two Hundred Forty Nine  Rupees And Ninety Six Paise Only',
    terms_and_conditions: 'Note\nterms and condition texted here'
  },
  recpay: {
    recpay: [
      {
        amount: 1987, pmt_mid: 26186, account_id: 33, recpay_tid: 2089, recpay_auth: '',
        recpay_name: 'Cash', received_cash: 2000, recpay_type_id: 1, recpay_card_number: ''
      }
    ]
  },
  bill_to: {
    party_pin: '', party_add1: '', party_add2: '', party_add3: '', party_name: 'Walk - In',
    party_gstin: '', party_phone: '9999999991'
  },
  heading: { name: 'Tax Invoice', sub_name: '', doc_copy_type: 'Original, Duplicate, Triplicate' },
  inv_att: [],
  ship_to: { pin: '', add1: '', add2: '', add3: '', name: '', gstin: '', phone: '' },
  be_details: {
    pin: '560026', phone: '7777777777', beb_name: 'Sunshine Limited', beb_gstin: '',
    beb_addline1: '5th Floor Bejai, Bangalore-575003 FSSAI 256356 0824-205235', beb_addline2: '',
    beb_addline3: '', fssai_number: '12345678321052'
  },
  hsncolumns: [
    { name: 'hsn/sac', visible: '1', sequence: '', display_name: 'HSN/SAC', display_name_amt: '', display_name_rate: '' },
    { name: 'taxable_value', visible: '1', sequence: '', display_name: 'Taxable Value', display_name_amt: '', display_name_rate: '' },
    { name: 'output_cgst', visible: '1', sequence: '', display_name: 'Central Tax', display_name_amt: 'Amount', display_name_rate: 'Rate' },
    { name: 'output_sgst', visible: '1', sequence: '', display_name: 'State Tax', display_name_amt: 'Amount', display_name_rate: 'Rate' },
    { name: 'output_igst', visible: '0', sequence: '', display_name: 'Integrated Tax Amount', display_name_amt: 'Amount', display_name_rate: 'Rate' },
    { name: 'cess', visible: '0', sequence: '', display_name: 'Cess', display_name_amt: 'Amount', display_name_rate: 'Rate' },
    { name: 'round_off', visible: '1', sequence: '', display_name: 'Round Off', display_name_amt: '', display_name_rate: '' },
    { name: 'total_tax', visible: '1', sequence: '', display_name: 'Total Tax Amount', display_name_amt: '', display_name_rate: '' }
  ],
  attr_border: { enable: true },
  tax_details: [
    { hsn: '', cess_tax_rate: '0%', taxable_value: '1271.18', state_tax_rate: '9%', cess_tax_amount: '0.00', central_tax_rate: '9%', state_tax_amount: '114.41', total_tax_amount: '228.82', central_tax_amount: '114.41', integrated_tax_rate: '18%', integrated_tax_amount: '228.82' },
    { hsn: '3406', cess_tax_rate: '0%', taxable_value: '8.48', state_tax_rate: '9%', cess_tax_amount: '0.00', central_tax_rate: '9%', state_tax_amount: '0.76', total_tax_amount: '1.52', central_tax_amount: '0.76', integrated_tax_rate: '18%', integrated_tax_amount: '1.52' },
    { hsn: '100640', cess_tax_rate: '0%', taxable_value: '15.00', state_tax_rate: '0%', cess_tax_amount: '0.00', central_tax_rate: '0%', state_tax_amount: '0.00', total_tax_amount: '0.00', central_tax_amount: '0.00', integrated_tax_rate: '0%', integrated_tax_amount: '0.00' },
    { hsn: '72029990', cess_tax_rate: '0%', taxable_value: '51.34', state_tax_rate: '2.5%', cess_tax_amount: '0.00', central_tax_rate: '2.5%', state_tax_amount: '1.28', total_tax_amount: '2.56', central_tax_amount: '1.28', integrated_tax_rate: '5%', integrated_tax_amount: '2.56' },
    { hsn: '0101', cess_tax_rate: '0%', taxable_value: '32.89', state_tax_rate: '9%', cess_tax_amount: '0.00', central_tax_rate: '9%', state_tax_amount: '2.96', total_tax_amount: '5.92', central_tax_amount: '2.96', integrated_tax_rate: '18%', integrated_tax_amount: '5.92' },
    { hsn: '010410', cess_tax_rate: '0%', taxable_value: '206.15', state_tax_rate: '0%', cess_tax_amount: '0.00', central_tax_rate: '0%', state_tax_amount: '0.00', total_tax_amount: '0.00', central_tax_amount: '0.00', integrated_tax_rate: '0%', integrated_tax_amount: '0.00' },
    { hsn: '2524', cess_tax_rate: '0%', taxable_value: '20.00', state_tax_rate: '0%', cess_tax_amount: '0.00', central_tax_rate: '0%', state_tax_amount: '0.00', total_tax_amount: '0.00', central_tax_amount: '0.00', integrated_tax_rate: '0%', integrated_tax_amount: '0.00' },
    { hsn: '', cess_tax_rate: '0%', taxable_value: '10.00', state_tax_rate: '0%', cess_tax_amount: '0.00', central_tax_rate: '0%', state_tax_amount: '0.00', total_tax_amount: '0.00', central_tax_amount: '0.00', integrated_tax_rate: '0%', integrated_tax_amount: '0.00' },
    { hsn: '17019910', cess_tax_rate: '0%', taxable_value: '50.00', state_tax_rate: '0%', cess_tax_amount: '0.00', central_tax_rate: '0%', state_tax_amount: '0.00', total_tax_amount: '0.00', central_tax_amount: '0.00', integrated_tax_rate: '0%', integrated_tax_amount: '0.00' },
    { hsn: '09109990', cess_tax_rate: '0%', taxable_value: '10.00', state_tax_rate: '0%', cess_tax_amount: '0.00', central_tax_rate: '0%', state_tax_amount: '0.00', total_tax_amount: '0.00', central_tax_amount: '0.00', integrated_tax_rate: '0%', integrated_tax_amount: '0.00' },
    { hsn: '39232100', cess_tax_rate: '0%', taxable_value: '61.86', state_tax_rate: '9%', cess_tax_amount: '0.00', central_tax_rate: '9%', state_tax_amount: '5.57', total_tax_amount: '11.14', central_tax_amount: '5.57', integrated_tax_rate: '18%', integrated_tax_amount: '11.14' }
  ],
  master_details: {
    inv_no: 'RSP-S-26-00002', pmt_time: '5:08:04 PM', billed_by: 'Sachin', serial_no: 2,
    paid_topay: 'Paid - Cash', design_type: 1, due_by_date: '', extra_lines: 0,
    place_supply: '29 - Karnataka', pmt_doc_date: '24-07-2026', doc_reference: '',
    master_transaction: 2
  },
  product_columns: [
    { id: '1', name: 'sl_no', visible: '', sequence: '', display_name: 'SL.No' },
    { id: '6', name: 'pro_name', visible: '', sequence: '', display_name: 'Description of Goods/Services' },
    { id: '13', name: 'alt_qty', display_name: 'Alt.Qty' },
    { id: '14', name: 'qty', visible: '', sequence: '', display_name: 'Qty' },
    { id: '16', name: 'unit', visible: '', sequence: '', display_name: 'Unit' },
    { id: '17', name: 'rate', display_name: 'Rate' },
    { id: '25', name: 'tax_rate', visible: '', sequence: '', display_name: 'Tax%' },
    { id: '26', name: 'amount', display_name: 'Amount' }
  ],
  tax_details_total: {
    name: 'Total', total_tax_amount: '249.96', total_taxable_value: '1736.90',
    total_cess_tax_amount: '0.00', total_state_tax_amount: '124.98',
    total_central_tax_amount: '124.98', total_integrated_tax_amount: 0
  },
  tax_split_up_total: [
    { name: 'Output CGST%', rate: 9, amount: '123.70' },
    { name: 'Output SGST%', rate: 9, amount: '123.70' },
    { name: 'Output CGST%', rate: 2.5, amount: '1.28' },
    { name: 'Output SGST%', rate: 2.5, amount: '1.28' },
    { name: 'Round Off', rate: '', amount: '0.14' }
  ],
  tax_summary_details: [
    { cess_tax_rate: '0%', taxable_value: 1374.41, state_tax_rate: '9%', cess_tax_amount: 0, central_tax_rate: '9%', state_tax_amount: 123.7, total_tax_amount: 247.4, central_tax_amount: 123.7, integrated_tax_rate: '18%', integrated_tax_amount: 247.4 },
    { cess_tax_rate: '0%', taxable_value: 311.15, state_tax_rate: '0%', cess_tax_amount: 0, central_tax_rate: '0%', state_tax_amount: 0, total_tax_amount: 0, central_tax_amount: 0, integrated_tax_rate: '0%', integrated_tax_amount: 0 },
    { cess_tax_rate: '0%', taxable_value: '51.34', state_tax_rate: '2.5%', cess_tax_amount: '0.00', central_tax_rate: '2.5%', state_tax_amount: '1.28', total_tax_amount: '2.56', central_tax_amount: '1.28', integrated_tax_rate: '5%', integrated_tax_amount: '2.56' }
  ]
};
