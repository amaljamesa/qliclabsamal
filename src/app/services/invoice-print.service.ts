import { Injectable } from '@angular/core';
import { DataService, Invoice, InvoiceItem } from './data.service';

// UTF-8 safe base64 encode - mirrors the base64ToUtf8 decode the invoice report expects
// (public/print/invoice/view/invoice.html).
function utf8ToBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
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
  constructor(private dataService: DataService) {}

  // Maps this app's real Invoice record onto the target JSON schema the invoice print layout
  // (public/print/invoice/view/invoice.html) expects. The layout's schema covers far more
  // than this app currently captures per invoice (HSN codes, ship-to address, e-invoice IRN,
  // bank details, signature, terms) - config toggles for all of that are left off/empty
  // rather than faked, same approach ledger.service.ts already takes for the ledger's
  // company_details. Fields that genuinely exist on the Invoice/InvoiceItem models (party
  // name, item name/qty/rate/amount, totals, tax rate) map through directly.
  buildInvoiceData(invoice: Invoice, pageSize: 'a4' | 'a5' = 'a4'): unknown {
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

  openInvoicePreview(invoiceId: string, pageSize: 'a4' | 'a5' = 'a4'): void {
    const invoice = this.dataService.getInvoice(invoiceId);
    if (!invoice) {
      console.error('Invoice not found:', invoiceId);
      return;
    }
    const data = this.buildInvoiceData(invoice, pageSize);
    const base64 = utf8ToBase64(JSON.stringify(data));
    sessionStorage.setItem('temp_inv_data', base64);
    window.open('/print/invoice-preview?message=1', '_blank');
  }
}
