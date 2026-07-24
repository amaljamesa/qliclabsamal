import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { BrandWindowService } from '../../services/brand-window.service';
import { PromotionService } from '../../services/promotion.service';
import { BrandWindowConfig, SocialLink, SocialPlatform } from '../../models/brand-window.model';
import { PromotionConfig, PromoBanner, VideoAd } from '../../models/promotion.model';
import { InvoiceWeblink } from '../../models/invoice-weblink.model';
import { BrandWindowComponent } from '../invoice-weblink/brand-window/brand-window.component';
import { PromoBannerComponent } from '../invoice-weblink/promo-banner/promo-banner.component';
import { resizeImageFile } from '../../services/image-resize.util';

type BrandingTab = 'header' | 'footer';

const SOCIAL_PLATFORMS: SocialPlatform[] = ['instagram', 'facebook', 'twitter', 'linkedin', 'youtube'];
const MIN_CAROUSEL_HEIGHT = 100;
const MAX_CAROUSEL_HEIGHT = 320;
// Logos/footer marks are shown small, so a modest cap keeps them crisp without bloating storage.
const LOGO_MAX_DIMENSION = 480;
// Carousel photos fill the full-width header - allow more detail, still small enough that
// several of them together stay well under the localStorage quota once re-encoded as JPEG.
const CAROUSEL_MAX_DIMENSION = 1280;
// QR codes need to stay sharp to remain scannable - keep more resolution/quality than a
// regular photo upload would, even though it's only displayed at ~130px wide.
const QR_MAX_DIMENSION = 500;
const QR_QUALITY = 0.92;

@Component({
  selector: 'app-weblink-branding',
  standalone: true,
  imports: [CommonModule, FormsModule, BrandWindowComponent, PromoBannerComponent],
  templateUrl: './weblink-branding.component.html',
  styleUrls: ['./weblink-branding.component.css']
})
export class WeblinkBrandingComponent implements OnInit {
  activeTab: BrandingTab = 'header';
  socialPlatforms = SOCIAL_PLATFORMS;
  minCarouselHeight = MIN_CAROUSEL_HEIGHT;
  maxCarouselHeight = MAX_CAROUSEL_HEIGHT;

  brand!: BrandWindowConfig;
  promotion!: PromotionConfig;

  savedMessage = '';
  savedIsError = false;
  private savedMessageTimer: ReturnType<typeof setTimeout> | undefined;

  // Minimal stand-in so the real BrandWindowComponent can render a live preview
  // without a real routed invoice/token.
  previewInvoice: InvoiceWeblink = {
    token: 'preview',
    docType: 'Invoice',
    invoiceNo: 'PREVIEW-001',
    issueDate: '',
    supplierId: '',
    supplierName: '',
    customer: { name: '', registeredMobile: '' },
    items: [],
    totals: { subtotal: 0, taxAmount: 0, discount: 0, total: 0, currencySymbol: '₹' },
    statuses: [],
    paymentEnabled: false,
    isPaid: true,
    store: { legalName: '', placeOfSupply: 'Bengaluru, Karnataka', gstin: '' }
  };

  constructor(
    private brandService: BrandWindowService,
    private promotionService: PromotionService
  ) {}

  ngOnInit(): void {
    this.loadFromServices();
  }

  private loadFromServices(): void {
    this.brandService.getConfig().subscribe(config => {
      this.brand = { ...config, socialLinks: [...config.socialLinks] };
      this.syncPreviewInvoice();
    });
    this.promotionService.getConfig().subscribe(config => {
      this.promotion = { ...config, videoAds: [...config.videoAds] };
    });
  }

  syncPreviewInvoice(): void {
    this.previewInvoice = {
      ...this.previewInvoice,
      supplierName: this.brand.businessName || 'Your Business Name',
      store: {
        legalName: this.brand.legalName || this.brand.businessName || '',
        placeOfSupply: this.brand.address || 'Bengaluru, Karnataka',
        gstin: this.brand.gstin || ''
      }
    };
  }

  setTab(tab: BrandingTab): void {
    this.activeTab = tab;
  }

  // ── Header carousel (unlimited images, doubles as the header hero - see brand-window.component) ──

  get headerBanners(): PromoBanner[] {
    return this.promotion.banners.filter(b => b.position === 'top');
  }

  onHeaderImagesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    for (const file of files) {
      resizeImageFile(file, CAROUSEL_MAX_DIMENSION, 0.75).then(dataUrl => {
        const banner: PromoBanner = {
          id: `header-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          imageUrl: dataUrl,
          title: '',
          position: 'top'
        };
        this.promotion.banners = [...this.promotion.banners, banner];
      });
    }
    input.value = '';
  }

  removeHeaderImage(id: string): void {
    this.promotion.banners = this.promotion.banners.filter(b => b.id !== id);
  }

  // ── Image uploads (data URL - small enough to persist in localStorage) ──

  onLogoSelected(event: Event): void {
    this.readImageFile(event, dataUrl => {
      this.brand.logoUrl = dataUrl;
    });
  }

  onFooterImageSelected(event: Event): void {
    this.readImageFile(event, dataUrl => {
      this.brand.footerImageUrl = dataUrl;
    });
  }

  onPaymentQrSelected(event: Event): void {
    this.readImageFile(event, dataUrl => {
      this.brand.paymentQrImageUrl = dataUrl;
    }, QR_MAX_DIMENSION, QR_QUALITY);
  }

  removeLogo(): void {
    this.brand.logoUrl = undefined;
  }

  removeFooterImage(): void {
    this.brand.footerImageUrl = undefined;
  }

  removePaymentQr(): void {
    this.brand.paymentQrImageUrl = undefined;
  }

  private readImageFile(
    event: Event,
    onLoaded: (dataUrl: string) => void,
    maxDimension: number = LOGO_MAX_DIMENSION,
    quality = 0.85
  ): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    resizeImageFile(file, maxDimension, quality).then(dataUrl => {
      onLoaded(dataUrl);
      this.syncPreviewInvoice();
    });
    input.value = '';
  }

  // ── Video uploads (object URL - session only, see PromotionService.updateConfig) ──

  onVideoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const ad: VideoAd = {
      id: `video-${Date.now()}`,
      url: URL.createObjectURL(file),
      durationSeconds: 15
    };
    this.promotion.videoAds = [...this.promotion.videoAds, ad];
    input.value = '';
  }

  removeVideo(id: string): void {
    this.promotion.videoAds = this.promotion.videoAds.filter(ad => ad.id !== id);
  }

  // ── Social links ──

  addSocialLink(): void {
    const link: SocialLink = { platform: 'instagram', url: '' };
    this.brand.socialLinks = [...this.brand.socialLinks, link];
  }

  removeSocialLink(index: number): void {
    this.brand.socialLinks = this.brand.socialLinks.filter((_, i) => i !== index);
  }

  // ── Save / reset ──

  async save(): Promise<void> {
    const [brandSaved, promotionSaved] = await Promise.all([
      this.brandService.updateConfig(this.brand),
      this.promotionService.updateConfig(this.promotion)
    ]);
    if (brandSaved && promotionSaved) {
      this.flashSaved('Header & footer branding saved.', false);
    } else {
      this.flashSaved('Saved for this session, but it could not be stored permanently - try removing a few images.', true);
    }
  }

  reset(): void {
    this.loadFromServices();
    this.flashSaved('Reverted to last saved branding.', false);
  }

  private flashSaved(message: string, isError: boolean): void {
    this.savedMessage = message;
    this.savedIsError = isError;
    clearTimeout(this.savedMessageTimer);
    this.savedMessageTimer = setTimeout(() => (this.savedMessage = ''), isError ? 5000 : 2500);
  }
}
