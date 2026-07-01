import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';

interface Transaction {
  date: string;
  account: string;
  gstin: string;
  amount: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  stats = {
    purchaseAmount: 0.00,
    salesAmount: 0.00,
    receiptAmount: 0.00,
    creditNoteAmount: 0.00,
    salesReturnAmount: 0.00
  };

  selectedMonth = 'June 2026';

  agentTransactions: Transaction[] = [
    { date: "19 Jun'26", account: 'test', gstin: '29AABXG0724Q8Z9', amount: 1947.00 },
    { date: "19 Jun'26", account: 'test', gstin: '29AABXG0724Q8Z9', amount: 1003.00 },
    { date: "29 Jun'26", account: 'test1', gstin: '29AAAP00993H1Z4', amount: 750.00 },
    { date: "29 Jun'26", account: 'test1', gstin: '29AAAP00993H1Z4', amount: 30.00 },
    { date: "29 Jun'26", account: 'test1', gstin: '29AAAP00993H1Z4', amount: 25.00 }
  ];

  supplierTransactions: Transaction[] = [
    { date: "02 Jun'26", account: 'test', gstin: '', amount: 50.00 },
    { date: "02 Jun'26", account: 'test1', gstin: '', amount: 50.00 },
    { date: "19 Jun'26", account: 'test', gstin: '19AA4D4LB09C9ZD', amount: 10.00 }
  ];

  constructor(private dataService: DataService) {}

  ngOnInit(): void {
    this.loadStats();
  }

  loadStats(): void {
    // Read calculations dynamically from the invoices list in the service
    const rawStats = this.dataService.getDashboardStats();
    
    // We combine the dynamic sales stats with some base values from the screenshot
    this.stats = {
      purchaseAmount: 0.00,
      salesAmount: rawStats.salesAmount || 18824.00, // Fallback if no invoices
      receiptAmount: rawStats.receiptAmount || 0.00,
      creditNoteAmount: 0.00,
      salesReturnAmount: 0.00
    };
  }
}
