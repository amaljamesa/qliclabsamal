import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';

import { BrandWindowService } from '../../services/brand-window.service';
import { PromotionService } from '../../services/promotion.service';
import { WeblinkLayoutService } from '../../services/weblink-layout.service';
import { BrandWindowConfig, SocialLink, SocialPlatform } from '../../models/brand-window.model';
import { PromotionConfig, PromoBanner, VideoAd, FlashSalePromo } from '../../models/promotion.model';
import { WeblinkLayoutConfig, LayoutBlock, LayoutBlockType, LayoutZone } from '../../models/weblink-layout.model';
import { InvoiceWeblink } from '../../models/invoice-weblink.model';
import { BrandWindowComponent } from '../invoice-weblink/brand-window/brand-window.component';
import { PromoBannerComponent } from '../invoice-weblink/promo-banner/promo-banner.component';
import { FlashSalePopupComponent, DEFAULT_FLASH_SALE_DURATION_SECONDS } from '../invoice-weblink/flash-sale-popup/flash-sale-popup.component';
import { LayoutBlockComponent } from '../invoice-weblink/layout-block/layout-block.component';
import { resizeImageFile } from '../../services/image-resize.util';

type BrandingTab = 'header' | 'footer' | 'layout';

interface BlockPaletteEntry {
  type: LayoutBlockType;
  label: string;
}

const BLOCK_PALETTE: BlockPaletteEntry[] = [
  { type: 'logo', label: 'Logo' },
  { type: 'image', label: 'Image' },
  { type: 'video', label: 'Video' },
  { type: 'carousel', label: 'Carousel' },
  { type: 'qr', label: 'QR Code' },
  { type: 'text', label: 'Text' },
  { type: 'social', label: 'Social Links' },
  { type: 'spacer', label: 'Spacer' }
];

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
// Flash-sale creative is shown at a small card size, so this stays modest like the logo/footer caps.
const FLASH_SALE_MAX_DIMENSION = 800;
// Block creative (images/QR) is shown at moderate sizes in the flow, so this stays modest too.
const BLOCK_IMAGE_MAX_DIMENSION = 1000;

@Component({
  selector: 'app-weblink-branding',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    BrandWindowComponent,
    PromoBannerComponent,
    FlashSalePopupComponent,
    LayoutBlockComponent
  ],
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
  layout!: WeblinkLayoutConfig;

  blockPalette = BLOCK_PALETTE;
  aboveBlocks: LayoutBlock[] = [];
  belowBlocks: LayoutBlock[] = [];
  selectedBlockId: string | null = null;

  private resizing: {
    block: LayoutBlock;
    mode: 'width' | 'height';
    startX: number;
    startY: number;
    startWidthPx: number;
    startHeightPx: number;
    containerWidthPx: number;
  } | null = null;

  savedMessage = '';
  savedIsError = false;
  private savedMessageTimer: ReturnType<typeof setTimeout> | undefined;

  previewFlashSale = false;

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
    private promotionService: PromotionService,
    private weblinkLayoutService: WeblinkLayoutService
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
      if (!this.promotion.flashSale) {
        this.promotion.flashSale = this.blankFlashSale();
      }
    });
    this.weblinkLayoutService.getConfig().subscribe(config => {
      this.layout = { ...config, blocks: config.blocks.map(block => ({ ...block })) };
      this.syncBlockZones();
    });
  }

  private blankFlashSale(): FlashSalePromo {
    return {
      id: `flash-${Date.now()}`,
      enabled: false,
      title: '',
      discountLabel: '',
      windowLabel: '',
      ctaLabel: 'Shop Now',
      durationSeconds: DEFAULT_FLASH_SALE_DURATION_SECONDS
    };
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

  // ── Flash sale popup ──

  onFlashSaleImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.promotion.flashSale) {
      return;
    }
    const flashSale = this.promotion.flashSale;
    resizeImageFile(file, FLASH_SALE_MAX_DIMENSION, 0.8).then(dataUrl => {
      flashSale.imageUrl = dataUrl;
    });
    input.value = '';
  }

  removeFlashSaleImage(): void {
    if (this.promotion.flashSale) {
      this.promotion.flashSale.imageUrl = undefined;
    }
  }

  togglePreviewFlashSale(): void {
    this.previewFlashSale = true;
  }

  closePreviewFlashSale(): void {
    this.previewFlashSale = false;
  }

  // ── Advanced layout blocks ──

  private syncBlockZones(): void {
    this.aboveBlocks = this.layout.blocks.filter(b => b.zone === 'above');
    this.belowBlocks = this.layout.blocks.filter(b => b.zone === 'below');
  }

  private zoneArray(zone: LayoutZone): LayoutBlock[] {
    return zone === 'above' ? this.aboveBlocks : this.belowBlocks;
  }

  addBlock(type: LayoutBlockType, zone: LayoutZone = 'above'): void {
    const block: LayoutBlock = {
      id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      zone,
      width: 100,
      ...(type === 'text' ? { heading: '', body: '', align: 'left' as const } : {}),
      ...(type === 'social' ? { socialLinks: [] } : {}),
      ...(type === 'spacer' ? { heightPx: 24 } : {}),
      ...(type === 'carousel' ? { mediaUrls: [], mediaHeightPx: 160 } : {})
    };
    this.zoneArray(zone).push(block);
    this.layout.blocks = [...this.aboveBlocks, ...this.belowBlocks];
    this.selectedBlockId = block.id;
  }

  removeBlock(block: LayoutBlock): void {
    this.aboveBlocks = this.aboveBlocks.filter(b => b.id !== block.id);
    this.belowBlocks = this.belowBlocks.filter(b => b.id !== block.id);
    this.layout.blocks = [...this.aboveBlocks, ...this.belowBlocks];
  }

  onBlockDrop(event: CdkDragDrop<LayoutBlock[]>): void {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
      event.container.data[event.currentIndex].zone = event.container.id === 'below-block-list' ? 'below' : 'above';
    }
    this.layout.blocks = [...this.aboveBlocks, ...this.belowBlocks];
  }

  blockLabel(type: LayoutBlockType): string {
    return BLOCK_PALETTE.find(entry => entry.type === type)?.label || type;
  }

  onBlockImageSelected(block: LayoutBlock, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    resizeImageFile(file, CAROUSEL_MAX_DIMENSION, 0.75).then(dataUrl => {
      block.mediaUrl = dataUrl;
    });
    input.value = '';
  }

  removeBlockMedia(block: LayoutBlock): void {
    block.mediaUrl = undefined;
  }

  onBlockVideoSelected(block: LayoutBlock, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    block.mediaUrl = URL.createObjectURL(file);
    input.value = '';
  }

  addBlockSocialLink(block: LayoutBlock): void {
    block.socialLinks = [...(block.socialLinks || []), { platform: 'instagram', url: '' }];
  }

  removeBlockSocialLink(block: LayoutBlock, index: number): void {
    block.socialLinks = (block.socialLinks || []).filter((_, i) => i !== index);
  }

  onBlockCarouselImagesSelected(block: LayoutBlock, event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    for (const file of files) {
      resizeImageFile(file, CAROUSEL_MAX_DIMENSION, 0.75).then(dataUrl => {
        block.mediaUrls = [...(block.mediaUrls || []), dataUrl];
      });
    }
    input.value = '';
  }

  removeBlockCarouselImage(block: LayoutBlock, index: number): void {
    block.mediaUrls = (block.mediaUrls || []).filter((_, i) => i !== index);
  }

  // ── Resize handles on the live preview canvas ──

  selectBlock(id: string): void {
    this.selectedBlockId = this.selectedBlockId === id ? null : id;
  }

  blockHasMediaHeight(type: LayoutBlockType): boolean {
    return type === 'image' || type === 'video' || type === 'qr' || type === 'carousel';
  }

  startResize(event: MouseEvent, block: LayoutBlock, mode: 'width' | 'height'): void {
    event.preventDefault();
    event.stopPropagation();
    const wrapper = (event.currentTarget as HTMLElement).closest('.resizable-block') as HTMLElement | null;
    const container = wrapper?.parentElement;
    if (!wrapper || !container) {
      return;
    }
    this.resizing = {
      block,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startWidthPx: wrapper.getBoundingClientRect().width,
      startHeightPx: wrapper.getBoundingClientRect().height,
      containerWidthPx: container.getBoundingClientRect().width
    };
    this.selectedBlockId = block.id;
  }

  @HostListener('document:mousemove', ['$event'])
  onResizeMove(event: MouseEvent): void {
    if (!this.resizing) {
      return;
    }
    const { block, mode, startX, startY, startWidthPx, startHeightPx, containerWidthPx } = this.resizing;
    if (mode === 'width') {
      const newWidthPx = startWidthPx + (event.clientX - startX);
      const clamped = Math.min(containerWidthPx, Math.max(containerWidthPx * 0.25, newWidthPx));
      block.width = Math.round((clamped / containerWidthPx) * 100);
    } else {
      const newHeightPx = startHeightPx + (event.clientY - startY);
      block.mediaHeightPx = Math.round(Math.min(480, Math.max(60, newHeightPx)));
    }
  }

  @HostListener('document:mouseup')
  onResizeEnd(): void {
    this.resizing = null;
  }

  // ── Social links ──

  addSocialLink(): void {
    const link: SocialLink = { platform: 'instagram', url: '' };
    this.brand.socialLinks = [...this.brand.socialLinks, link];
  }

  removeSocialLink(index: number): void {
    this.brand.socialLinks = this.brand.socialLinks.filter((_, i) => i !== index);
  }

  addFlashSaleSocialLink(): void {
    if (!this.promotion.flashSale) {
      return;
    }
    const link: SocialLink = { platform: 'instagram', url: '' };
    this.promotion.flashSale.socialLinks = [...(this.promotion.flashSale.socialLinks ?? []), link];
  }

  removeFlashSaleSocialLink(index: number): void {
    if (!this.promotion.flashSale?.socialLinks) {
      return;
    }
    this.promotion.flashSale.socialLinks = this.promotion.flashSale.socialLinks.filter((_, i) => i !== index);
  }

  // ── Save / reset ──

  async save(): Promise<void> {
    const [brandSaved, promotionSaved, layoutSaved] = await Promise.all([
      this.brandService.updateConfig(this.brand),
      this.promotionService.updateConfig(this.promotion),
      this.weblinkLayoutService.updateConfig(this.layout)
    ]);
    if (brandSaved && promotionSaved && layoutSaved) {
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
