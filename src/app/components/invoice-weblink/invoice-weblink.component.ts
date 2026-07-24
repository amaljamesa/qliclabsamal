import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

import { InvoiceWeblinkService } from '../../services/invoice-weblink.service';
import { InvoiceAccessService } from '../../services/invoice-access.service';
import { BrandWindowService } from '../../services/brand-window.service';
import { PromotionService } from '../../services/promotion.service';
import { FeedbackService } from '../../services/feedback.service';
import { WeblinkAnalyticsService } from '../../services/weblink-analytics.service';
import { PrintService } from '../../services/print.service';

import { InvoiceWeblink } from '../../models/invoice-weblink.model';
import { BrandWindowConfig } from '../../models/brand-window.model';
import { PromotionConfig } from '../../models/promotion.model';
import { FeedbackRating } from '../../models/feedback.model';
import { PaymentLink } from '../../models/payment.model';

import { AccessGateComponent } from './access-gate/access-gate.component';
import { BrandWindowComponent } from './brand-window/brand-window.component';
import { PromoBannerComponent } from './promo-banner/promo-banner.component';
import { FlashSalePopupComponent } from './flash-sale-popup/flash-sale-popup.component';
import { VideoAdComponent } from './video-ad/video-ad.component';
import { InvoiceSummaryComponent } from './invoice-summary/invoice-summary.component';
import { PaymentPanelComponent } from './payment-panel/payment-panel.component';
import { FeedbackWidgetComponent } from '../../shared/feedback-widget/feedback-widget.component';

type PageState = 'loading' | 'error' | 'gate' | 'invoice';

@Component({
  selector: 'app-invoice-weblink',
  standalone: true,
  imports: [
    CommonModule,
    AccessGateComponent,
    BrandWindowComponent,
    PromoBannerComponent,
    FlashSalePopupComponent,
    VideoAdComponent,
    InvoiceSummaryComponent,
    PaymentPanelComponent,
    FeedbackWidgetComponent
  ],
  templateUrl: './invoice-weblink.component.html',
  styleUrls: ['./invoice-weblink.component.css']
})
export class InvoiceWeblinkComponent implements OnInit {
  state: PageState = 'loading';
  errorMessage = '';

  invoice: InvoiceWeblink | undefined;
  brandConfig: BrandWindowConfig | undefined;
  promotion: PromotionConfig | undefined;

  showFlashSale = false;
  showVideoAd = false;

  feedbackSelected: FeedbackRating | null = null;
  feedbackSubmitted = false;

  private token = '';

  constructor(
    private route: ActivatedRoute,
    private invoiceService: InvoiceWeblinkService,
    private accessService: InvoiceAccessService,
    private brandService: BrandWindowService,
    private promotionService: PromotionService,
    private feedbackService: FeedbackService,
    private analytics: WeblinkAnalyticsService,
    private printService: PrintService
  ) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') || '';
    if (!this.token) {
      this.state = 'error';
      this.errorMessage = 'This invoice link is invalid.';
      return;
    }

    this.invoiceService.getByToken(this.token).subscribe({
      next: invoice => {
        this.invoice = invoice;
        this.accessService.validateInvoice(this.token).subscribe(isValid => {
          this.state = isValid && !invoice.revoked ? 'gate' : 'error';
          if (this.state === 'error') {
            this.errorMessage = 'This link has been revoked or has expired.';
          }
        });
      },
      error: () => {
        this.state = 'error';
        this.errorMessage = 'This invoice link may have been revoked or does not exist.';
      }
    });
  }

  onVerified(): void {
    if (!this.invoice) {
      return;
    }
    this.state = 'invoice';
    this.analytics.track('invoice_viewed', this.token);

    this.brandService.getConfig(this.invoice.supplierId).subscribe(config => {
      this.brandConfig = config;
      this.mergeBusinessProfile(config);
    });
    this.promotionService.getConfig(this.invoice.supplierId).subscribe(promo => {
      this.promotion = promo;
      this.maybeShowFlashSale();
      this.maybeShowVideoAd();
    });

    const existingFeedback = this.feedbackService.getFeedbackFor(this.token);
    if (existingFeedback) {
      this.feedbackSelected = existingFeedback.rating;
      this.feedbackSubmitted = true;
    }
  }

  // Merges this app's single business profile (name/legal/GSTIN/contact) into the
  // mapped invoice - the invoice itself only carries transaction data.
  private mergeBusinessProfile(config: BrandWindowConfig | undefined): void {
    if (!this.invoice || !config) {
      return;
    }
    this.invoice.supplierName = config.businessName;
    this.invoice.supportContact = config.contactPhone || '';
    if (config.gstin || config.address || config.legalName) {
      this.invoice.store = {
        legalName: config.legalName || config.businessName,
        contactNumber: config.contactPhone,
        placeOfSupply: config.address || '',
        gstin: config.gstin || ''
      };
    }
  }

  onDownload(): void {
    if (!this.invoice) {
      return;
    }
    this.printService.printMarkup(this.buildInvoiceMarkup(this.invoice), `Invoice ${this.invoice.invoiceNo}`);
    this.invoiceService.markDownloaded(this.token).subscribe();
    this.analytics.track('invoice_downloaded', this.token);
    if (!this.invoice.statuses.includes('Downloaded')) {
      this.invoice.statuses = [...this.invoice.statuses, 'Downloaded'];
    }
  }

  onPaymentCompleted(link: PaymentLink): void {
    if (!this.invoice) {
      return;
    }
    this.invoiceService.markPaid(this.token).subscribe();
    this.invoice.isPaid = true;
    if (!this.invoice.statuses.includes('Paid')) {
      this.invoice.statuses = [...this.invoice.statuses, 'Paid'];
    }
    this.analytics.track('payment_completed', this.token, { paymentId: link.paymentId });
  }

  onFeedbackRate(rating: FeedbackRating): void {
    this.feedbackSelected = rating;
    this.feedbackService.submitFeedback(this.token, rating).subscribe(() => {
      this.feedbackSubmitted = true;
      this.analytics.track('feedback_submitted', this.token, { rating });
    });
  }

  dismissFlashSale(): void {
    this.showFlashSale = false;
    if (this.promotion?.flashSale) {
      sessionStorage.setItem(this.flashSaleStorageKey(this.promotion.flashSale.id), '1');
    }
  }

  dismissVideoAd(): void {
    this.showVideoAd = false;
  }

  get topBanners() {
    return this.promotion?.banners.filter(b => b.position === 'top') || [];
  }

  get bottomBanners() {
    return this.promotion?.banners.filter(b => b.position === 'bottom') || [];
  }

  private maybeShowFlashSale(): void {
    const promo = this.promotion?.flashSale;
    if (!promo) {
      return;
    }
    const alreadyShown = sessionStorage.getItem(this.flashSaleStorageKey(promo.id));
    this.showFlashSale = !alreadyShown;
  }

  private maybeShowVideoAd(): void {
    if (this.promotion?.videoAdsEnabled && this.promotion.videoAds.length) {
      setTimeout(() => (this.showVideoAd = true), 2000);
    }
  }

  private flashSaleStorageKey(promoId: string): string {
    return `invoice-weblink.flash-sale-shown.${promoId}`;
  }

  private buildInvoiceMarkup(invoice: InvoiceWeblink): string {
    const itemsHtml = invoice.items.map(item => `
      <tr>
        <td>${this.escape(item.description)}</td>
        <td style="text-align:right">${item.qty}</td>
        <td style="text-align:right">${invoice.totals.currencySymbol} ${item.rate.toFixed(2)}</td>
        <td style="text-align:right">${invoice.totals.currencySymbol} ${item.amount.toFixed(2)}</td>
      </tr>`).join('');

    const storeHtml = invoice.store ? `
        <p style="margin:0 0 4px; font-weight:700;">${this.escape(invoice.store.legalName)}</p>
        <p style="margin:0 0 16px; color:#64748b; font-size:0.85rem;">
          GSTIN: ${this.escape(invoice.store.gstin)}${invoice.store.placeOfSupply ? ' &middot; ' + this.escape(invoice.store.placeOfSupply) : ''}
        </p>` : '';

    const taxHtml = invoice.taxSlabs?.length ? `
        <table style="width:100%; border-collapse:collapse; margin-top:16px; font-size:0.85rem;">
          <thead>
            <tr style="border-bottom:1px solid #cbd5e1;">
              <th style="text-align:left; padding:6px 0;">GST</th>
              <th style="text-align:right; padding:6px 0;">Taxable</th>
              <th style="text-align:right; padding:6px 0;">CGST</th>
              <th style="text-align:right; padding:6px 0;">SGST</th>
              <th style="text-align:right; padding:6px 0;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.taxSlabs.map(slab => `
              <tr>
                <td>${slab.label} ${this.escape(slab.gstLabel)}</td>
                <td style="text-align:right">${invoice.totals.currencySymbol} ${slab.taxableValue.toFixed(2)}</td>
                <td style="text-align:right">${invoice.totals.currencySymbol} ${slab.cgst.toFixed(2)}</td>
                <td style="text-align:right">${invoice.totals.currencySymbol} ${slab.sgst.toFixed(2)}</td>
                <td style="text-align:right">${invoice.totals.currencySymbol} ${slab.totalAmount.toFixed(2)}</td>
              </tr>`).join('')}
          </tbody>
        </table>` : '';

    const tenderHtml = invoice.tender?.length ? `
        <div style="margin-top:16px; font-size:0.85rem; color:#64748b;">
          ${invoice.tender.map(t => `${this.escape(t.method)}${t.reference ? ' (' + this.escape(t.reference) + ')' : ''}: ${invoice.totals.currencySymbol} ${t.amount.toFixed(2)}`).join('<br/>')}
        </div>` : '';

    return `
      <div style="font-family: Arial, sans-serif; padding: 24px; color:#1e293b;">
        <h2 style="margin-bottom:4px;">${this.escape(invoice.supplierName)}</h2>
        <p style="margin:0 0 16px; color:#64748b;">${invoice.docType} ${this.escape(invoice.invoiceNo)} &middot; ${invoice.issueDate}</p>
        ${storeHtml}
        <p style="margin:0 0 16px;">Billed to: ${this.escape(invoice.customer.name)}</p>
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:1px solid #cbd5e1;">
              <th style="text-align:left; padding:6px 0;">Description</th>
              <th style="text-align:right; padding:6px 0;">Qty</th>
              <th style="text-align:right; padding:6px 0;">Rate</th>
              <th style="text-align:right; padding:6px 0;">Amount</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        ${taxHtml}
        <div style="text-align:right; margin-top:16px; font-size:1.1rem; font-weight:700;">
          Total: ${invoice.totals.currencySymbol} ${(invoice.grossTotal ?? invoice.totals.total).toFixed(2)}
        </div>
        ${tenderHtml}
      </div>`;
  }

  private escape(value: string): string {
    return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] || character));
  }
}
