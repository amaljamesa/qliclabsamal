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
