import { SocialLink } from './brand-window.model';

export type LayoutBlockType = 'logo' | 'image' | 'video' | 'qr' | 'carousel' | 'text' | 'social' | 'spacer';

// A single zone is a flat, ordered list - position within the array is the display order,
// same convention as PromoBanner/VideoAd arrays in promotion.model.ts.
export type LayoutZone = 'above' | 'below';

export interface LayoutBlock {
  id: string;
  type: LayoutBlockType;
  zone: LayoutZone;

  // Drag-resize handles in the builder write here - width as % of the canvas, height as an
  // explicit px override for media types (image/video/qr/carousel). Undefined means "auto".
  width?: number;
  mediaHeightPx?: number;

  // logo / image / video / qr
  mediaUrl?: string;
  linkUrl?: string;
  caption?: string;

  // carousel only - multiple slides, reuses the same auto-advancing carousel as promo banners
  mediaUrls?: string[];

  // video only
  durationSeconds?: number;

  // text only
  heading?: string;
  body?: string;
  align?: 'left' | 'center' | 'right';

  // social only
  socialLinks?: SocialLink[];

  // spacer only
  heightPx?: number;
}

export interface WeblinkLayoutConfig {
  supplierId: string;
  enabled: boolean;
  blocks: LayoutBlock[];
}
