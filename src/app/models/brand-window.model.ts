export type SocialPlatform = 'instagram' | 'facebook' | 'twitter' | 'linkedin' | 'youtube';

export interface SocialLink {
  platform: SocialPlatform;
  url: string;
}

export interface LoyaltyProgramConfig {
  brandName: string; // e.g. 'Zudio Fanz'
  qrValue: string;
}

export interface BrandWindowConfig {
  supplierId: string;
  businessName: string; // display name shown on the weblink/receipt
  legalName?: string; // registered entity name for the tax invoice block, falls back to businessName
  gstin?: string;
  address?: string; // place of supply / registered address for the tax invoice block
  logoUrl?: string;
  description?: string;
  socialLinks: SocialLink[];
  contactPhone?: string;
  contactEmail?: string;
  enabled: boolean;
  loyaltyProgram?: LoyaltyProgramConfig;
  // Static payment-collection link (UPI/gateway) the merchant provides; rendered as a
  // scan-to-pay QR on unpaid bills when no uploaded QR image is set.
  paymentQrUrl?: string;
  // Uploaded photo/screenshot of the merchant's real payment QR code - takes priority over
  // paymentQrUrl since most merchants have an actual QR image (from their bank/UPI app)
  // rather than a UPI deep-link string to type in.
  paymentQrImageUrl?: string;
  footerImageUrl?: string; // falls back to logoUrl in the footer bar when unset
  footerNote?: string;
}
