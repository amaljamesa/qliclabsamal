import { Injectable } from '@angular/core';

export interface PartyType {
  id: number;
  name: string;
  printName: string;
}

export interface Product {
  id: number;
  name: string;
  mrp: number;
  rate: number;
  taxRate: string;
  stock: string;
}

export interface InvoiceItem {
  id?: number;
  productName: string;
  qty: number;
  rate: number;
  taxRate: string;
  amount: number;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  date: string; // YYYY-MM-DD
  time: string;
  branch: string;
  partyName: string;
  paymentMode: string; // 'Post', 'Cash', 'Credit'
  paymentType: string; // 'Cash', 'Credit', 'UPI', 'Card'
  items: InvoiceItem[];
  subtotal: number;
  taxAmount: number;
  tcs: number;
  discount: number;
  totalAmount: number;
  measure?: string;
  book?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private partyTypes: PartyType[] = [
    { id: 1, name: 'N/A', printName: 'N/A' },
    { id: 2, name: 'test', printName: 'test' },
    { id: 3, name: 'test1', printName: 'test1' },
    { id: 4, name: 'test2', printName: 'test2' },
    { id: 5, name: 'test3', printName: 'test3' },
    { id: 6, name: 'test4', printName: 'test4' },
    { id: 7, name: 'test5', printName: 'test5' },
    { id: 8, name: 'test6', printName: 'test6' }
  ];

  private products: Product[] = [
    { id: 1, name: 'test', mrp: 12.00, rate: 10.00, taxRate: 'GST @ 18%', stock: '50 PCS' },
    { id: 2, name: 'test1', mrp: 24.00, rate: 20.00, taxRate: 'GST @ 18%', stock: '120 PCS' },
    { id: 3, name: 'test2', mrp: 25.00, rate: 20.00, taxRate: 'GST @ 18%', stock: '85 PCS' },
    { id: 4, name: 'test3', mrp: 300.00, rate: 250.00, taxRate: 'GST @ 2%', stock: '15 PCS' },
    { id: 5, name: 'test4', mrp: 25.00, rate: 20.00, taxRate: 'Exempted', stock: '200 PCS' },
    { id: 6, name: 'test5', mrp: 40.00, rate: 36.00, taxRate: 'GST @ 0%', stock: '94 PCS' },
    { id: 7, name: 'test6', mrp: 120.00, rate: 100.00, taxRate: 'GST @ 12%', stock: '160 PCS' },
    { id: 8, name: 'test7', mrp: 1200.00, rate: 1000.00, taxRate: 'GST @ 18%', stock: '0 PCS' },
    { id: 9, name: 'test8', mrp: 1200.00, rate: 1000.00, taxRate: 'GST @ 18%', stock: '10 PCS' },
    { id: 10, name: 'test9', mrp: 1200.00, rate: 1000.00, taxRate: 'GST @ 18%', stock: '0 PCS' },
    { id: 11, name: 'test10', mrp: 1500.00, rate: 1200.00, taxRate: 'GST @ 18%', stock: '21 PCS' }
  ];

  private invoices: Invoice[] = [
    {
      id: 'S-26-00035',
      invoiceNo: 'S-26-00035',
      date: '2026-06-02',
      time: '09:21:01 AM',
      branch: 'SMB',
      partyName: 'test',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 292.00, taxRate: 'GST @ 0%', amount: 292.00 }],
      subtotal: 292.00,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 292.00
    },
    {
      id: 'S-26-00034',
      invoiceNo: 'S-26-00034',
      date: '2026-06-02',
      time: '09:19:54 AM',
      branch: 'SMB',
      partyName: 'test',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test1', qty: 1, rate: 20.00, taxRate: 'GST @ 0%', amount: 20.00 }],
      subtotal: 20.00,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 20.00
    },
    {
      id: 'S-26-00033',
      invoiceNo: 'S-26-00033',
      date: '2026-06-02',
      time: '09:19:27 AM',
      branch: 'SMB',
      partyName: 'test',
      paymentMode: 'Paid',
      paymentType: 'Multi - Payment',
      items: [{ productName: 'test', qty: 1, rate: 270.00, taxRate: 'GST @ 0%', amount: 270.00 }],
      subtotal: 270.00,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 270.00
    },
    {
      id: 'S-26-00032',
      invoiceNo: 'S-26-00032',
      date: '2026-05-27',
      time: '12:03:12 PM',
      branch: 'SMB',
      partyName: 'test',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 250.00, taxRate: 'GST @ 0%', amount: 250.00 }],
      subtotal: 250.00,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 250.00
    },
    {
      id: 'S-26-00031',
      invoiceNo: 'S-26-00031',
      date: '2026-05-21',
      time: '12:31:14 PM',
      branch: 'SMB',
      partyName: 'test',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 18860.00, taxRate: 'GST @ 0%', amount: 18860.00 }],
      subtotal: 18860.00,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 18860.00
    },
    {
      id: 'S-26-00030',
      invoiceNo: 'S-26-00030',
      date: '2026-05-19',
      time: '03:09:57 PM',
      branch: 'SMB',
      partyName: 'test',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 20.00, taxRate: 'GST @ 0%', amount: 20.00 }],
      subtotal: 20.00,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 20.00
    },
    {
      id: 'S-26-00029',
      invoiceNo: 'S-26-00029',
      date: '2026-05-19',
      time: '02:56:23 PM',
      branch: 'SMB',
      partyName: 'test1',
      paymentMode: 'Paid',
      paymentType: 'Multi - Payment',
      items: [{ productName: 'test', qty: 1, rate: 18824.00, taxRate: 'GST @ 0%', amount: 18824.00 }],
      subtotal: 18824.00,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 18824.00
    },
    {
      id: 'S-26-00028',
      invoiceNo: 'S-26-00028',
      date: '2026-05-06',
      time: '05:29:11 PM',
      branch: 'SMB',
      partyName: 'test',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 124.00, taxRate: 'GST @ 0%', amount: 124.00 }],
      subtotal: 124.00,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 124.00
    },
    {
      id: 'S-26-00027',
      invoiceNo: 'S-26-00027',
      date: '2026-05-06',
      time: '05:28:44 PM',
      branch: 'SMB',
      partyName: 'test',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 634.00, taxRate: 'GST @ 0%', amount: 634.00 }],
      subtotal: 634.00,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 634.00
    },
    {
      id: 'S-26-00026',
      invoiceNo: 'S-26-00026',
      date: '2026-05-06',
      time: '12:01:13 PM',
      branch: 'SMB',
      partyName: 'test',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 400.00, taxRate: 'GST @ 0%', amount: 400.00 }],
      subtotal: 400.00,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 400.00
    },
    {
      id: 'S-26-00025',
      invoiceNo: 'S-26-00025',
      date: '2026-04-21',
      time: '11:01:49 AM',
      branch: 'SMB',
      partyName: 'test',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 335.00, taxRate: 'GST @ 0%', amount: 335.00 }],
      subtotal: 335.00,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 335.00
    },
    {
      id: 'S-26-00024',
      invoiceNo: 'S-26-00024',
      date: '2026-04-21',
      time: '10:19:46 AM',
      branch: 'SMB',
      partyName: 'test',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 190.00, taxRate: 'GST @ 0%', amount: 190.00 }],
      subtotal: 190.00,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 190.00
    },
    {
      id: 'S-26-00023',
      invoiceNo: 'S-26-00023',
      date: '2026-04-20',
      time: '12:25:24 PM',
      branch: 'SMB',
      partyName: 'test',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 200.00, taxRate: 'GST @ 0%', amount: 200.00 }],
      subtotal: 200.00,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 200.00
    },
    {
      id: 'S-26-00022',
      invoiceNo: 'S-26-00022',
      date: '2026-04-20',
      time: '11:37:38 AM',
      branch: 'SMB',
      partyName: 'test',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 190.00, taxRate: 'GST @ 0%', amount: 190.00 }],
      subtotal: 190.00,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 190.00
    },
    {
      id: 'S-26-00021',
      invoiceNo: 'S-26-00021',
      date: '2026-04-18',
      time: '02:29:41 PM',
      branch: 'SMB',
      partyName: 'test',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 210.00, taxRate: 'GST @ 0%', amount: 210.00 }],
      subtotal: 210.00,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 210.00
    },
    {
      id: 'S-26-00020',
      invoiceNo: 'S-26-00020',
      date: '2026-04-18',
      time: '01:36:33 PM',
      branch: 'SMB',
      partyName: 'test',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 290.00, taxRate: 'GST @ 0%', amount: 290.00 }],
      subtotal: 290.00,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 290.00
    },
    {
      id: 'S-26-00019',
      invoiceNo: 'S-26-00019',
      date: '2026-04-17',
      time: '02:03:55 PM',
      branch: 'SMB',
      partyName: 'test',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 2195.00, taxRate: 'GST @ 0%', amount: 2195.00 }],
      subtotal: 2195.00,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 2195.00
    },
    // Invoices for a dedicated 'Multipage Demo' party so its ledger (Invoice List -> ledger
    // icon) spans multiple pages, making the multi-page pagination/footer fix inspectable
    // without mixing into the regular 'test' party's invoice history.
    {
      id: 'S-26-00101',
      invoiceNo: 'S-26-00101',
      date: '2026-04-01',
      time: '09:00:00 AM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test2', qty: 1, rate: 1923.69, taxRate: 'GST @ 0%', amount: 1923.69 }],
      subtotal: 1923.69,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 1923.69
    },
    {
      id: 'S-26-00102',
      invoiceNo: 'S-26-00102',
      date: '2026-04-03',
      time: '10:07:03 AM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 746.00, taxRate: 'GST @ 0%', amount: 746.00 }],
      subtotal: 746.00,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 746.00
    },
    {
      id: 'S-26-00103',
      invoiceNo: 'S-26-00103',
      date: '2026-04-05',
      time: '11:14:06 AM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 2034.95, taxRate: 'GST @ 0%', amount: 2034.95 }],
      subtotal: 2034.95,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 2034.95
    },
    {
      id: 'S-26-00104',
      invoiceNo: 'S-26-00104',
      date: '2026-04-07',
      time: '12:21:09 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 1777.62, taxRate: 'GST @ 0%', amount: 1777.62 }],
      subtotal: 1777.62,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 1777.62
    },
    {
      id: 'S-26-00105',
      invoiceNo: 'S-26-00105',
      date: '2026-04-09',
      time: '01:28:12 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 294.68, taxRate: 'GST @ 0%', amount: 294.68 }],
      subtotal: 294.68,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 294.68
    },
    {
      id: 'S-26-00106',
      invoiceNo: 'S-26-00106',
      date: '2026-04-11',
      time: '02:35:15 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test3', qty: 1, rate: 1690.32, taxRate: 'GST @ 0%', amount: 1690.32 }],
      subtotal: 1690.32,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 1690.32
    },
    {
      id: 'S-26-00107',
      invoiceNo: 'S-26-00107',
      date: '2026-04-13',
      time: '03:42:18 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test2', qty: 1, rate: 673.02, taxRate: 'GST @ 0%', amount: 673.02 }],
      subtotal: 673.02,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 673.02
    },
    {
      id: 'S-26-00108',
      invoiceNo: 'S-26-00108',
      date: '2026-04-15',
      time: '04:49:21 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test1', qty: 1, rate: 2431.15, taxRate: 'GST @ 0%', amount: 2431.15 }],
      subtotal: 2431.15,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 2431.15
    },
    {
      id: 'S-26-00109',
      invoiceNo: 'S-26-00109',
      date: '2026-04-17',
      time: '09:56:24 AM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test2', qty: 1, rate: 2098.95, taxRate: 'GST @ 0%', amount: 2098.95 }],
      subtotal: 2098.95,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 2098.95
    },
    {
      id: 'S-26-00110',
      invoiceNo: 'S-26-00110',
      date: '2026-04-19',
      time: '10:03:27 AM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 479.11, taxRate: 'GST @ 0%', amount: 479.11 }],
      subtotal: 479.11,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 479.11
    },
    {
      id: 'S-26-00111',
      invoiceNo: 'S-26-00111',
      date: '2026-04-21',
      time: '11:10:30 AM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test2', qty: 1, rate: 291.85, taxRate: 'GST @ 0%', amount: 291.85 }],
      subtotal: 291.85,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 291.85
    },
    {
      id: 'S-26-00112',
      invoiceNo: 'S-26-00112',
      date: '2026-04-23',
      time: '12:17:33 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test2', qty: 1, rate: 2544.77, taxRate: 'GST @ 0%', amount: 2544.77 }],
      subtotal: 2544.77,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 2544.77
    },
    {
      id: 'S-26-00113',
      invoiceNo: 'S-26-00113',
      date: '2026-04-25',
      time: '01:24:36 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Multi - Payment',
      items: [{ productName: 'test', qty: 1, rate: 2424.28, taxRate: 'GST @ 0%', amount: 2424.28 }],
      subtotal: 2424.28,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 2424.28
    },
    {
      id: 'S-26-00114',
      invoiceNo: 'S-26-00114',
      date: '2026-04-27',
      time: '02:31:39 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Multi - Payment',
      items: [{ productName: 'test', qty: 1, rate: 2919.75, taxRate: 'GST @ 0%', amount: 2919.75 }],
      subtotal: 2919.75,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 2919.75
    },
    {
      id: 'S-26-00115',
      invoiceNo: 'S-26-00115',
      date: '2026-04-29',
      time: '03:38:42 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test2', qty: 1, rate: 1662.84, taxRate: 'GST @ 0%', amount: 1662.84 }],
      subtotal: 1662.84,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 1662.84
    },
    {
      id: 'S-26-00116',
      invoiceNo: 'S-26-00116',
      date: '2026-05-01',
      time: '04:45:45 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 1738.40, taxRate: 'GST @ 0%', amount: 1738.40 }],
      subtotal: 1738.40,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 1738.40
    },
    {
      id: 'S-26-00117',
      invoiceNo: 'S-26-00117',
      date: '2026-05-03',
      time: '09:52:48 AM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 1988.87, taxRate: 'GST @ 0%', amount: 1988.87 }],
      subtotal: 1988.87,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 1988.87
    },
    {
      id: 'S-26-00118',
      invoiceNo: 'S-26-00118',
      date: '2026-05-05',
      time: '10:59:51 AM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test3', qty: 1, rate: 2568.12, taxRate: 'GST @ 0%', amount: 2568.12 }],
      subtotal: 2568.12,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 2568.12
    },
    {
      id: 'S-26-00119',
      invoiceNo: 'S-26-00119',
      date: '2026-05-07',
      time: '11:06:54 AM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test1', qty: 1, rate: 844.75, taxRate: 'GST @ 0%', amount: 844.75 }],
      subtotal: 844.75,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 844.75
    },
    {
      id: 'S-26-00120',
      invoiceNo: 'S-26-00120',
      date: '2026-05-09',
      time: '12:13:57 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test2', qty: 1, rate: 1119.99, taxRate: 'GST @ 0%', amount: 1119.99 }],
      subtotal: 1119.99,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 1119.99
    },
    {
      id: 'S-26-00121',
      invoiceNo: 'S-26-00121',
      date: '2026-05-11',
      time: '01:20:00 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test1', qty: 1, rate: 2109.93, taxRate: 'GST @ 0%', amount: 2109.93 }],
      subtotal: 2109.93,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 2109.93
    },
    {
      id: 'S-26-00122',
      invoiceNo: 'S-26-00122',
      date: '2026-05-13',
      time: '02:27:03 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test1', qty: 1, rate: 1609.41, taxRate: 'GST @ 0%', amount: 1609.41 }],
      subtotal: 1609.41,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 1609.41
    },
    {
      id: 'S-26-00123',
      invoiceNo: 'S-26-00123',
      date: '2026-05-15',
      time: '03:34:06 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test1', qty: 1, rate: 1394.85, taxRate: 'GST @ 0%', amount: 1394.85 }],
      subtotal: 1394.85,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 1394.85
    },
    {
      id: 'S-26-00124',
      invoiceNo: 'S-26-00124',
      date: '2026-05-17',
      time: '04:41:09 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test1', qty: 1, rate: 2058.57, taxRate: 'GST @ 0%', amount: 2058.57 }],
      subtotal: 2058.57,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 2058.57
    },
    {
      id: 'S-26-00125',
      invoiceNo: 'S-26-00125',
      date: '2026-05-19',
      time: '09:48:12 AM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test3', qty: 1, rate: 2468.08, taxRate: 'GST @ 0%', amount: 2468.08 }],
      subtotal: 2468.08,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 2468.08
    },
    {
      id: 'S-26-00126',
      invoiceNo: 'S-26-00126',
      date: '2026-05-21',
      time: '10:55:15 AM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test2', qty: 1, rate: 814.21, taxRate: 'GST @ 0%', amount: 814.21 }],
      subtotal: 814.21,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 814.21
    },
    {
      id: 'S-26-00127',
      invoiceNo: 'S-26-00127',
      date: '2026-05-23',
      time: '11:02:18 AM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Multi - Payment',
      items: [{ productName: 'test3', qty: 1, rate: 649.69, taxRate: 'GST @ 0%', amount: 649.69 }],
      subtotal: 649.69,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 649.69
    },
    {
      id: 'S-26-00128',
      invoiceNo: 'S-26-00128',
      date: '2026-05-25',
      time: '12:09:21 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Multi - Payment',
      items: [{ productName: 'test1', qty: 1, rate: 2655.78, taxRate: 'GST @ 0%', amount: 2655.78 }],
      subtotal: 2655.78,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 2655.78
    },
    {
      id: 'S-26-00129',
      invoiceNo: 'S-26-00129',
      date: '2026-05-27',
      time: '01:16:24 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test2', qty: 1, rate: 805.67, taxRate: 'GST @ 0%', amount: 805.67 }],
      subtotal: 805.67,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 805.67
    },
    {
      id: 'S-26-00130',
      invoiceNo: 'S-26-00130',
      date: '2026-05-29',
      time: '02:23:27 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Multi - Payment',
      items: [{ productName: 'test3', qty: 1, rate: 2244.84, taxRate: 'GST @ 0%', amount: 2244.84 }],
      subtotal: 2244.84,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 2244.84
    },
    {
      id: 'S-26-00131',
      invoiceNo: 'S-26-00131',
      date: '2026-05-31',
      time: '03:30:30 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test3', qty: 1, rate: 1095.56, taxRate: 'GST @ 0%', amount: 1095.56 }],
      subtotal: 1095.56,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 1095.56
    },
    {
      id: 'S-26-00132',
      invoiceNo: 'S-26-00132',
      date: '2026-06-02',
      time: '04:37:33 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 286.36, taxRate: 'GST @ 0%', amount: 286.36 }],
      subtotal: 286.36,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 286.36
    },
    {
      id: 'S-26-00133',
      invoiceNo: 'S-26-00133',
      date: '2026-06-04',
      time: '09:44:36 AM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test3', qty: 1, rate: 471.23, taxRate: 'GST @ 0%', amount: 471.23 }],
      subtotal: 471.23,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 471.23
    },
    {
      id: 'S-26-00134',
      invoiceNo: 'S-26-00134',
      date: '2026-06-06',
      time: '10:51:39 AM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Multi - Payment',
      items: [{ productName: 'test3', qty: 1, rate: 1795.28, taxRate: 'GST @ 0%', amount: 1795.28 }],
      subtotal: 1795.28,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 1795.28
    },
    {
      id: 'S-26-00135',
      invoiceNo: 'S-26-00135',
      date: '2026-06-08',
      time: '11:58:42 AM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Multi - Payment',
      items: [{ productName: 'test2', qty: 1, rate: 1793.73, taxRate: 'GST @ 0%', amount: 1793.73 }],
      subtotal: 1793.73,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 1793.73
    },
    {
      id: 'S-26-00136',
      invoiceNo: 'S-26-00136',
      date: '2026-06-10',
      time: '12:05:45 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 2913.67, taxRate: 'GST @ 0%', amount: 2913.67 }],
      subtotal: 2913.67,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 2913.67
    },
    {
      id: 'S-26-00137',
      invoiceNo: 'S-26-00137',
      date: '2026-06-12',
      time: '01:12:48 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test2', qty: 1, rate: 2049.91, taxRate: 'GST @ 0%', amount: 2049.91 }],
      subtotal: 2049.91,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 2049.91
    },
    {
      id: 'S-26-00138',
      invoiceNo: 'S-26-00138',
      date: '2026-06-14',
      time: '02:19:51 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test', qty: 1, rate: 2309.27, taxRate: 'GST @ 0%', amount: 2309.27 }],
      subtotal: 2309.27,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 2309.27
    },
    {
      id: 'S-26-00139',
      invoiceNo: 'S-26-00139',
      date: '2026-06-16',
      time: '03:26:54 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test3', qty: 1, rate: 891.10, taxRate: 'GST @ 0%', amount: 891.10 }],
      subtotal: 891.10,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 891.10
    },
    {
      id: 'S-26-00140',
      invoiceNo: 'S-26-00140',
      date: '2026-06-18',
      time: '04:33:57 PM',
      branch: 'SMB',
      partyName: 'Multipage Demo',
      paymentMode: 'Paid',
      paymentType: 'Cash',
      items: [{ productName: 'test1', qty: 1, rate: 24.69, taxRate: 'GST @ 0%', amount: 24.69 }],
      subtotal: 24.69,
      taxAmount: 0,
      tcs: 0,
      discount: 0,
      totalAmount: 24.69
    }
  ];

  // Party Types CRUD
  getPartyTypes(search: string = ''): PartyType[] {
    const term = search.trim().toLowerCase();
    if (!term) return [...this.partyTypes];
    return this.partyTypes.filter(p => 
      p.id.toString().includes(term) ||
      p.name.toLowerCase().includes(term) ||
      p.printName.toLowerCase().includes(term)
    );
  }

  addPartyType(name: string, printName: string): PartyType {
    const maxId = this.partyTypes.length > 0 ? Math.max(...this.partyTypes.map(p => p.id)) : 0;
    const newParty: PartyType = {
      id: maxId + 1,
      name: name || 'Unnamed',
      printName: printName || name || 'Unnamed'
    };
    this.partyTypes.push(newParty);
    return newParty;
  }

  updatePartyType(id: number, name: string, printName: string): boolean {
    const party = this.partyTypes.find(p => p.id === id);
    if (party) {
      party.name = name;
      party.printName = printName;
      return true;
    }
    return false;
  }

  deletePartyType(id: number): boolean {
    const idx = this.partyTypes.findIndex(p => p.id === id);
    if (idx !== -1) {
      this.partyTypes.splice(idx, 1);
      return true;
    }
    return false;
  }

  // Products getter & search
  getProducts(search: string = ''): Product[] {
    const term = search.trim().toLowerCase();
    if (!term) return [...this.products];
    return this.products.filter(p => 
      p.name.toLowerCase().includes(term)
    );
  }

  // Invoices CRUD
  getInvoices(filters?: {
    startDate?: string;
    endDate?: string;
    branch?: string;
    partyName?: string;
    search?: string;
  }): Invoice[] {
    let result = [...this.invoices];

    if (filters) {
      if (filters.startDate) {
        result = result.filter(inv => inv.date >= filters.startDate!);
      }
      if (filters.endDate) {
        result = result.filter(inv => inv.date <= filters.endDate!);
      }
      if (filters.branch && filters.branch !== 'All') {
        result = result.filter(inv => inv.branch.toLowerCase() === filters.branch!.toLowerCase());
      }
      if (filters.partyName && filters.partyName !== 'All') {
        result = result.filter(inv => inv.partyName.toLowerCase() === filters.partyName!.toLowerCase());
      }
      if (filters.search) {
        const term = filters.search.trim().toLowerCase();
        result = result.filter(inv => 
          inv.invoiceNo.toLowerCase().includes(term) ||
          inv.partyName.toLowerCase().includes(term) ||
          inv.paymentType.toLowerCase().includes(term) ||
          inv.totalAmount.toString().includes(term)
        );
      }
    }

    // Sort by date/time descending by default
    return result.sort((a, b) => {
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      return b.time.localeCompare(a.time);
    });
  }

  getInvoice(id: string): Invoice | undefined {
    return this.invoices.find(inv => inv.id === id);
  }

  addInvoice(invoice: Omit<Invoice, 'id' | 'invoiceNo'>): Invoice {
    // Generate new Invoice Number
    const nextNum = this.invoices.length > 0
      ? Math.max(...this.invoices.map(inv => {
          const match = inv.invoiceNo.match(/S-26-(\d+)/);
          return match ? parseInt(match[1]) : 0;
        })) + 1
      : 30;

    const invoiceNo = `S-26-${nextNum.toString().padStart(5, '0')}`;
    const newInvoice: Invoice = {
      ...invoice,
      id: invoiceNo,
      invoiceNo: invoiceNo
    };
    this.invoices.unshift(newInvoice);
    return newInvoice;
  }

  updateInvoice(id: string, updated: Omit<Invoice, 'id' | 'invoiceNo'>): boolean {
    const idx = this.invoices.findIndex(inv => inv.id === id);
    if (idx !== -1) {
      this.invoices[idx] = {
        ...this.invoices[idx],
        ...updated
      };
      return true;
    }
    return false;
  }

  deleteInvoice(id: string): boolean {
    const idx = this.invoices.findIndex(inv => inv.id === id);
    if (idx !== -1) {
      this.invoices.splice(idx, 1);
      return true;
    }
    return false;
  }

  // Dashboard Stats
  getDashboardStats() {
    const todayStr = '2026-06-03'; // Hardcoded as "today" for mock context
    const todayInvoices = this.invoices.filter(inv => inv.date === todayStr);

    const purchaseAmount = 0.00; // Hardcoded mock
    const salesAmount = todayInvoices.reduce((acc, inv) => acc + inv.totalAmount, 0);
    const receiptAmount = todayInvoices
      .filter(inv => inv.paymentType === 'Cash' || inv.paymentMode === 'Cash')
      .reduce((acc, inv) => acc + inv.totalAmount, 0);
    const creditNoteAmount = 0.00;
    const salesReturnAmount = 0.00;

    return {
      purchaseAmount,
      salesAmount,
      receiptAmount,
      creditNoteAmount,
      salesReturnAmount
    };
  }
}
