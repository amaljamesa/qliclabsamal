export type WeblinkAnalyticsEventType =
  | 'invoice_viewed'
  | 'invoice_downloaded'
  | 'payment_completed'
  | 'feedback_submitted';

export interface WeblinkAnalyticsEvent {
  type: WeblinkAnalyticsEventType;
  invoiceToken: string;
  occurredAt: string;
  meta?: Record<string, unknown>;
}
