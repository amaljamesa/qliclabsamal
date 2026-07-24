import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QRCodeComponent } from 'angularx-qrcode';
import { NgxBarcode6 } from 'ngx-barcode6';
import { InvoiceWeblink } from '../../../models/invoice-weblink.model';
import { BrandWindowConfig } from '../../../models/brand-window.model';

@Component({
  selector: 'app-invoice-summary',
  standalone: true,
  imports: [CommonModule, QRCodeComponent, NgxBarcode6],
  templateUrl: './invoice-summary.component.html',
  styleUrls: ['./invoice-summary.component.css']
})
export class InvoiceSummaryComponent {
  @Input() invoice: InvoiceWeblink | undefined;
  @Input() brand: BrandWindowConfig | undefined;
  @Output() download = new EventEmitter<void>();

  onDownload(): void {
    this.download.emit();
  }

  taxableValueTotal(): number {
    return this.invoice?.taxSlabs?.reduce((sum, slab) => sum + slab.taxableValue, 0) || 0;
  }

  cgstTotal(): number {
    return this.invoice?.taxSlabs?.reduce((sum, slab) => sum + slab.cgst, 0) || 0;
  }

  sgstTotal(): number {
    return this.invoice?.taxSlabs?.reduce((sum, slab) => sum + slab.sgst, 0) || 0;
  }
}
