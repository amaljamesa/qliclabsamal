export interface InvoiceWeblinkItem {
  description: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface InvoiceWeblinkCustomer {
  name: string;
  registeredMobile: string; // masked, e.g. 98xxxxx472
  email?: string;
  billingAddress?: string;
}

export type InvoiceWeblinkDocType = 'Invoice' | 'Estimate' | 'Payment Request';

export type InvoiceWeblinkStatus = 'Delivered' | 'Opened' | 'Viewed' | 'Downloaded' | 'Disputed' | 'Paid';

export interface InvoiceWeblinkTotals {
  subtotal: number;
  taxAmount: number;
  discount: number;
  total: number;
  currencySymbol: string;
}

export interface InvoiceTaxSlabItem {
  code: string; // SKU / item code
  description: string;
  hsnSac: string;
  qty: number;
  unit: string; // 'PC'
  price: number;
  discAmount: number;
  netAmount: number;
  taxableAmount: number;
}

export interface InvoiceTaxSlab {
  label: string; // 'A)', 'B)'
  gstLabel: string; // 'CGST@2.5% SGST@2.5%'
  items: InvoiceTaxSlabItem[];
  taxableValue: number;
  cgst: number;
  sgst: number;
  cess: number;
  totalAmount: number;
}

export interface InvoiceTenderLine {
  method: string; // 'CREDIT CARD'
  reference?: string; // masked card/UPI ref
  amount: number;
}

export interface InvoiceStoreDetails {
  legalName: string;
  contactNumber?: string;
  placeOfSupply: string;
  gstin: string;
}

export interface InvoiceWeblink {
  token: string;
  docType: InvoiceWeblinkDocType;
  invoiceNo: string;
  issueDate: string;
  dueDate?: string;
  supplierId: string;
  supplierName: string;
  customer: InvoiceWeblinkCustomer;
  items: InvoiceWeblinkItem[];
  totals: InvoiceWeblinkTotals;
  statuses: InvoiceWeblinkStatus[];
  paymentEnabled: boolean;
  isPaid: boolean;
  supportContact?: string;
  revoked?: boolean;

  // Tax-invoice / receipt fields (bills.razorpay.com-style receipt)
  store?: InvoiceStoreDetails;
  counter?: string;
  cashier?: string;
  customerId?: string;
  taxSlabs?: InvoiceTaxSlab[];
  grossTotal?: number;
  tender?: InvoiceTenderLine[];
  totalItemCount?: number;
  totalQty?: number;
  termsAndConditions?: string[];
  barcodeValue?: string;

  // Payment-request / payment-link fields
  paymentFor?: string;
  businessPoliciesUrl?: string;
  paymentId?: string;
}
