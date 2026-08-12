import { Injectable } from '@angular/core';
import { DataService } from './data.service';
import { LedgerData, LedgerDetailItem } from '../models/ledger.model';
import { PreviewDialogService } from './preview-dialog.service';
import { setPreviewPayload } from './preview-payload';

// The key the ledger report looks its payload up by - see LedgerReportComponent.
export const LEDGER_STORAGE_KEY = 'ledgerData';

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
  // tab. The payload is handed over in memory (see preview-payload.ts) rather than base64'd
  // into localStorage, so the /print/ledger-preview route (and the /print/ledger report inside
  // it) still work exactly as before, without the ~5MB origin-wide storage ceiling.
  //
  // Set BEFORE the dialog opens, because opening it is what creates the frame that reads it.
  openLedger(partyName: string): void {
    setPreviewPayload(LEDGER_STORAGE_KEY, this.buildLedgerData(partyName));
    this.previewDialog.open({ kind: 'ledger', title: `Ledger - ${partyName}` });
  }
}
