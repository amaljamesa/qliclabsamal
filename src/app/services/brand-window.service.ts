import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import { BrandWindowConfig } from '../models/brand-window.model';
import { kvGet, kvSet } from './kv-store.util';

// Single-tenant business profile: this app represents one business, so there is one
// profile rather than a map keyed by supplier/customer. There is no settings screen to
// edit this yet - until one exists, this is the one place to change your business details.
export const DEFAULT_SUPPLIER_ID = 'default';

const STORAGE_KEY_PREFIX = 'qliclabs.brandWindow.';
// Legacy key from before this moved to IndexedDB - localStorage's ~5MB per-origin quota is
// shared with every other feature in the app, so image uploads here could silently fail to
// persist once other data (labels, print previews, ...) ate into the same budget.
const LEGACY_LOCALSTORAGE_KEY_PREFIX = 'qliclabs.brandWindow.';

@Injectable({
  providedIn: 'root'
})
export class BrandWindowService {
  private readonly profile: BrandWindowConfig = {
    supplierId: DEFAULT_SUPPLIER_ID,
    businessName: 'Qliclabs',
    legalName: 'Qliclabs Pvt Ltd',
    gstin: '',
    address: '',
    description: 'Share invoices as secure weblinks while showcasing your brand on every transaction.',
    socialLinks: [],
    contactPhone: '',
    contactEmail: '',
    enabled: true,
    // TODO: placeholder until the merchant supplies their real payment-collection link/UPI QR
    paymentQrUrl: 'upi://pay?pa=PLACEHOLDER@upi&pn=Qliclabs'
  };

  private readonly ready: Promise<void>;

  constructor() {
    this.ready = this.loadPersisted();
  }

  private async loadPersisted(): Promise<void> {
    const key = STORAGE_KEY_PREFIX + this.profile.supplierId;
    let persisted = await kvGet<Partial<BrandWindowConfig>>(key);
    if (!persisted) {
      persisted = this.readLegacyLocalStorage(this.profile.supplierId);
      if (persisted) {
        await kvSet(key, { ...this.profile, ...persisted });
      }
    }
    if (persisted) {
      Object.assign(this.profile, persisted);
    }
  }

  // TODO: replace with GET /v1/business-profile once a settings screen exists
  getConfig(_supplierId?: string): Observable<BrandWindowConfig> {
    return from(this.ready).pipe(
      map(() => ({ ...this.profile })),
      delay(200)
    );
  }

  // Settings-page write path. Persists to IndexedDB so header/footer branding survives a
  // reload even though there's no backend profile endpoint yet. Returns false when the write
  // didn't actually persist so the caller can warn the user instead of silently pretending it
  // saved.
  async updateConfig(config: BrandWindowConfig): Promise<boolean> {
    Object.assign(this.profile, config);
    return kvSet(STORAGE_KEY_PREFIX + this.profile.supplierId, this.profile);
  }

  private readLegacyLocalStorage(supplierId: string): Partial<BrandWindowConfig> | null {
    try {
      const raw = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY_PREFIX + supplierId);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
