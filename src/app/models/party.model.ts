export interface Party {
  id: string;
  createdAt: string;

  name: string;
  tallyExportName: string;
  shortName: string;
  alias: string;
  address: string;
  state: string;
  pincode: string;
  partyType: string;
  email: string;
  cellphone: string;
  landLine: string;
  appearUnder: string;
  inwardTax: string;
  branch: string;
  enablePortal: boolean;

  pan: string;
  gstSupplyType: string;
  gstin: string;

  createLedger: boolean;
  openingBalance: number;
  balanceType: string;
  dueInDaysType: string;

  regionName: string;
  areaName: string;
  route: string;

  fromDate: string;
  toDate: string;
  active: boolean;

  transactions: string;
  servicedBy: string;
  smartTags: string;
}

export type PartyDraft = Omit<Party, 'id' | 'createdAt'>;
