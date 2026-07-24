import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PromoBanner } from '../../../models/promotion.model';

@Component({
  selector: 'app-promo-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './promo-banner.component.html',
  styleUrls: ['./promo-banner.component.css']
})
export class PromoBannerComponent implements OnChanges, OnDestroy {
  @Input() banners: PromoBanner[] = [];
  @Input() heightPx?: number;

  activeIndex = 0;
  private autoAdvanceHandle: ReturnType<typeof setInterval> | undefined;
  // Callers often bind `banners` to a getter (e.g. `list.filter(...)`), which hands back a
  // new array reference on every change-detection cycle even when nothing changed. Reacting
  // to that identity change alone would reset activeIndex right after every next()/prev()
  // click, so only react when the actual set of banners (by id) has changed.
  private lastBannerKey = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['banners']) {
      return;
    }
    const key = this.banners.map(b => b.id).join('|');
    if (key === this.lastBannerKey) {
      return;
    }
    this.lastBannerKey = key;
    this.activeIndex = 0;
    this.restartAutoAdvance();
  }

  ngOnDestroy(): void {
    this.stopAutoAdvance();
  }

  next(): void {
    if (!this.banners.length) {
      return;
    }
    this.activeIndex = (this.activeIndex + 1) % this.banners.length;
    this.restartAutoAdvance();
  }

  prev(): void {
    if (!this.banners.length) {
      return;
    }
    this.activeIndex = (this.activeIndex - 1 + this.banners.length) % this.banners.length;
    this.restartAutoAdvance();
  }

  goTo(index: number): void {
    this.activeIndex = index;
    this.restartAutoAdvance();
  }

  private restartAutoAdvance(): void {
    this.stopAutoAdvance();
    if (this.banners.length > 1) {
      this.autoAdvanceHandle = setInterval(() => {
        this.activeIndex = (this.activeIndex + 1) % this.banners.length;
      }, 4500);
    }
  }

  private stopAutoAdvance(): void {
    if (this.autoAdvanceHandle) {
      clearInterval(this.autoAdvanceHandle);
      this.autoAdvanceHandle = undefined;
    }
  }
}
