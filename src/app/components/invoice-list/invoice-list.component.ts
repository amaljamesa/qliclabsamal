import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DataService, Invoice } from '../../services/data.service';

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

  constructor(private dataService: DataService, private router: Router) {}

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
}
