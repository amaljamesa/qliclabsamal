export type FeedbackRating = 'happy' | 'neutral' | 'unhappy';

export interface FeedbackEntry {
  invoiceToken: string;
  rating: FeedbackRating;
  submittedAt: string;
}
