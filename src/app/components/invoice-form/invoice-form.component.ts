import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  DataService,
  Invoice,
  InvoiceApiErrorMessages,
  InvoiceItem,
  PartyType,
  Product
} from '../../services/data.service';

// One thing wrong with the invoice, from either side of the save. `row` is the 1-based line
// number the user sees in the Si column; null means the fault sits on the invoice itself
// rather than on a line.
export interface InvoiceValidationError {
  row: number | null;
  field: string;
  message: string;
}

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

  // Validation popup state
  validationErrors: InvoiceValidationError[] = [];
  validationTitle = '';
  showValidationPopup = false;
  saving = false;

  // Required line-item cells, in the order they appear in the grid, so the popup lists a
  // row's missing fields left to right the way the user scans them.
  private readonly requiredItemFields: Array<{
    key: keyof InvoiceItem;
    label: string;
    message: string;
  }> = [
    { key: 'productName', label: 'Product Name', message: 'This field is required.' },
    { key: 'qty', label: 'Qty', message: 'Enter a quantity greater than zero.' },
    { key: 'rate', label: 'Rate', message: 'Enter a rate greater than zero.' },
    { key: 'taxRate', label: 'Tax Rate', message: 'This field is required.' }
  ];

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

  // The single place a save attempt decides what is wrong with the invoice. It runs twice per
  // attempt: once with no argument - the required-field sweep that has to pass before the API
  // is called at all - and once with the response's error_messages, for the row faults only the
  // backend can find. Both sources land in the same list behind the same popup, so a missing
  // cell and a rejected one read identically to the user. Returns true when nothing is wrong.
  validateInvoice(apiErrorMessages?: InvoiceApiErrorMessages | null): boolean {
    const errors: InvoiceValidationError[] = apiErrorMessages
      ? this.collectApiErrors(apiErrorMessages)
      : this.collectRequiredFieldErrors();

    // A rejection the response gave us nothing to explain still has to say so, rather than
    // closing quietly and looking like the invoice saved.
    if (apiErrorMessages && errors.length === 0) {
      errors.push({
        row: null,
        field: 'Invoice',
        message: 'The invoice could not be saved. Please try again.'
      });
    }

    this.validationTitle = apiErrorMessages
      ? 'The invoice was rejected'
      : 'Required details are missing';
    this.validationErrors = errors;
    this.showValidationPopup = errors.length > 0;

    return errors.length === 0;
  }

  // Front-end pass: every required cell of every row, plus the invoice-level essentials.
  private collectRequiredFieldErrors(): InvoiceValidationError[] {
    const errors: InvoiceValidationError[] = [];

    if (!this.selectedParty || !this.selectedParty.trim()) {
      errors.push({ row: null, field: 'Select Party', message: 'This field is required.' });
    }

    if (this.items.length === 0) {
      errors.push({ row: null, field: 'Items', message: 'Add at least one item to the invoice.' });
    }

    this.items.forEach((item, index) => {
      this.requiredItemFields.forEach(field => {
        const value = item[field.key];
        const missing = typeof value === 'number'
          ? !(value > 0)
          : !String(value ?? '').trim();

        if (missing) {
          errors.push({ row: index + 1, field: field.label, message: field.message });
        }
      });
    });

    return errors;
  }

  // Response pass: `items` is positional, so an entry's index is its row number - index 3 is
  // Row 4. Every other key describes the invoice header instead of a line.
  private collectApiErrors(apiErrorMessages: InvoiceApiErrorMessages): InvoiceValidationError[] {
    const errors: InvoiceValidationError[] = [];
    const itemErrors = apiErrorMessages.items;

    if (Array.isArray(itemErrors)) {
      itemErrors.forEach((rowErrors, index) => {
        this.pushFieldErrors(errors, index + 1, rowErrors);
      });
    }

    Object.keys(apiErrorMessages)
      .filter(key => key !== 'items')
      .forEach(key => {
        this.pushFieldErrors(errors, null, { [key]: apiErrorMessages[key] });
      });

    return errors;
  }

  // Unpacks one { field: [messages] } bag. The backend sends a list per field, and sometimes a
  // bare string, so both shapes are flattened to one popup line each.
  private pushFieldErrors(
    errors: InvoiceValidationError[],
    row: number | null,
    fieldErrors: unknown
  ): void {
    if (!fieldErrors || typeof fieldErrors !== 'object') {
      return;
    }

    Object.entries(fieldErrors as Record<string, unknown>).forEach(([field, messages]) => {
      const list = Array.isArray(messages) ? messages : [messages];
      list.forEach(message => {
        if (message === null || message === undefined || message === '') {
          return;
        }
        errors.push({ row, field: this.fieldLabel(field), message: String(message) });
      });
    });
  }

  // Backend field names reach the user as-is in spirit but not in spelling: pro_serial_no
  // reads as 'Pro Serial No', so the popup still names the field the response complained about.
  private fieldLabel(field: string): string {
    const known = this.requiredItemFields.find(f => f.key === field);
    if (known) {
      return known.label;
    }

    return field
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, char => char.toUpperCase())
      .trim();
  }

  closeValidationPopup(): void {
    this.showValidationPopup = false;
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.closeValidationPopup();
  }

  saveInvoice(): void {
    if (this.saving) {
      return;
    }

    // Before the call: nothing is posted until every required cell in every row is filled.
    if (!this.validateInvoice()) {
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

    this.showValidationPopup = false;
    this.saving = true;

    this.dataService
      .saveInvoiceApi(invoicePayload, this.isEditMode ? this.invoiceId : undefined)
      .subscribe({
        next: response => {
          this.saving = false;

          if (response.success) {
            this.router.navigate(['/invoices']);
            return;
          }

          // After the call: the same function, now fed the response, raises the same popup.
          this.validateInvoice(response.error_messages ?? {});
        },
        error: () => {
          this.saving = false;
          this.validateInvoice({});
        }
      });
  }

  goBack(): void {
    this.router.navigate(['/invoices']);
  }

  linkCopied = false;

  getWeblinkUrl(): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/w/${this.invoiceId}`;
  }

  viewInvoiceLink(): void {
    window.open(this.getWeblinkUrl(), '_blank');
  }

  shareInvoiceLink(): void {
    navigator.clipboard?.writeText(this.getWeblinkUrl()).then(() => {
      this.linkCopied = true;
      setTimeout(() => (this.linkCopied = false), 2000);
    });
  }
}
