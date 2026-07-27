import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FlashSalePromo } from '../../../models/promotion.model';

export const DEFAULT_FLASH_SALE_DURATION_SECONDS = 30;

@Component({
  selector: 'app-flash-sale-popup',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './flash-sale-popup.component.html',
  styleUrls: ['./flash-sale-popup.component.css']
})
export class FlashSalePopupComponent implements OnChanges, OnDestroy {
  @Input() promo: FlashSalePromo | undefined;
  @Input() visible = false;
  @Output() dismissed = new EventEmitter<void>();
  @Output() ctaClicked = new EventEmitter<void>();

  secondsLeft = 0;
  private countdownTimer: ReturnType<typeof setInterval> | undefined;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] || changes['promo']) {
      if (this.visible && this.promo) {
        this.startCountdown();
      } else {
        this.clearTimer();
      }
    }
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  close(): void {
    this.clearTimer();
    this.dismissed.emit();
  }

  onCtaClick(): void {
    this.ctaClicked.emit();
    this.close();
  }

  private startCountdown(): void {
    this.clearTimer();
    this.secondsLeft = this.promo?.durationSeconds ?? DEFAULT_FLASH_SALE_DURATION_SECONDS;
    if (this.secondsLeft <= 0) {
      return;
    }
    this.countdownTimer = setInterval(() => {
      this.secondsLeft -= 1;
      if (this.secondsLeft <= 0) {
        this.close();
      }
    }, 1000);
  }

  private clearTimer(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = undefined;
    }
  }
}
