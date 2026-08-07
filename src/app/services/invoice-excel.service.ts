import { Injectable } from '@angular/core';
import { base64ToUtf8 } from './invoice-print.service';
import { buildXlsxBlob, columnLetter, downloadBlob, SheetCell, SheetRow, WorkbookSheet } from './xlsx-writer.util';

// Exports the invoice currently loaded in the preview as an .xlsx workbook, alongside the
// existing print/PDF route.
//
// Reads the same base64 payload in sessionStorage that every invoice layout renders
// (temp_inv_data - see InvoicePrintService), NOT the rendered iframe DOM. Two reasons:
//
//  1. The layouts are page designs, not tables. Each one paints the same invoice as a
//     different arrangement of nested divs and tables sliced into fixed-height A4/A5 pages
//     with repeated headers - scraping that DOM would carry pagination artefacts and design
//     scaffolding into the sheet, and would need re-tuning for each of the ten designs.
//  2. All the layouts render one shared payload, so going to the source means the export is
//     correct for every design (including any added later) with no per-design code, and
//     numbers land in Excel as real numbers rather than pre-formatted strings.
//
// The consequence, worth being explicit about: the workbook does not reproduce the *look* of
// the chosen design - it reproduces the invoice's content and structure (header, party
// details, item table, tax summary, totals) in a form Excel can actually total, sort and
// filter. Which design is on screen does not change the export.

const SHEET_TITLE_MIN_WIDTH = 4;
const LABEL_COL_WIDTH = 20;
const SECOND_COL_WIDTH = 34;
const DEFAULT_COL_WIDTH = 13;

// Item columns whose values are numeric quantities/money rather than text. Driven by column
// name rather than "does this string parse as a number", so values that only look numeric
// (HSN codes, barcodes, invoice numbers with leading zeros) stay text and keep their zeros.
const MONEY_ITEM_COLUMNS = new Set([
  'rate', 'amount', 'mrp', 'rate_pre_tax', 'rate_post_tax', 'with_tax_total_amt',
  'disc1_amt', 'disc2_amt', 'value'
]);
const COUNT_ITEM_COLUMNS = new Set(['sl_no', 'qty', 'free_qty', 'tax_rate', 'disc1_per', 'disc2_per']);

interface TaxColumn {
  header: string;
  /** Field on a tax_details row. */
  field: string;
  /** Field on tax_details_total holding this column's grand total, if it has one. */
  totalField?: string;
  numeric: boolean;
}

// A fixed superset; columns that are empty or all-zero across every row get dropped before
// the table is written (see pickTaxColumns). Deriving them from the payload's `hsncolumns`
// instead looked tempting, but that array carries `visible` flags in the bulk-print schema
// and not in the one InvoicePrintService builds - inspecting the values works for both.
const TAX_COLUMNS: TaxColumn[] = [
  { header: 'HSN/SAC', field: 'hsn', numeric: false },
  { header: 'Taxable Value', field: 'taxable_value', totalField: 'total_taxable_value', numeric: true },
  { header: 'Central Tax Rate', field: 'central_tax_rate', numeric: false },
  { header: 'Central Tax Amount', field: 'central_tax_amount', totalField: 'total_central_tax_amount', numeric: true },
  { header: 'State Tax Rate', field: 'state_tax_rate', numeric: false },
  { header: 'State Tax Amount', field: 'state_tax_amount', totalField: 'total_state_tax_amount', numeric: true },
  { header: 'Integrated Tax Rate', field: 'integrated_tax_rate', numeric: false },
  { header: 'Integrated Tax Amount', field: 'integrated_tax_amount', totalField: 'total_integrated_tax_amount', numeric: true },
  { header: 'Cess Rate', field: 'cess_tax_rate', numeric: false },
  { header: 'Cess Amount', field: 'cess_tax_amount', totalField: 'total_cess_tax_amount', numeric: true },
  { header: 'Total Tax Amount', field: 'total_tax_amount', totalField: 'total_tax_amount', numeric: true }
];

type Payload = Record<string, any>;

function text(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const asText = String(value).trim();
  // The bulk-print sample data uses these as "no value" placeholders; they read as noise in
  // a spreadsheet, where an empty cell says the same thing more clearly.
  return asText === 'nan' || asText === 'N/A' || asText === 'null' ? '' : asText;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const asText = text(value).replace(/,/g, '');
  if (!asText) {
    return null;
  }
  const parsed = Number(asText);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Joins the parts of a multi-line address into one cell, dropping the empty lines. */
function joinAddress(...parts: unknown[]): string {
  return parts.map(text).filter(Boolean).join(', ');
}

// Builds the rows of one sheet, tracking row numbers so merges can be recorded as they go.
class SheetBuilder {
  readonly rows: SheetRow[] = [];
  readonly merges: string[] = [];

  constructor(private readonly width: number) {}

  blank(): void {
    this.rows.push([]);
  }

  /** A shaded band naming the block that follows, spanning the full sheet width. */
  section(title: string): void {
    const row: SheetRow = [{ value: title, style: 'sectionHeader' }];
    for (let i = 1; i < this.width; i++) {
      row.push({ value: null, style: 'sectionHeader' });
    }
    this.mergeCurrentRow(0, this.width - 1);
    this.rows.push(row);
  }

  /** A bold label in column A with its value spanning the rest of the row. Skipped if empty. */
  field(label: string, value: string, style: 'value' | 'wrap' = 'value'): void {
    if (!value) {
      return;
    }
    this.mergeCurrentRow(1, this.width - 1);
    this.rows.push([{ value: label, style: 'label' }, { value, style }]);
  }

  /** A single value spanning the whole row - used for free text like terms and footers. */
  fullWidth(value: string, style: SheetCell['style'] = 'wrap'): void {
    if (!value) {
      return;
    }
    this.mergeCurrentRow(0, this.width - 1);
    this.rows.push([{ value, style }]);
  }

  row(cells: SheetRow): void {
    this.rows.push(cells);
  }

  titleRow(value: string, style: SheetCell['style']): void {
    this.mergeCurrentRow(0, this.width - 1);
    this.rows.push([{ value, style }]);
  }

  // Records a merge covering the row that is about to be pushed - so it must be called
  // before the push, while rows.length still equals that row's zero-based index.
  private mergeCurrentRow(startCol: number, endCol: number): void {
    if (endCol <= startCol) {
      return;
    }
    const rowNumber = this.rows.length + 1;
    this.merges.push(`${columnLetter(startCol)}${rowNumber}:${columnLetter(endCol)}${rowNumber}`);
  }
}

@Injectable({ providedIn: 'root' })
export class InvoiceExcelService {
  /**
   * Exports whatever the preview currently holds. A bulk-print payload becomes one sheet per
   * invoice in a single workbook. Returns false if there is nothing stored to export.
   */
  exportStoredInvoice(): boolean {
    const stored = sessionStorage.getItem('temp_inv_data');
    if (!stored) {
      console.error('No invoice payload stored - nothing to export.');
      return false;
    }

    let payload: Payload;
    try {
      payload = JSON.parse(base64ToUtf8(stored));
    } catch (error) {
      console.error('Could not read the stored invoice payload:', error);
      return false;
    }

    const invoices: Payload[] = Array.isArray(payload['invoices']) ? payload['invoices'] : [payload];
    if (invoices.length === 0) {
      return false;
    }

    const sheets = invoices.map((invoice, index) => this.buildSheet(invoice, index, invoices.length));
    downloadBlob(buildXlsxBlob(sheets), this.buildFilename(invoices));
    return true;
  }

  private buildFilename(invoices: Payload[]): string {
    if (invoices.length > 1) {
      return `invoices-${invoices.length}.xlsx`;
    }
    // Invoice numbers legitimately contain slashes (e.g. "INV/26-27/001"), which a filename
    // cannot.
    const invoiceNo = text(invoices[0]?.['master_details']?.['inv_no']).replace(/[^A-Za-z0-9._-]+/g, '-');
    return invoiceNo ? `invoice-${invoiceNo}.xlsx` : 'invoice.xlsx';
  }

  private buildSheet(invoice: Payload, index: number, total: number): WorkbookSheet {
    const productColumns: Payload[] = Array.isArray(invoice['product_columns']) ? invoice['product_columns'] : [];
    const taxRows: Payload[] = Array.isArray(invoice['tax_details']) ? invoice['tax_details'] : [];
    const taxColumns = this.pickTaxColumns(taxRows, invoice['tax_details_total'] ?? {});

    const width = Math.max(productColumns.length, taxColumns.length, SHEET_TITLE_MIN_WIDTH);
    const builder = new SheetBuilder(width);

    this.addHeading(builder, invoice);
    this.addSeller(builder, invoice);
    this.addInvoiceDetails(builder, invoice);
    this.addParties(builder, invoice);
    this.addItems(builder, invoice, productColumns, width);
    this.addTaxSummary(builder, invoice, taxRows, taxColumns);
    this.addTaxBreakup(builder, invoice);
    this.addNotes(builder, invoice);

    return {
      name: this.buildSheetName(invoice, index, total),
      rows: builder.rows,
      merges: builder.merges,
      columnWidths: this.buildColumnWidths(width)
    };
  }

  private buildColumnWidths(width: number): number[] {
    const widths = [LABEL_COL_WIDTH, SECOND_COL_WIDTH];
    while (widths.length < width) {
      widths.push(DEFAULT_COL_WIDTH);
    }
    return widths.slice(0, width);
  }

  private buildSheetName(invoice: Payload, index: number, total: number): string {
    const invoiceNo = text(invoice['master_details']?.['inv_no']);
    if (total === 1) {
      return invoiceNo || 'Invoice';
    }
    // Prefixed with the position in the batch so the tab order matches the print order even
    // when several invoices share (or lack) a number.
    return invoiceNo ? `${index + 1} - ${invoiceNo}` : `Invoice ${index + 1}`;
  }

  private addHeading(builder: SheetBuilder, invoice: Payload): void {
    const heading = invoice['heading'] ?? {};
    builder.titleRow(text(heading['name']) || 'Invoice', 'title');
    const subName = text(heading['sub_name']);
    if (subName) {
      builder.titleRow(subName, 'subtitle');
    }
    if (invoice['config']?.['is_canceled']) {
      builder.titleRow('CANCELLED', 'label');
    }
    builder.blank();
  }

  private addSeller(builder: SheetBuilder, invoice: Payload): void {
    const seller = invoice['be_details'] ?? {};
    if (Object.keys(seller).length === 0) {
      return;
    }
    builder.section('Seller');
    builder.field('Name', text(seller['beb_name']));
    builder.field('Address', joinAddress(seller['beb_addline1'], seller['beb_addline2'], seller['beb_addline3']), 'wrap');
    builder.field('PIN', text(seller['pin']));
    builder.field('Phone', text(seller['phone']));
    builder.field('GSTIN', text(seller['beb_gstin']));
    builder.field('FSSAI', text(seller['fssai_number']));
    builder.blank();
  }

  private addInvoiceDetails(builder: SheetBuilder, invoice: Payload): void {
    const master = invoice['master_details'] ?? {};
    if (Object.keys(master).length === 0) {
      return;
    }
    builder.section('Invoice Details');
    builder.field('Invoice No.', text(master['inv_no']));
    const date = text(master['pmt_doc_date']);
    const time = text(master['pmt_time']);
    // Kept as text, not an Excel date: the payload's dates arrive pre-formatted in more than
    // one shape (dd-MMM-yyyy from this app, dd-mm-yyyy from the bulk sample), and guessing
    // wrong would silently shift days and months around.
    builder.field('Date', [date, time].filter(Boolean).join(' '));
    builder.field('Due Date', text(master['due_by_date']));
    builder.field('Place of Supply', text(master['place_supply']));
    builder.field('Payment', text(master['paid_topay']));
    builder.field('Reference', text(master['doc_reference']));
    builder.field('Billed By', text(master['billed_by']));
    builder.field('IRN', text(invoice['others']?.['irn']));
    builder.field('Ack No.', text(invoice['others']?.['ack_no']));
    builder.field('Ack Date', text(invoice['others']?.['ack_date']));
    builder.blank();
  }

  private addParties(builder: SheetBuilder, invoice: Payload): void {
    const config = invoice['config'] ?? {};
    const billTo = invoice['bill_to'] ?? {};
    if (config['bill_to'] !== false && Object.keys(billTo).length > 0) {
      builder.section('Bill To');
      builder.field('Name', text(billTo['party_name']));
      builder.field('Address', joinAddress(billTo['party_add1'], billTo['party_add2'], billTo['party_add3']), 'wrap');
      builder.field('PIN', text(billTo['party_pin']));
      builder.field('Phone', text(billTo['party_phone']));
      builder.field('GSTIN', text(billTo['party_gstin']));
      builder.blank();
    }

    const shipTo = invoice['ship_to'] ?? {};
    const hasShipTo = Object.values(shipTo).some((value) => text(value));
    if (config['ship_to'] && hasShipTo) {
      builder.section('Ship To');
      builder.field('Name', text(shipTo['name']));
      builder.field('Address', joinAddress(shipTo['add1'], shipTo['add2'], shipTo['add3']), 'wrap');
      builder.field('PIN', text(shipTo['pin']));
      builder.field('Phone', text(shipTo['phone']));
      builder.field('GSTIN', text(shipTo['gstin']));
      builder.blank();
    }
  }

  private addItems(builder: SheetBuilder, invoice: Payload, productColumns: Payload[], width: number): void {
    const items: Payload[] = Array.isArray(invoice['items']) ? invoice['items'] : [];
    if (productColumns.length === 0 || items.length === 0) {
      return;
    }

    builder.section('Items');
    builder.row(productColumns.map((column) => ({
      value: text(column['display_name']) || text(column['name']),
      style: 'columnHeader' as const
    })));

    for (const item of items) {
      builder.row(productColumns.map((column) => this.buildItemCell(item, text(column['name']))));
    }

    this.addItemsTotal(builder, invoice, productColumns, width);
    builder.blank();

    const amountInWords = text(invoice['others']?.['amt_in_words']);
    // The layouts print this under the item table (config.show_amt_in_words), and it is the
    // one part of an invoice that has to be read verbatim rather than recomputed.
    builder.field('Amount in Words', amountInWords, 'wrap');
    builder.field('Tax Amount in Words', text(invoice['others']?.['tax_amt_in_words']), 'wrap');
    if (amountInWords) {
      builder.blank();
    }
  }

  private buildItemCell(item: Payload, columnName: string): SheetCell {
    const raw = item[columnName];

    if (columnName === 'pro_name') {
      // The layouts render the description indented under the product name in the same
      // column; wrapping them into one cell keeps that pairing without a second column.
      // Joined by filtering rather than concatenating, because real data has rows where the
      // name is a placeholder text() strips ('nan', 'N/A') and only the description survives -
      // those would otherwise open with a blank first line.
      const lines = [text(raw), text(item['desc'])].filter(Boolean);
      return { value: lines.join('\n'), style: 'text' };
    }

    if (MONEY_ITEM_COLUMNS.has(columnName) || COUNT_ITEM_COLUMNS.has(columnName)) {
      const value = toNumber(raw);
      const style = MONEY_ITEM_COLUMNS.has(columnName) ? 'number' : 'qty';
      return { value, style };
    }

    return { value: text(raw), style: 'text' };
  }

  // Mirrors the totals row the layouts print at the foot of the item table, placing each
  // total under the column it belongs to and leaving the rest of the row blank-but-bordered.
  private addItemsTotal(builder: SheetBuilder, invoice: Payload, productColumns: Payload[], width: number): void {
    const others = invoice['others'] ?? {};
    const totals: Record<string, number | null> = {
      qty: toNumber(others['total_qty']),
      free_qty: toNumber(others['total_free_qty']),
      disc1_amt: toNumber(others['total_disc1']),
      disc2_amt: toNumber(others['total_disc2']),
      amount: toNumber(others['total_amount'])
    };
    if (Object.values(totals).every((value) => value === null)) {
      return;
    }

    const row: SheetRow = productColumns.map((column, index) => {
      const name = text(column['name']);
      if (index === 0) {
        return { value: text(others['name']) || 'Total', style: 'totalLabel' as const };
      }
      const total = totals[name];
      if (total === null || total === undefined) {
        return { value: null, style: 'totalLabel' as const };
      }
      // A quantity total is formatted like the quantities above it, not like money - a total
      // of 3 items should read "3", not "3.00".
      return { value: total, style: COUNT_ITEM_COLUMNS.has(name) ? 'totalQty' as const : 'totalNumber' as const };
    });
    while (row.length < width) {
      row.push({ value: null, style: 'totalLabel' });
    }
    builder.row(row);
  }

  // Drops any column with nothing to show - an intra-state invoice has no integrated tax, and
  // eleven columns of zeros would bury the two that matter.
  private pickTaxColumns(taxRows: Payload[], taxTotals: Payload): TaxColumn[] {
    if (taxRows.length === 0) {
      return [];
    }
    return TAX_COLUMNS.filter((column) => {
      const values = taxRows.map((row) => row[column.field]);
      if (column.totalField !== undefined) {
        values.push(taxTotals[column.totalField]);
      }
      return values.some((value) => {
        const asText = text(value);
        if (!asText) {
          return false;
        }
        const asNumber = toNumber(value);
        // A rate column reads '0%' rather than '0', so both forms of "nothing here" count.
        return asNumber === null ? asText !== '0%' : asNumber !== 0;
      });
    });
  }

  private addTaxSummary(builder: SheetBuilder, invoice: Payload, taxRows: Payload[], taxColumns: TaxColumn[]): void {
    if (taxRows.length === 0 || taxColumns.length === 0) {
      return;
    }

    builder.section('Tax Summary');
    builder.row(taxColumns.map((column) => ({ value: column.header, style: 'columnHeader' as const })));

    for (const taxRow of taxRows) {
      builder.row(taxColumns.map((column) => (
        column.numeric
          ? { value: toNumber(taxRow[column.field]), style: 'number' as const }
          : { value: text(taxRow[column.field]), style: 'text' as const }
      )));
    }

    const taxTotals = invoice['tax_details_total'];
    if (taxTotals) {
      builder.row(taxColumns.map((column, index) => {
        if (index === 0) {
          return { value: text(taxTotals['name']) || 'Total', style: 'totalLabel' as const };
        }
        if (!column.totalField) {
          return { value: null, style: 'totalLabel' as const };
        }
        return { value: toNumber(taxTotals[column.totalField]), style: 'totalNumber' as const };
      }));
    }
    builder.blank();
  }

  private addTaxBreakup(builder: SheetBuilder, invoice: Payload): void {
    const breakup: Payload[] = Array.isArray(invoice['tax_split_up_total']) ? invoice['tax_split_up_total'] : [];
    if (breakup.length === 0) {
      return;
    }

    builder.section('Tax Breakup');
    builder.row([
      { value: 'Description', style: 'columnHeader' },
      { value: 'Rate', style: 'columnHeader' },
      { value: 'Amount', style: 'columnHeader' }
    ]);
    for (const line of breakup) {
      builder.row([
        { value: text(line['name']), style: 'text' },
        { value: text(line['rate']), style: 'text' },
        { value: toNumber(line['amount']), style: 'number' }
      ]);
    }
    builder.blank();
  }

  private addNotes(builder: SheetBuilder, invoice: Payload): void {
    const others = invoice['others'] ?? {};
    const config = invoice['config'] ?? {};

    if (config['display_arrears']) {
      builder.section('Outstanding');
      builder.field('Arrears', text(others['arrears']));
      builder.field('Total Outstanding', text(others['total_outstand']));
      builder.blank();
    }

    const terms = text(others['terms_and_conditions']);
    if (terms) {
      builder.section('Terms & Conditions');
      builder.fullWidth(terms);
      builder.blank();
    }

    const footer: Payload[] = Array.isArray(invoice['footer']) ? invoice['footer'] : [];
    const footerLines = footer.map((line) => text(line?.['value'] ?? line)).filter(Boolean);
    if (footerLines.length > 0) {
      builder.section('Notes');
      for (const line of footerLines) {
        builder.fullWidth(line);
      }
    }
  }
}
