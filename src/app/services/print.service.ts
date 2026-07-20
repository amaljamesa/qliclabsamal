import { Injectable } from '@angular/core';
import { Label } from '../models/label.model';

@Injectable({
  providedIn: 'root'
})
export class PrintService {
  private readonly previewStorageKey = 'label-generator.preview';

  createPrintPayload(label: Label): Record<string, unknown> {
    return {
      labelId: label.id,
      name: label.name,
      settings: label.settings,
      elements: label.elements,
      fields: label.fields,
      metadata: label.metadata,
      generatedAt: new Date().toISOString()
    };
  }

  storePreview(label: Label): void {
    const data = JSON.stringify(this.createPrintPayload(label));
    localStorage.setItem(this.previewStorageKey, data);
  }

  loadPreview(): Record<string, unknown> | null {
    const raw = localStorage.getItem(this.previewStorageKey);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  clearPreview(): void {
    localStorage.removeItem(this.previewStorageKey);
  }

  printMarkup(markup: string, title: string): void {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      return;
    }

    printWindow.document.write(`<!doctype html><html><head><title>${this.escapeHtml(title)}</title>
      <style>
        @page { margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #fff; color: #000; font-family: Arial, sans-serif; }
        .print-sheet { display: grid; width: max-content; }
        .print-label { position: relative; overflow: hidden; background: #fff; break-inside: avoid; }
        .print-element { position: absolute; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .print-element span { width: 100%; word-break: break-word; white-space: normal; }
        .print-element svg { max-width: 100%; }
        .print-image { width: 100%; height: 100%; object-fit: contain; display: block; }
        .print-element qrcode, .print-element ngx-barcode6 { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
      </style></head><body>${markup}<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</script></body></html>`);
    printWindow.document.close();
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] || character));
  }
}
