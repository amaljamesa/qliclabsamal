export interface PromoBanner {
  id: string;
  imageUrl?: string;
  title: string;
  subtitle?: string;
  position: 'top' | 'bottom';
}

export interface FlashSalePromo {
  id: string;
  title: string;
  discountLabel: string;
  windowLabel: string;
  ctaLabel: string;
  ctaUrl?: string;
  sponsorName?: string;
  imageUrl?: string;
}

export interface VideoAd {
  id: string;
  url: string;
  durationSeconds: number;
}

export interface PromotionConfig {
  supplierId: string;
  banners: PromoBanner[];
  bannerHeightPx?: number; // header carousel height, customizable in weblink branding settings
  flashSale?: FlashSalePromo;
  videoAds: VideoAd[];
  videoAdsEnabled: boolean;
}
