import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { PaymentLink } from '../models/payment.model';

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private readonly linksByToken: Record<string, PaymentLink> = {};

  // TODO: replace with POST /v1/invoice-links/{id}/payment
  createPaymentLink(invoiceToken: string, amount: number, currencySymbol: string): Observable<PaymentLink> {
    const link: PaymentLink = this.linksByToken[invoiceToken] ?? {
      invoiceToken,
      amount,
      currencySymbol,
      status: 'pending',
      qrValue: `qliclabs://pay/${invoiceToken}?amount=${amount}`
    };
    this.linksByToken[invoiceToken] = link;
    return of({ ...link }).pipe(delay(300));
  }

  // TODO: replace with a real payment-status poll/webhook
  confirmPayment(invoiceToken: string): Observable<PaymentLink> {
    const link = this.linksByToken[invoiceToken];
    if (link) {
      link.status = 'paid';
      link.paymentId = `MOCK_${Date.now()}`;
    }
    return of({ ...link }).pipe(delay(500));
  }

  getStatus(invoiceToken: string): Observable<PaymentLink | undefined> {
    return of(this.linksByToken[invoiceToken]).pipe(delay(150));
  }
}
