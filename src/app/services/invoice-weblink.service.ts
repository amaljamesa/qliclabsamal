import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { DataService, Invoice, InvoiceItem } from './data.service';
import { DEFAULT_SUPPLIER_ID } from './brand-window.service';
import {
  InvoiceWeblink,
  InvoiceWeblinkDocType,
  InvoiceWeblinkStatus,
  InvoiceTaxSlab,
  InvoiceTaxSlabItem
} from '../models/invoice-weblink.model';

const CURRENCY_SYMBOL = '₹';
const SLAB_LABELS = ['A)', 'B)', 'C)', 'D)', 'E)', 'F)', 'G)', 'H)'];
const DEFAULT_TERMS = [
  'All offers are subject to applicable T&C.',
  'This is a computer generated invoice and hence does not require any signature.'
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Maps this app's real, user-created invoices (DataService) onto the weblink/receipt's
// display model. Nothing here is per-invoice hardcoded data - it all comes from the
// invoice the user actually entered via the invoice form.
@Injectable({
  providedIn: 'root'
})
export class InvoiceWeblinkService {
  private readonly downloadedTokens = new Set<string>();
  private readonly paidTokens = new Set<string>();

  constructor(private dataService: DataService) {}

  getByToken(token: string): Observable<InvoiceWeblink> {
    const invoice = this.dataService.getInvoice(token);
    if (!invoice) {
      return throwError(() => new Error('Invoice link not found or has been revoked.'));
    }
    return of(this.mapInvoiceToWeblink(invoice)).pipe(delay(300));
  }

  markDownloaded(token: string): Observable<boolean> {
    this.downloadedTokens.add(token);
    return of(true).pipe(delay(150));
  }

  markPaid(token: string): Observable<boolean> {
    this.paidTokens.add(token);
    return of(true).pipe(delay(150));
  }

  private mapInvoiceToWeblink(invoice: Invoice): InvoiceWeblink {
    const taxSlabs = this.buildTaxSlabs(invoice.items);
    const grossTotal = round2(invoice.subtotal + invoice.taxAmount);
    // Unpaid ("Not Paid") invoices are shown as a payment-request page so the customer
    // can pay; paid invoices render as the full tax-invoice receipt.
    const isPaid = this.paidTokens.has(invoice.id) || invoice.paymentMode?.toLowerCase() === 'paid';
    const docType: InvoiceWeblinkDocType = isPaid ? 'Invoice' : 'Payment Request';

    const statuses: InvoiceWeblinkStatus[] = ['Delivered'];
    if (this.downloadedTokens.has(invoice.id)) {
      statuses.push('Downloaded');
    }
    if (isPaid) {
      statuses.push('Paid');
    }

    return {
      token: invoice.id,
      docType,
      invoiceNo: invoice.invoiceNo,
      issueDate: `${invoice.date} ${invoice.time}`,
      supplierId: DEFAULT_SUPPLIER_ID,
      // Placeholder until the business profile (name/legal/GSTIN) is merged in by the
      // page component - see InvoiceWeblinkComponent.onVerified().
      supplierName: '',
      customer: {
        name: invoice.partyName,
        registeredMobile: ''
      },
      items: invoice.items.map(item => ({
        description: item.productName,
        qty: item.qty,
        rate: item.rate,
        amount: item.amount
      })),
      totals: {
        subtotal: invoice.subtotal,
        taxAmount: invoice.taxAmount,
        discount: invoice.discount,
        total: invoice.totalAmount,
        currencySymbol: CURRENCY_SYMBOL
      },
      statuses,
      paymentEnabled: !isPaid,
      isPaid,
      supportContact: '',
      revoked: false,

      taxSlabs,
      grossTotal,
      tender: [
        {
          method: (invoice.paymentType || invoice.paymentMode || 'Payment').toUpperCase(),
          amount: invoice.totalAmount
        }
      ],
      totalItemCount: invoice.items.length,
      totalQty: invoice.items.reduce((sum, item) => sum + (item.qty || 0), 0),
      termsAndConditions: DEFAULT_TERMS,
      barcodeValue: invoice.invoiceNo.replace(/[^A-Za-z0-9]/g, ''),
      paymentFor: invoice.items.map(item => item.productName).join(', ')
    };
  }

  private buildTaxSlabs(items: InvoiceItem[]): InvoiceTaxSlab[] {
    const groups = new Map<string, InvoiceItem[]>();
    for (const item of items) {
      const key = item.taxRate || 'Exempted';
      const group = groups.get(key);
      if (group) {
        group.push(item);
      } else {
        groups.set(key, [item]);
      }
    }

    let labelIndex = 0;
    const slabs: InvoiceTaxSlab[] = [];
    for (const [taxRate, groupItems] of groups) {
      const percent = this.parseTaxPercent(taxRate);
      const halfPercent = round2(percent / 2);
      const gstLabel = percent > 0 ? `CGST@${halfPercent}% SGST@${halfPercent}%` : taxRate;

      const slabItems: InvoiceTaxSlabItem[] = groupItems.map(item => {
        const taxableAmount = round2(item.amount);
        const itemTax = round2(item.amount * (percent / 100));
        return {
          code: item.productName,
          description: '',
          hsnSac: '',
          qty: item.qty,
          unit: 'PC',
          price: item.rate,
          discAmount: 0,
          netAmount: round2(taxableAmount + itemTax),
          taxableAmount
        };
      });

      const taxableValue = round2(slabItems.reduce((sum, item) => sum + item.taxableAmount, 0));
      const cgst = round2(taxableValue * (halfPercent / 100));
      const sgst = cgst;

      slabs.push({
        label: SLAB_LABELS[labelIndex] || `${labelIndex + 1})`,
        gstLabel,
        items: slabItems,
        taxableValue,
        cgst,
        sgst,
        cess: 0,
        totalAmount: round2(taxableValue + cgst + sgst)
      });
      labelIndex++;
    }
    return slabs;
  }

  private parseTaxPercent(taxRate: string): number {
    const match = taxRate.match(/(\d+(\.\d+)?)\s*%/);
    return match ? parseFloat(match[1]) : 0;
  }
}
