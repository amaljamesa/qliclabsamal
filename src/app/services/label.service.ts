import { Injectable } from '@angular/core';
import { Label, LabelSettings } from '../models/label.model';
import { LabelElement, LabelField } from '../models/label-element.model';

@Injectable({
  providedIn: 'root'
})
export class LabelService {
  private readonly storageKey = 'label-generator.labels';
  private labels: Label[] = [];

  constructor() {
    this.labels = this.restoreLabels();
  }

  getLabels(): Label[] {
    return this.clone(this.labels);
  }

  createLabel(partial: Partial<Label>): Label {
    const now = new Date().toISOString();
    const label: Label = {
      id: this.generateId(),
      name: partial.name || `New Label ${Date.now()}`,
      templateId: partial.templateId,
      settings: partial.settings || this.defaultSettings(),
      elements: partial.elements || [],
      fields: partial.fields || [],
      metadata: {
        createdAt: now,
        updatedAt: now
      }
    };

    this.labels.unshift(label);
    this.persistLabels();
    return this.clone(label);
  }

  saveLabel(label: Label): Label {
    const index = this.labels.findIndex(item => item.id === label.id);
    const updatedLabel = {
      ...label,
      metadata: {
        ...label.metadata,
        updatedAt: new Date().toISOString()
      }
    };

    if (index === -1) {
      this.labels.unshift(updatedLabel);
    } else {
      this.labels[index] = updatedLabel;
    }

    this.persistLabels();
    return this.clone(updatedLabel);
  }

  deleteLabel(labelId: string): boolean {
    const index = this.labels.findIndex(item => item.id === labelId);
    if (index === -1) {
      return false;
    }

    this.labels.splice(index, 1);
    this.persistLabels();
    return true;
  }

  loadLabel(labelId: string): Label | undefined {
    const label = this.labels.find(item => item.id === labelId);
    return label ? this.clone(label) : undefined;
  }

  private defaultSettings(): LabelSettings {
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

  private restoreLabels(): Label[] {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed as Label[];
    } catch {
      return [];
    }
  }

  private persistLabels(): void {
    const serialized = JSON.stringify(this.labels);
    localStorage.setItem(this.storageKey, serialized);
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private generateId(): string {
    return `lbl_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  }
}
