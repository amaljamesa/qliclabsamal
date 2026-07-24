import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';

// Frontend-first placeholder. Real verification (OTP dispatch/expiry, number-match,
// revoked/expired link checks) will replace these bodies in a later security phase.
@Injectable({
  providedIn: 'root'
})
export class InvoiceAccessService {
  // TODO: replace with a call that checks the link is live and not revoked/expired
  validateInvoice(token: string): Observable<boolean> {
    return of(true).pipe(delay(200));
  }

  // TODO: replace with real OTP dispatch to the registered mobile
  requestOtp(mobile: string): Observable<{ sent: boolean }> {
    return of({ sent: true }).pipe(delay(300));
  }

  // TODO: replace with real OTP verification / registered-number match
  verifyOtp(mobile: string, otp: string): Observable<{ verified: boolean }> {
    return of({ verified: true }).pipe(delay(300));
  }
}
