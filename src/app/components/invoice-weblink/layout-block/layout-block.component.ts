import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LayoutBlock } from '../../../models/weblink-layout.model';
import { PromoBanner } from '../../../models/promotion.model';
import { PromoBannerComponent } from '../promo-banner/promo-banner.component';

@Component({
  selector: 'app-layout-block',
  standalone: true,
  imports: [CommonModule, PromoBannerComponent],
  templateUrl: './layout-block.component.html',
  styleUrls: ['./layout-block.component.css']
})
export class LayoutBlockComponent {
  @Input() block: LayoutBlock | undefined;

  platformLabel(platform: string): string {
    return platform.charAt(0).toUpperCase() + platform.slice(1);
  }

  // Reuses the same auto-advancing carousel as promo banners - PromoBannerComponent just
  // needs its slides in PromoBanner shape, so map the block's raw image URLs on the fly.
  carouselSlides(block: LayoutBlock): PromoBanner[] {
    return (block.mediaUrls || []).map((url, index) => ({
      id: `${block.id}-${index}`,
      imageUrl: url,
      title: '',
      position: 'top'
    }));
  }
}
