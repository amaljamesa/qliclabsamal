import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InvoiceAccessService } from '../../../services/invoice-access.service';

// Frontend-first placeholder screen. verifyOtp()/requestOtp() always succeed for now -
// real OTP dispatch, expiry and registered-number matching land in the security phase.
@Component({
  selector: 'app-access-gate',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './access-gate.component.html',
  styleUrls: ['./access-gate.component.css']
})
export class AccessGateComponent {
  @Output() verified = new EventEmitter<void>();

  step: 'mobile' | 'otp' = 'mobile';
  mobile = '';
  otp = '';
  isSubmitting = false;
  errorMessage = '';

  constructor(private accessService: InvoiceAccessService) {}

  requestOtp(): void {
    if (!this.mobile.trim()) {
      this.errorMessage = 'Enter your registered mobile number to continue.';
      return;
    }
    this.errorMessage = '';
    this.isSubmitting = true;
    this.accessService.requestOtp(this.mobile).subscribe(() => {
      this.isSubmitting = false;
      this.step = 'otp';
    });
  }

  verifyOtp(): void {
    if (!this.otp.trim()) {
      this.errorMessage = 'Enter the OTP sent to your mobile number.';
      return;
    }
    this.errorMessage = '';
    this.isSubmitting = true;
    this.accessService.verifyOtp(this.mobile, this.otp).subscribe(result => {
      this.isSubmitting = false;
      if (result.verified) {
        this.verified.emit();
      } else {
        this.errorMessage = 'That OTP did not match. Please try again.';
      }
    });
  }

  changeNumber(): void {
    this.step = 'mobile';
    this.otp = '';
    this.errorMessage = '';
  }
}
