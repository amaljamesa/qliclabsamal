import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { FeedbackEntry, FeedbackRating } from '../models/feedback.model';

@Injectable({
  providedIn: 'root'
})
export class FeedbackService {
  private readonly entries: FeedbackEntry[] = [];

  // TODO: replace with a POST to the invoice-links feedback endpoint
  submitFeedback(invoiceToken: string, rating: FeedbackRating): Observable<FeedbackEntry> {
    const entry: FeedbackEntry = {
      invoiceToken,
      rating,
      submittedAt: new Date().toISOString()
    };
    this.entries.push(entry);
    return of(entry).pipe(delay(150));
  }

  getFeedbackFor(invoiceToken: string): FeedbackEntry | undefined {
    return this.entries.find(e => e.invoiceToken === invoiceToken);
  }
}
