export type PaymentStatus = 'pending' | 'processing' | 'paid' | 'failed';

export interface PaymentLink {
  invoiceToken: string;
  amount: number;
  currencySymbol: string;
  status: PaymentStatus;
  qrValue: string;
  paymentId?: string;
}
