import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FlashSalePromo } from '../../../models/promotion.model';

@Component({
  selector: 'app-flash-sale-popup',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './flash-sale-popup.component.html',
  styleUrls: ['./flash-sale-popup.component.css']
})
export class FlashSalePopupComponent {
  @Input() promo: FlashSalePromo | undefined;
  @Input() visible = false;
  @Output() dismissed = new EventEmitter<void>();
  @Output() ctaClicked = new EventEmitter<void>();

  close(): void {
    this.dismissed.emit();
  }

  onCtaClick(): void {
    this.ctaClicked.emit();
    this.close();
  }
}
