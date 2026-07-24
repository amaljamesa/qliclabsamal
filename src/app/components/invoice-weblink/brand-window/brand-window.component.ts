import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrandWindowConfig } from '../../../models/brand-window.model';
import { InvoiceWeblink } from '../../../models/invoice-weblink.model';

@Component({
  selector: 'app-brand-window',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './brand-window.component.html',
  styleUrls: ['./brand-window.component.css']
})
export class BrandWindowComponent {
  @Input() config: BrandWindowConfig | undefined;
  @Input() invoice: InvoiceWeblink | undefined;

  expanded = false;

  toggle(): void {
    this.expanded = !this.expanded;
  }
}
