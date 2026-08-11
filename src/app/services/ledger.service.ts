import { Injectable } from '@angular/core';
import { DataService } from './data.service';
import { LedgerData, LedgerDetailItem } from '../models/ledger.model';
import { PreviewDialogService } from './preview-dialog.service';

// UTF-8 safe base64 encode - mirrors the base64ToUtf8 decode the ledger report expects.
function utf8ToBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

function formatLedgerDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  return `${day}-${month}-${date.getFullYear()}`;
}

@Injectable({
  providedIn: 'root'
})
export class LedgerService {
  constructor(
    private dataService: DataService,
    private previewDialog: PreviewDialogService
  ) {}

  buildLedgerData(partyName: string): LedgerData {
    const invoices = this.dataService
      .getInvoices({ partyName })
      .slice()
      .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));

    let runningBalance = 0;
    const ledger_details: LedgerDetailItem[] = invoices.map((invoice) => {
      runningBalance += invoice.totalAmount;
      return {
        journal_date: formatLedgerDate(invoice.date),
        journal_unique_id: invoice.invoiceNo,
        by_to: 'By',
        by_to_account_name: invoice.paymentType === 'Cash' ? 'Cash in hand' : invoice.paymentType,
        dr_amount: '0.00',
        cr_amount: invoice.totalAmount.toFixed(2),
        narration: `Invoice No.${invoice.invoiceNo} |`,
        balance: `${runningBalance.toFixed(2)} Cr`,
        view_order: 0,
        voucher_type: 'Sales'
      };
    });

    return {
      config: {
        show_journal_id: false,
        main_table_border: true,
        footer_date_time: true
      },
      other: {
        from_date: invoices.length ? formatLedgerDate(invoices[0].date) : '',
        to_date: invoices.length ? formatLedgerDate(invoices[invoices.length - 1].date) : ''
      },
      company_details: {
        be_id: '1',
        be_name: 'Eprise Activity - Bejai',
        be_state: 'Karnataka',
        be_addline1: 'PVS Building',
        be_addline2: 'Kodialbail',
        be_gstin: '',
        be_pin: '575003',
        be_phone: ''
      },
      accounts: {
        account_name: partyName
      },
      ledger_details
    };
  }

  // Opens the ledger preview as a dialog over the current screen rather than in a new browser
  // tab. The payload handoff through localStorage is unchanged, so the /print/ledger-preview
  // route (and the /print/ledger report inside it) still work exactly as before.
  openLedger(partyName: string): void {
    const data = this.buildLedgerData(partyName);
    const base64 = utf8ToBase64(JSON.stringify(data));
    localStorage.setItem('ledgerData', base64);
    this.previewDialog.open({ kind: 'ledger', title: `Ledger - ${partyName}` });
  }
}
