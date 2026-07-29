export interface LedgerConfig {
  show_journal_id: boolean;
  main_table_border: boolean;
  footer_date_time: boolean;
}

export interface LedgerOther {
  from_date: string;
  to_date: string;
}

export interface LedgerCompanyDetails {
  be_id: string;
  be_name: string;
  be_state: string;
  be_addline1: string;
  be_addline2: string;
  be_addline3?: string;
  be_email?: string;
  be_gstin: string;
  be_pin: string;
  be_pan?: string;
  be_phone: string;
}

export interface LedgerAccount {
  account_name: string;
}

export interface LedgerDetailItem {
  journal_date: string;
  journal_unique_id?: string;
  by_to: string;
  by_to_account_name: string;
  dr_amount: string;
  cr_amount: string;
  narration?: string;
  balance: string;
  running_balance_type?: string;
  det_ac_effect?: string;
  det_ac_name?: string;
  det_amount?: string;
  det_dr_cr?: string;
  view_order?: number | string;
  voucher_type: string;
}

export interface LedgerData {
  config: LedgerConfig;
  other: LedgerOther;
  company_details: LedgerCompanyDetails;
  accounts: LedgerAccount;
  ledger_details: LedgerDetailItem[];
}
