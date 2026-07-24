import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VideoAd } from '../../../models/promotion.model';

@Component({
  selector: 'app-video-ad',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './video-ad.component.html',
  styleUrls: ['./video-ad.component.css']
})
export class VideoAdComponent implements OnChanges, OnDestroy {
  @Input() ads: VideoAd[] = [];
  @Input() enabled = false;
  @Input() visible = false;
  @Output() dismissed = new EventEmitter<void>();

  currentAd: VideoAd | undefined;
  private autoCloseTimer: ReturnType<typeof setTimeout> | undefined;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.pickAd();
      this.scheduleAutoClose();
    }
    if (changes['visible'] && !this.visible) {
      this.clearTimer();
    }
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  close(): void {
    this.clearTimer();
    this.dismissed.emit();
  }

  private pickAd(): void {
    if (!this.ads.length) {
      this.currentAd = undefined;
      return;
    }
    this.currentAd = this.ads[Math.floor(Math.random() * this.ads.length)];
  }

  private scheduleAutoClose(): void {
    this.clearTimer();
    if (!this.currentAd) {
      return;
    }
    this.autoCloseTimer = setTimeout(() => this.close(), this.currentAd.durationSeconds * 1000);
  }

  private clearTimer(): void {
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = undefined;
    }
  }
}
