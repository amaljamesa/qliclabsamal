import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService, Invoice, InvoiceItem, PartyType, Product } from '../../services/data.service';

@Component({
  selector: 'app-invoice-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice-form.component.html',
  styleUrls: ['./invoice-form.component.css']
})
export class InvoiceFormComponent implements OnInit {
  isEditMode = false;
  invoiceId = '';

  // Invoice main fields
  invoiceNo = '';
  invoiceDate = '';
  invoiceTime = '';
  invoiceBranch = 'SML';
  selectedParty = '';
  invoiceMeasure = 'User';
  invoiceBook = 'B2B';
  paymentMode = 'Paid';
  paymentType = 'Credit';

  // Items grid
  items: InvoiceItem[] = [];

  // Summary fields
  productsCount = 0;
  subtotal = 0;
  taxAmount = 0;
  tcs = 0;
  discount = 0;
  totalAmount = 0;

  // Bottom panel custom fields
  noteText = '';
  calcMode = 'basic'; // 'basic' or 'invoice'
  tcsPercent = 0;

  // Master Data
  parties: PartyType[] = [];
  products: Product[] = [];

  // Autocomplete state
  activeRowIndex: number | null = null;
  productSearchQuery = '';
  filteredProducts: Product[] = [];
  showAutocomplete = false;

  constructor(
    private dataService: DataService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadMasters();
    
    // Check if editing
    this.route.params.subscribe(params => {
      const id = params['id'];
      if (id) {
        this.isEditMode = true;
        this.invoiceId = id;
        this.loadInvoice(id);
      } else {
        this.initNewInvoice();
      }
    });
  }

  loadMasters(): void {
    this.parties = this.dataService.getPartyTypes();
    this.products = this.dataService.getProducts();
    if (this.parties.length > 0) {
      this.selectedParty = this.parties[0].name;
    }
  }

  initNewInvoice(): void {
    const today = new Date();
    // YYYY-MM-DD
    this.invoiceDate = today.toISOString().substring(0, 10);
    
    // Time AM/PM
    let hours = today.getHours();
    const minutes = String(today.getMinutes()).padStart(2, '0');
    const seconds = String(today.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 should be 12
    this.invoiceTime = `${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;

    // Seed default items
    this.items = [
      { productName: 'test', qty: 12, rate: 10.00, taxRate: 'GST @ 18%', amount: 120.00 },
      { productName: 'test1', qty: 5, rate: 20.00, taxRate: 'GST @ 18%', amount: 100.00 }
    ];

    // Generate next invoice number to show in view
    const invoices = this.dataService.getInvoices();
    const nextNum = invoices.length > 0
      ? Math.max(...invoices.map(inv => {
          const match = inv.invoiceNo.match(/S-26-(\d+)/);
          return match ? parseInt(match[1]) : 0;
        })) + 1
      : 30;
    this.invoiceNo = `S-26-${nextNum.toString().padStart(5, '0')}`;
    this.noteText = `Invoice No.${this.invoiceNo} | `;
    this.calculateTotals();
  }

  loadInvoice(id: string): void {
    const inv = this.dataService.getInvoice(id);
    if (inv) {
      this.invoiceNo = inv.invoiceNo;
      this.invoiceDate = inv.date;
      this.invoiceTime = inv.time;
      this.invoiceBranch = inv.branch;
      this.selectedParty = inv.partyName;
      this.invoiceMeasure = inv.measure || 'User';
      this.invoiceBook = inv.book || 'B2B';
      this.paymentMode = inv.paymentMode;
      this.paymentType = inv.paymentType;
      this.items = JSON.parse(JSON.stringify(inv.items)); // deep copy
      
      this.tcs = inv.tcs;
      this.discount = inv.discount;
      this.calculateTotals();
      
      // Calculate TCS percent after totals are computed
      if (this.subtotal > 0) {
        if (this.calcMode === 'invoice') {
          const totalBase = this.subtotal + this.taxAmount;
          this.tcsPercent = totalBase > 0 ? parseFloat(((this.tcs * 100) / totalBase).toFixed(2)) : 0;
        } else {
          this.tcsPercent = parseFloat(((this.tcs * 100) / this.subtotal).toFixed(2));
        }
      } else {
        this.tcsPercent = 0;
      }
      this.noteText = `Invoice No.${this.invoiceNo} | `;
    } else {
      alert('Invoice not found');
      this.router.navigate(['/invoices']);
    }
  }

  calculateRowAmount(item: InvoiceItem): void {
    item.amount = (item.qty || 0) * (item.rate || 0);
    this.calculateTotals();
  }

  calculateTotals(): void {
    this.productsCount = this.items.length;
    this.subtotal = this.items.reduce((sum, item) => sum + (item.amount || 0), 0);
    
    // Calculate Tax dynamically based on row tax rates
    let taxSum = 0;
    this.items.forEach(item => {
      let ratePercent = 0;
      const rateMatch = item.taxRate.match(/GST\s*@\s*(\d+)%/i);
      if (rateMatch) {
        ratePercent = parseInt(rateMatch[1]) / 100;
      }
      taxSum += (item.amount || 0) * ratePercent;
    });

    this.taxAmount = parseFloat(taxSum.toFixed(2));

    // Update TCS Amt based on current tcsPercent and calcMode
    const base = this.calcMode === 'invoice' ? (this.subtotal + this.taxAmount) : this.subtotal;
    this.tcs = parseFloat(((base * (this.tcsPercent || 0)) / 100).toFixed(2));

    this.totalAmount = parseFloat((this.subtotal + this.taxAmount + this.tcs - (this.discount || 0)).toFixed(2));
  }

  onTcsPercentChange(): void {
    const base = this.calcMode === 'invoice' ? (this.subtotal + this.taxAmount) : this.subtotal;
    this.tcs = parseFloat(((base * (this.tcsPercent || 0)) / 100).toFixed(2));
    this.calculateTotals();
  }

  onTcsAmtChange(): void {
    const base = this.calcMode === 'invoice' ? (this.subtotal + this.taxAmount) : this.subtotal;
    this.tcsPercent = base > 0 ? parseFloat((((this.tcs || 0) * 100) / base).toFixed(2)) : 0;
    this.calculateTotals();
  }

  onCalcModeChange(): void {
    const base = this.calcMode === 'invoice' ? (this.subtotal + this.taxAmount) : this.subtotal;
    this.tcs = parseFloat(((base * (this.tcsPercent || 0)) / 100).toFixed(2));
    this.calculateTotals();
  }

  addItem(): void {
    this.items.push({
      productName: '',
      qty: 1,
      rate: 0,
      taxRate: 'GST @ 18%',
      amount: 0
    });
    this.calculateTotals();
  }

  deleteItem(index: number): void {
    this.items.splice(index, 1);
    this.calculateTotals();
  }

  // Autocomplete Search logic
  onProductSearch(index: number, event: Event): void {
    this.activeRowIndex = index;
    const inputVal = (event.target as HTMLInputElement).value;
    this.productSearchQuery = inputVal;

    if (!inputVal.trim()) {
      this.filteredProducts = [];
      this.showAutocomplete = false;
      return;
    }

    this.filteredProducts = this.dataService.getProducts(inputVal);
    this.showAutocomplete = this.filteredProducts.length > 0;
  }

  selectProduct(index: number, prod: Product): void {
    this.items[index].productName = prod.name;
    this.items[index].rate = prod.rate;
    this.items[index].taxRate = prod.taxRate;
    this.items[index].amount = this.items[index].qty * prod.rate;
    
    this.showAutocomplete = false;
    this.activeRowIndex = null;
    this.calculateTotals();
  }

  // Close dropdown on click outside
  @HostListener('document:click', ['$event'])
  onClickOutside(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.autocomplete-container') && !target.closest('.prod-search-input')) {
      this.showAutocomplete = false;
      this.activeRowIndex = null;
    }
  }

  addNewPartyInline(): void {
    const newName = prompt('Enter New Party Name:');
    if (newName && newName.trim()) {
      const added = this.dataService.addPartyType(newName.trim(), newName.trim());
      this.parties = this.dataService.getPartyTypes();
      this.selectedParty = added.name;
    }
  }

  saveInvoice(): void {
    if (!this.selectedParty) {
      alert('Please select a party.');
      return;
    }
    if (this.items.length === 0) {
      alert('Please add at least one item to the invoice.');
      return;
    }

    const invalidItem = this.items.find(item => !item.productName.trim() || item.qty <= 0 || item.rate <= 0);
    if (invalidItem) {
      alert('Please fill out all product details (Product Name, Qty and Rate must be greater than zero).');
      return;
    }

    const invoicePayload = {
      date: this.invoiceDate,
      time: this.invoiceTime,
      branch: this.invoiceBranch,
      partyName: this.selectedParty,
      paymentMode: this.paymentMode,
      paymentType: this.paymentType,
      items: this.items,
      subtotal: this.subtotal,
      taxAmount: this.taxAmount,
      tcs: this.tcs,
      discount: this.discount,
      totalAmount: this.totalAmount,
      measure: this.invoiceMeasure,
      book: this.invoiceBook
    };

    if (this.isEditMode) {
      this.dataService.updateInvoice(this.invoiceId, invoicePayload);
    } else {
      this.dataService.addInvoice(invoicePayload);
    }

    this.router.navigate(['/invoices']);
  }

  goBack(): void {
    this.router.navigate(['/invoices']);
  }
}
