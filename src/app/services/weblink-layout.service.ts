import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import { WeblinkLayoutConfig } from '../models/weblink-layout.model';
import { DEFAULT_SUPPLIER_ID } from './brand-window.service';
import { kvGet, kvSet } from './kv-store.util';

const STORAGE_KEY_PREFIX = 'qliclabs.weblinkLayout.';

// Advanced block-based layout for the invoice weblink - an opt-in alternative to the fixed
// header/footer branding fields. Disabled (enabled: false) by default so existing suppliers
// keep the classic layout until they explicitly turn this on.
@Injectable({
  providedIn: 'root'
})
export class WeblinkLayoutService {
  private readonly config: WeblinkLayoutConfig = {
    supplierId: DEFAULT_SUPPLIER_ID,
    enabled: false,
    blocks: []
  };

  private readonly ready: Promise<void>;

  constructor() {
    this.ready = this.loadPersisted();
  }

  private async loadPersisted(): Promise<void> {
    const key = STORAGE_KEY_PREFIX + this.config.supplierId;
    const persisted = await kvGet<Partial<WeblinkLayoutConfig>>(key);
    if (persisted) {
      Object.assign(this.config, persisted);
    }
  }

  getConfig(_supplierId?: string): Observable<WeblinkLayoutConfig> {
    return from(this.ready).pipe(
      map(() => ({ ...this.config, blocks: this.config.blocks.map(block => ({ ...block })) })),
      delay(200)
    );
  }

  // Video blocks hold a blob object URL (URL.createObjectURL) that goes stale the moment the
  // tab that created it closes - same reasoning as PromotionService excluding videoAds from
  // persistence. Kept in the in-memory config (so this session's preview/live page still play
  // it) but stripped before writing to IndexedDB so a reload doesn't show a broken video.
  async updateConfig(config: WeblinkLayoutConfig): Promise<boolean> {
    Object.assign(this.config, config);
    const persistableBlocks = this.config.blocks.map(block =>
      block.type === 'video' ? { ...block, mediaUrl: undefined } : block
    );
    return kvSet(STORAGE_KEY_PREFIX + this.config.supplierId, { ...this.config, blocks: persistableBlocks });
  }
}
