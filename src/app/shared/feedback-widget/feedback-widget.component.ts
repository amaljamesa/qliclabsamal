import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FeedbackRating } from '../../models/feedback.model';

@Component({
  selector: 'app-feedback-widget',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './feedback-widget.component.html',
  styleUrls: ['./feedback-widget.component.css']
})
export class FeedbackWidgetComponent {
  @Input() label = 'Rate your experience';
  @Input() submittedLabel = 'Feedback submitted';
  @Input() selected: FeedbackRating | null = null;
  @Input() submitted = false;
  @Output() rate = new EventEmitter<FeedbackRating>();

  readonly options: { rating: FeedbackRating; title: string }[] = [
    { rating: 'happy', title: 'Happy' },
    { rating: 'neutral', title: 'Neutral' },
    { rating: 'unhappy', title: 'Unhappy' }
  ];

  onSelect(rating: FeedbackRating): void {
    if (this.submitted) {
      return;
    }
    this.rate.emit(rating);
  }
}
