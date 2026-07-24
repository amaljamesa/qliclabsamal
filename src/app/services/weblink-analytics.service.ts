import { Injectable } from '@angular/core';
import { WeblinkAnalyticsEvent, WeblinkAnalyticsEventType } from '../models/analytics-event.model';

// Mock event sink. Real backend: POST events to the invoice-links audit trail / webhooks.
@Injectable({
  providedIn: 'root'
})
export class WeblinkAnalyticsService {
  private readonly storageKey = 'invoice-weblink.events';

  track(type: WeblinkAnalyticsEventType, invoiceToken: string, meta?: Record<string, unknown>): void {
    const event: WeblinkAnalyticsEvent = {
      type,
      invoiceToken,
      occurredAt: new Date().toISOString(),
      meta
    };

    const events = this.getEvents();
    events.push(event);
    localStorage.setItem(this.storageKey, JSON.stringify(events));
  }

  getEvents(): WeblinkAnalyticsEvent[] {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
