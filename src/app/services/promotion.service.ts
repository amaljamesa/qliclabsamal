import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import { PromotionConfig } from '../models/promotion.model';
import { placeholderArtDataUri } from './placeholder-art.util';
import { DEFAULT_SUPPLIER_ID } from './brand-window.service';
import { kvGet, kvSet } from './kv-store.util';

const STORAGE_KEY_PREFIX = 'qliclabs.promotion.';
// Legacy key from before this moved to IndexedDB - see brand-window.service.ts for why.
const LEGACY_LOCALSTORAGE_KEY_PREFIX = 'qliclabs.promotion.';

// Sample ad/promo creative. There's no ad-campaign management screen in the app yet, so
// this is the one place to swap in real banner images/flash-sale copy until one exists.
@Injectable({
  providedIn: 'root'
})
export class PromotionService {
  private readonly config: PromotionConfig = {
    supplierId: DEFAULT_SUPPLIER_ID,
    banners: [
      {
        id: 'banner-top-1',
        title: 'Every invoice, working twice',
        subtitle: 'Paid faster, brand remembered.',
        position: 'top',
        imageUrl: placeholderArtDataUri('AUTUMN 26', 'New arrivals, up to 40% off', ['#111827', '#334155'])
      },
      {
        id: 'banner-top-2',
        title: 'Top styles from ₹499',
        subtitle: 'Shop the edit before it sells out.',
        position: 'top',
        imageUrl: placeholderArtDataUri('TOP ₹499', 'Fresh drops every week', ['#0ea5e9', '#14746f'])
      },
      {
        id: 'banner-top-3',
        title: 'Members get early access',
        subtitle: 'Join our loyalty club for exclusive drops.',
        position: 'top',
        imageUrl: placeholderArtDataUri('MEMBERS CLUB', 'Early access + birthday perks', ['#e94057', '#8a2387'])
      }
    ],
    flashSale: {
      id: 'flash-1',
      title: 'MEGA SAVINGS on your favourite picks',
      discountLabel: 'UP TO 50% OFF',
      windowLabel: 'TODAY ONLY · 6 PM - 11 PM',
      ctaLabel: 'Follow Us',
      sponsorName: 'Qliclabs',
      imageUrl: placeholderArtDataUri('SKIP THE FOMO', 'Follow @yourbrand', ['#fde047', '#facc15'], '#111827')
    },
    bannerHeightPx: 160,
    videoAds: [],
    videoAdsEnabled: false
  };

  private readonly ready: Promise<void>;

  constructor() {
    this.ready = this.loadPersisted();
  }

  private async loadPersisted(): Promise<void> {
    const key = STORAGE_KEY_PREFIX + this.config.supplierId;
    let persisted = await kvGet<Partial<PromotionConfig>>(key);
    if (!persisted) {
      persisted = this.readLegacyLocalStorage(this.config.supplierId);
      if (persisted) {
        await kvSet(key, { ...this.config, ...persisted });
      }
    }
    if (persisted) {
      Object.assign(this.config, persisted);
    }
  }

  getConfig(_supplierId?: string): Observable<PromotionConfig> {
    return from(this.ready).pipe(
      map(() => ({ ...this.config })),
      delay(200)
    );
  }

  // Settings-page write path. Banners/height/flash-sale (plain data URLs and text) persist
  // to IndexedDB so they survive a reload or a new tab, without competing for localStorage's
  // tiny ~5MB per-origin quota (shared with every other feature in the app). Video ads are
  // excluded from what's written - they're held as blob object URLs (URL.createObjectURL),
  // which go stale the moment the tab that created them closes, so persisting them would just
  // carry dead links. Returns false when the write didn't actually persist so the caller can
  // warn the user instead of silently pretending it saved.
  async updateConfig(config: PromotionConfig): Promise<boolean> {
    Object.assign(this.config, config);
    const { videoAds, ...persistable } = this.config;
    return kvSet(STORAGE_KEY_PREFIX + this.config.supplierId, persistable);
  }

  private readLegacyLocalStorage(supplierId: string): Partial<PromotionConfig> | null {
    try {
      const raw = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY_PREFIX + supplierId);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
