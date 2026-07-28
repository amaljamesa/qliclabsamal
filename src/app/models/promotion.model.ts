import { SocialLink } from './brand-window.model';

export interface PromoBanner {
  id: string;
  imageUrl?: string;
  title: string;
  subtitle?: string;
  position: 'top' | 'bottom';
}

export interface FlashSalePromo {
  id: string;
  enabled?: boolean; // defaults to true when unset, for backward compatibility with existing configs
  title: string;
  discountLabel: string;
  windowLabel: string;
  ctaLabel: string;
  ctaUrl?: string;
  sponsorName?: string;
  imageUrl?: string;
  durationSeconds?: number; // auto-close timer for the image popup; defaults to 30s when unset
  // Social platform icons shown instead of the CTA button when at least one has a url set.
  socialLinks?: SocialLink[];
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
