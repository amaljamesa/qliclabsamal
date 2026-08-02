import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DataService, Invoice } from '../../services/data.service';
import { LedgerService } from '../../services/ledger.service';
import { InvoicePrintService } from '../../services/invoice-print.service';

@Component({
  selector: 'app-invoice-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice-list.component.html',
  styleUrls: ['./invoice-list.component.css']
})
export class InvoiceListComponent implements OnInit {
  invoices: Invoice[] = [];
  
  // Filter states
  startDate = '2026-04-01';
  endDate = '2026-06-30';
  selectedBranch = 'All';
  selectedParty = 'All';
  searchQuery = '';
  viewMode = 'brief'; // 'brief' | 'detailed'

  // Pagination states
  itemsPerPage = 50;
  currentPage = 1;

  // Bulk print selection
  selectedInvoiceIds = new Set<string>();

  constructor(
    private dataService: DataService,
    private router: Router,
    private ledgerService: LedgerService,
    private invoicePrintService: InvoicePrintService
  ) {}

  ngOnInit(): void {
    this.loadInvoices();
  }

  loadInvoices(): void {
    this.invoices = this.dataService.getInvoices({
      startDate: this.startDate,
      endDate: this.endDate,
      branch: this.selectedBranch === 'All' ? undefined : this.selectedBranch,
      partyName: this.selectedParty === 'All' ? undefined : this.selectedParty,
      search: this.searchQuery
    });
    // Selection is scoped to what's currently on screen - a fresh filter/search result can
    // drop rows the user had selected, so start clean rather than keep hold of stale ids.
    this.selectedInvoiceIds.clear();
  }

  applyFilters(): void {
    this.loadInvoices();
  }

  resetFilters(): void {
    this.startDate = '2026-04-01';
    this.endDate = '2026-06-30';
    this.selectedBranch = 'All';
    this.selectedParty = 'All';
    this.searchQuery = '';
    this.loadInvoices();
  }

  getTotalSales(): number {
    return this.invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  }

  editInvoice(id: string): void {
    this.router.navigate(['/invoices/edit', id]);
  }

  deleteInvoice(id: string, event: Event): void {
    event.stopPropagation();
    if (confirm(`Are you sure you want to delete invoice ${id}?`)) {
      this.dataService.deleteInvoice(id);
      this.loadInvoices();
    }
  }

  addNewInvoice(): void {
    this.router.navigate(['/invoices/new']);
  }

  copiedInvoiceId: string | null = null;

  getWeblinkUrl(id: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/w/${id}`;
  }

  viewInvoiceLink(id: string, event: Event): void {
    event.stopPropagation();
    window.open(this.getWeblinkUrl(id), '_blank');
  }

  viewLedger(partyName: string, event: Event): void {
    event.stopPropagation();
    this.ledgerService.openLedger(partyName);
  }

  viewInvoicePreview(id: string, event: Event): void {
    event.stopPropagation();
    this.invoicePrintService.openInvoicePreview(id);
  }

  isSelected(id: string): boolean {
    return this.selectedInvoiceIds.has(id);
  }

  toggleSelect(id: string, event: Event): void {
    event.stopPropagation();
    if (this.selectedInvoiceIds.has(id)) {
      this.selectedInvoiceIds.delete(id);
    } else {
      this.selectedInvoiceIds.add(id);
    }
  }

  isAllSelected(): boolean {
    return this.invoices.length > 0 && this.invoices.every((inv) => this.selectedInvoiceIds.has(inv.id));
  }

  toggleSelectAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      this.invoices.forEach((inv) => this.selectedInvoiceIds.add(inv.id));
    } else {
      this.selectedInvoiceIds.clear();
    }
  }

  bulkPrint(): void {
    this.invoicePrintService.openBulkInvoicePreview(Array.from(this.selectedInvoiceIds));
  }

  shareInvoiceLink(id: string, event: Event): void {
    event.stopPropagation();
    const url = this.getWeblinkUrl(id);
    navigator.clipboard?.writeText(url).then(() => {
      this.copiedInvoiceId = id;
      setTimeout(() => {
        if (this.copiedInvoiceId === id) {
          this.copiedInvoiceId = null;
        }
      }, 2000);
    });
  }
}
