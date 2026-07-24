import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QRCodeComponent } from 'angularx-qrcode';
import { PaymentService } from '../../../services/payment.service';
import { PaymentLink } from '../../../models/payment.model';

@Component({
  selector: 'app-payment-panel',
  standalone: true,
  imports: [CommonModule, QRCodeComponent],
  templateUrl: './payment-panel.component.html',
  styleUrls: ['./payment-panel.component.css']
})
export class PaymentPanelComponent implements OnChanges {
  @Input() invoiceToken = '';
  @Input() amount = 0;
  @Input() currencySymbol = '₹';
  @Input() paymentEnabled = false;
  @Input() isPaid = false;
  @Input() supplierName = '';
  @Input() paymentFor = '';
  @Input() supportContact = '';
  @Input() businessPoliciesUrl = '';
  @Input() paymentId = '';
  @Output() paymentCompleted = new EventEmitter<PaymentLink>();

  link: PaymentLink | undefined;
  isProcessing = false;
  showQr = false;
  linkCopied = false;

  constructor(private paymentService: PaymentService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['invoiceToken'] || changes['isPaid']) && this.paymentEnabled && this.invoiceToken && !this.isPaid) {
      this.paymentService.createPaymentLink(this.invoiceToken, this.amount, this.currencySymbol)
        .subscribe(link => this.link = link);
    }
  }

  get avatarInitial(): string {
    return (this.supplierName || '?').trim().charAt(0).toUpperCase();
  }

  get displayPaymentId(): string {
    return this.link?.paymentId || this.paymentId;
  }

  payNow(): void {
    this.showQr = true;
  }

  confirmMockPayment(): void {
    if (!this.link) {
      return;
    }
    this.isProcessing = true;
    this.paymentService.confirmPayment(this.invoiceToken).subscribe(updated => {
      this.isProcessing = false;
      this.link = updated;
      this.showQr = false;
      this.paymentCompleted.emit(updated);
    });
  }

  sharePaymentLink(): void {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (!url) {
      return;
    }
    navigator.clipboard?.writeText(url).then(() => {
      this.linkCopied = true;
      setTimeout(() => (this.linkCopied = false), 2000);
    });
  }
}
