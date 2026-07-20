import { Injectable } from '@angular/core';
import { LabelTemplate } from '../models/label-template.model';
import { LabelElement, LabelField } from '../models/label-element.model';
import { LabelSettings } from '../models/label.model';

@Injectable({
  providedIn: 'root'
})
export class TemplateService {
  private readonly templates: LabelTemplate[] = [
    {
      id: 'template-roll-01',
      name: 'Basic Barcode Layout',
      description: 'A simple roll layout with barcode and product details.',
      defaultSettings: this.baseSettings(),
      elements: [
        { id: 'element-1', type: 'barcode', label: 'Barcode', width: 180, height: 60, x: 10, y: 10, visible: true },
        { id: 'element-2', type: 'productName', label: 'Product Name', value: 'Product Name', width: 180, height: 24, x: 10, y: 80, visible: true } as LabelElement,
        { id: 'element-3', type: 'mrp', label: 'MRP', prefix: 'MRP: ', value: '0.00', width: 180, height: 20, x: 10, y: 110, visible: true } as LabelElement
      ],
      fields: [
        { id: 'field-1', name: 'productName', label: 'Product Name', enabled: true },
        { id: 'field-2', name: 'mrp', label: 'MRP', enabled: true },
        { id: 'field-3', name: 'barcode', label: 'Barcode', enabled: true }
      ]
    },
    {
      id: 'template-roll-02',
      name: 'Compact Product Label',
      description: 'Compact layout with company, expiry and barcode fields.',
      defaultSettings: this.baseSettings(),
      elements: [
        { id: 'element-4', type: 'companyName', label: 'Company Name', value: 'Company Name', width: 180, height: 20, x: 10, y: 10, visible: true } as LabelElement,
        { id: 'element-5', type: 'barcode', label: 'Barcode', width: 180, height: 50, x: 10, y: 35, visible: true },
        { id: 'element-6', type: 'expiryDate', label: 'Expiry Date', prefix: 'Exp Date: ', value: '10-01-2025', width: 180, height: 20, x: 10, y: 95, visible: true } as LabelElement
      ],
      fields: [
        { id: 'field-4', name: 'companyName', label: 'Company Name', enabled: true },
        { id: 'field-5', name: 'expiryDate', label: 'Expiry Date', enabled: true },
        { id: 'field-6', name: 'barcode', label: 'Barcode', enabled: true }
      ]
    }
  ];

  getTemplates(): LabelTemplate[] {
    return [...this.templates];
  }

  getTemplateById(templateId: string): LabelTemplate | undefined {
    return this.templates.find(template => template.id === templateId);
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
