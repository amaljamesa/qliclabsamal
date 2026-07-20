import { Injectable } from '@angular/core';
import { LabelTemplate } from '../models/label-template.model';
import { LabelProfile } from '../models/label-profile.model';
import { Label, LabelSettings } from '../models/label.model';
import { LabelElement } from '../models/label-element.model';

const PROFILE_STORAGE_KEY = 'label-generator-profiles';
const TEMPLATE_STORAGE_KEY = 'label-generator-templates';

@Injectable({
  providedIn: 'root'
})
export class ProfileTemplateService {
  private profiles: LabelProfile[] = this.loadProfiles();
  private templates: LabelTemplate[] = this.loadTemplates();

  constructor() {
    if (this.templates.length === 0) {
      this.templates = this.defaultTemplates();
      this.saveTemplates();
    }
    if (this.profiles.length === 0) {
      this.profiles = [this.createDefaultProfile()];
      this.saveProfiles();
    }
  }

  getProfiles(): LabelProfile[] {
    return [...this.profiles];
  }

  getTemplates(): LabelTemplate[] {
    return [...this.templates];
  }

  createProfile(name: string, label: Label): LabelProfile {
    const profile: LabelProfile = {
      id: `profile-${Date.now()}`,
      name,
      default: false,
      label: { ...label, id: `label-${Date.now()}` }
    };
    this.profiles.push(profile);
    this.saveProfiles();
    return profile;
  }

  renameProfile(profileId: string, name: string): void {
    this.profiles = this.profiles.map(profile =>
      profile.id === profileId ? { ...profile, name } : profile
    );
    this.saveProfiles();
  }

  deleteProfile(profileId: string): void {
    this.profiles = this.profiles.filter(profile => profile.id !== profileId);
    if (!this.profiles.some(profile => profile.default)) {
      this.profiles = this.profiles.map((profile, index) =>
        index === 0 ? { ...profile, default: true } : profile
      );
    }
    this.saveProfiles();
  }

  setDefaultProfile(profileId: string): void {
    this.profiles = this.profiles.map(profile => ({
      ...profile,
      default: profile.id === profileId
    }));
    this.saveProfiles();
  }

  createTemplate(name: string, description: string, label: Label): LabelTemplate {
    const template: LabelTemplate = {
      id: `template-${Date.now()}`,
      name,
      description,
      defaultSettings: label.settings,
      elements: label.elements.map(element => ({ ...element, id: `element-${Date.now()}-${Math.random().toString(36).substr(2, 5)}` } as LabelElement)),
      fields: label.fields
    };
    this.templates.push(template);
    this.saveTemplates();
    return template;
  }

  duplicateTemplate(templateId: string): LabelTemplate | undefined {
    const template = this.templates.find(item => item.id === templateId);
    if (!template) {
      return undefined;
    }
    const duplicate: LabelTemplate = {
      ...template,
      id: `template-${Date.now()}`,
      name: `${template.name} Copy`,
      elements: template.elements.map(element => ({ ...element, id: `element-${Date.now()}-${Math.random().toString(36).substr(2, 5)}` } as LabelElement))
    };
    this.templates.push(duplicate);
    this.saveTemplates();
    return duplicate;
  }

  saveTemplate(template: LabelTemplate): void {
    const existingIndex = this.templates.findIndex(item => item.id === template.id);
    if (existingIndex !== -1) {
      this.templates[existingIndex] = template;
    } else {
      this.templates.push(template);
    }
    this.saveTemplates();
  }

  loadTemplate(templateId: string): LabelTemplate | undefined {
    return this.templates.find(item => item.id === templateId);
  }

  saveProfiles(): void {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(this.profiles));
  }

  saveTemplates(): void {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(this.templates));
  }

  private loadProfiles(): LabelProfile[] {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    return raw ? JSON.parse(raw) as LabelProfile[] : [];
  }

  private loadTemplates(): LabelTemplate[] {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    return raw ? JSON.parse(raw) as LabelTemplate[] : [];
  }

  private createDefaultProfile(): LabelProfile {
    const defaultLabel: Label = {
      id: `label-${Date.now()}`,
      name: 'Default Label',
      settings: this.baseSettings(),
      elements: [
        { id: 'element-barcode', type: 'barcode', label: 'Barcode Placeholder', width: 180, height: 60, x: 10, y: 10, visible: true } as any,
        { id: 'element-product', type: 'productName', label: 'Product Name', width: 180, height: 30, x: 10, y: 90, visible: true } as any
      ],
      fields: [
        { id: 'field-1', name: 'productName', label: 'Product Name', enabled: true },
        { id: 'field-2', name: 'barcode', label: 'Barcode', enabled: true }
      ],
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };

    return {
      id: 'profile-default',
      name: 'Default Profile',
      default: true,
      label: defaultLabel
    };
  }

  private defaultTemplates(): LabelTemplate[] {
    return [
      {
        id: 'template-price-label',
        name: 'Price Label',
        description: 'A label with product name, price and barcode.',
        defaultSettings: this.baseSettings(),
        elements: [
          { id: 'tpl-price-1', type: 'text', label: 'Product Name', width: 180, height: 24, x: 10, y: 10, visible: true } as LabelElement,
          { id: 'tpl-price-2', type: 'text', label: 'MRP', width: 120, height: 20, x: 10, y: 40, visible: true } as LabelElement,
          { id: 'tpl-price-3', type: 'barcode', label: 'Barcode', width: 180, height: 60, x: 10, y: 70, visible: true }
        ],
        fields: [
          { id: 'field-price-1', name: 'productName', label: 'Product Name', enabled: true },
          { id: 'field-price-2', name: 'mrp', label: 'MRP', enabled: true },
          { id: 'field-price-3', name: 'barcode', label: 'Barcode', enabled: true }
        ]
      },
      {
        id: 'template-barcode-label',
        name: 'Barcode Label',
        description: 'Focused barcode layout with pricing details.',
        defaultSettings: this.baseSettings(),
        elements: [
          { id: 'tpl-barcode-1', type: 'barcode', label: 'Barcode', width: 180, height: 60, x: 10, y: 10, visible: true },
          { id: 'tpl-barcode-2', type: 'text', label: 'Sale Price', width: 120, height: 24, x: 10, y: 80, visible: true } as LabelElement
        ],
        fields: [
          { id: 'field-barcode-1', name: 'barcode', label: 'Barcode', enabled: true },
          { id: 'field-barcode-2', name: 'salePrice', label: 'Sale Price', enabled: true }
        ]
      },
      {
        id: 'template-offer-label',
        name: 'Offer Label',
        description: 'Promotional label with offer badge and price.',
        defaultSettings: this.baseSettings(),
        elements: [
          { id: 'tpl-offer-1', type: 'text', label: 'Offer', width: 180, height: 24, x: 10, y: 10, visible: true } as LabelElement,
          { id: 'tpl-offer-2', type: 'text', label: 'Offer Price', width: 180, height: 24, x: 10, y: 40, visible: true } as LabelElement,
          { id: 'tpl-offer-3', type: 'barcode', label: 'Barcode', width: 180, height: 60, x: 10, y: 70, visible: true }
        ],
        fields: [
          { id: 'field-offer-1', name: 'offer', label: 'Offer', enabled: true },
          { id: 'field-offer-2', name: 'offerPrice', label: 'Offer Price', enabled: true },
          { id: 'field-offer-3', name: 'barcode', label: 'Barcode', enabled: true }
        ]
      },
      {
        id: 'template-product-label',
        name: 'Product Label',
        description: 'Label with company, product name and pricing.',
        defaultSettings: this.baseSettings(),
        elements: [
          { id: 'tpl-product-1', type: 'text', label: 'Company Name', width: 180, height: 20, x: 10, y: 10, visible: true } as LabelElement,
          { id: 'tpl-product-2', type: 'text', label: 'Product Name', width: 180, height: 24, x: 10, y: 35, visible: true } as LabelElement,
          { id: 'tpl-product-3', type: 'text', label: 'MRP', width: 180, height: 20, x: 10, y: 65, visible: true } as LabelElement
        ],
        fields: [
          { id: 'field-product-1', name: 'companyName', label: 'Company Name', enabled: true },
          { id: 'field-product-2', name: 'productName', label: 'Product Name', enabled: true },
          { id: 'field-product-3', name: 'mrp', label: 'MRP', enabled: true }
        ]
      },
      {
        id: 'template-qr-label',
        name: 'QR Label',
        description: 'Label with QR placeholder and product details.',
        defaultSettings: this.baseSettings(),
        elements: [
          { id: 'tpl-qr-1', type: 'qr', label: 'QR Code', width: 120, height: 120, x: 10, y: 10, visible: true },
          { id: 'tpl-qr-2', type: 'text', label: 'Product Name', width: 180, height: 24, x: 140, y: 10, visible: true } as LabelElement
        ],
        fields: [
          { id: 'field-qr-1', name: 'qr', label: 'QR Code', enabled: true },
          { id: 'field-qr-2', name: 'productName', label: 'Product Name', enabled: true }
        ]
      }
    ];
  }

  private baseSettings(): LabelSettings {
    return {
      layoutName: 'New Label',
      printerType: 'Roll',
      rows: 1,
      columns: 2,
      dimensions: {
        width: 50,
        height: 40,
        horizontalGap: 0,
        verticalGap: 0
      },
      margins: {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0
      },
      fontSettings: {
        headingSize: 14,
        bodySize: 12,
        captionSize: 10
      }
    };
  }
}
