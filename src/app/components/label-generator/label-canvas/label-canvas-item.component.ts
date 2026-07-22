import { Component, EventEmitter, Input, Output, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LabelElement } from '../../../models/label-element.model';
import { DesignerElementDirective } from '../../../directives/designer-element.directive';
import { SnapGuide } from '../../../engine/snap-engine';
import { NgxBarcode6 } from 'ngx-barcode6';
import { QRCodeComponent } from 'angularx-qrcode';

@Component({
  selector: 'app-label-canvas-item',
  standalone: true,
  imports: [CommonModule, DesignerElementDirective, NgxBarcode6, QRCodeComponent],
  template: `
    <div
      class="canvas-element"
      [class.selected]="selected"
      [class.locked]="locked"
      [class.is-image]="element.type === 'image'"
      [class.is-barcode]="element.type === 'barcode'"
      [class.is-qr]="element.type === 'qr'"
      [ngStyle]="canvasStyles"
      appDesignerElement
      [element]="element"
      [canvasWidth]="canvasWidth"
      [canvasHeight]="canvasHeight"
      [selected]="selected"
      [locked]="locked"
      [allElements]="allElements"
      [zoomLevel]="zoomLevel"
      (update)="onDesignerElementUpdate($event)"
      (rotationChange)="onDesignerElementRotation($event)"
      (dragGuides)="onDragGuides($event)"
      (selectElement)="onSelectElement()"
      (interactionStart)="interactionStart.emit()">
    
      <!-- Hidden file input for image upload -->
      @if (element.type === 'image' && !element.imageSrc) {
        <input
          #fileInput
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/svg+xml"
          (change)="onFileSelected($event)"
          style="display:none"
          />
      }
    
      <!-- Content wrapper -->
      <div class="canvas-element-inner" [ngStyle]="innerStyles" (click)="onInnerClick($event)">
        @if (element.type === 'barcode') {
          <ngx-barcode6
            class="barcode-renderer"
            [bc-value]="barcodeValue"
            [bc-format]="element.barcodeFormat || 'CODE128'"
            [bc-width]="1"
            [bc-height]="barcodeHeight"
            [bc-font-size]="10"
            [bc-display-value]="true"
            [bc-line-color]="styleColor">
          </ngx-barcode6>
        }
    
        @if (element.type === 'qr') {
          <qrcode
            class="qr-renderer"
            [qrdata]="qrValue"
            [width]="qrSize"
            [errorCorrectionLevel]="element.qrErrorCorrectionLevel || 'M'"
            [colorDark]="styleColor"
            [colorLight]="styleBackground">
          </qrcode>
        }
    
        @if (element.type === 'image' && element.imageSrc) {
          <img
            [src]="element.imageSrc"
            class="image-renderer"
            [style.objectFit]="element.style?.objectFit || 'contain'"
            alt=""
            />
        }
    
        @if (element.type === 'image' && !element.imageSrc) {
          <span class="element-label image-placeholder-text">
            Click to upload image
          </span>
        }
    
        @if (element.type !== 'barcode' && element.type !== 'qr' && element.type !== 'image') {
          <span class="element-label">
            {{ displayText }}
          </span>
        }
      </div>
    </div>
    `,
  styles: [
    `.canvas-element { position: absolute; display: flex; align-items: center; justify-content: center; padding: 0; border-radius: 4px; background: rgba(255,255,255,0.95); border: 1px solid #cbd5e1; box-shadow: 0 2px 6px rgba(15,23,42,0.06); transition: box-shadow 0.15s ease; cursor: move; user-select: none; text-align: center; font-size: 0.92rem; color: #0f172a; will-change: transform; contain: layout style; }`,
    `.canvas-element:hover { box-shadow: 0 4px 12px rgba(15,23,42,0.10); }`,
    `.canvas-element.selected { border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9, 0 4px 16px rgba(14,165,233,0.18); }`,
    `.canvas-element.locked { opacity: 0.85; cursor: not-allowed; }`,
    `.canvas-element.is-image { padding: 0; overflow: hidden; background: #f8fafc; }`,
    `.canvas-element.is-barcode { background: #ffffff; }`,
    `.canvas-element.is-qr { background: #ffffff; }`,
    `.canvas-element-inner { display: flex; align-items: center; justify-content: center; overflow: hidden; width: 100%; height: 100%; }`,
    `.barcode-renderer, .qr-renderer { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; overflow: hidden; pointer-events: none; }`,
    `.barcode-renderer ::ng-deep svg { max-width: 100%; max-height: 100%; }`,
    `.qr-renderer ::ng-deep canvas, .qr-renderer ::ng-deep img { max-width: 100%; max-height: 100%; }`,
    `.image-renderer { width: 100%; height: 100%; pointer-events: none; display: block; }`,
    `.element-label { display: block; width: 100%; pointer-events: none; overflow: hidden; white-space: normal; word-break: break-word; max-width: 100%; padding: 8px; }`,
    `.image-placeholder-text { color: #94a3b8; font-size: 0.8rem; cursor: pointer; pointer-events: none; }`,
    `:host { display: contents; }`,
  ]
})
export class LabelCanvasItemComponent {
  @Input() element!: LabelElement;
  @Input() canvasWidth = 0;
  @Input() canvasHeight = 0;
  @Input() selected = false;
  @Input() locked = false;
  @Input() zIndex = 1;
  @Input() allElements: LabelElement[] = [];
  @Input() zoomLevel = 1;

  @Output() positionChange = new EventEmitter<{ id: string; x: number; y: number }>();
  @Output() selectedElement = new EventEmitter<string>();
  @Output() resized = new EventEmitter<{ id: string; width: number; height: number; left: number; top: number }>();
  @Output() rotationChange = new EventEmitter<{ id: string; rotation: number }>();
  @Output() dragGuides = new EventEmitter<SnapGuide[]>();
  @Output() imageUpload = new EventEmitter<{ id: string; imageSrc: string }>();
  @Output() interactionStart = new EventEmitter<void>();

  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  get canvasStyles(): Record<string, string | number> {
    const style = this.element.style || {};
    const z = this.zoomLevel;
    const border = style.borderWidth && style.borderStyle && style.borderStyle !== 'none'
      ? `${style.borderWidth * z}px ${style.borderStyle} ${style.borderColor ?? '#cbd5e1'}`
      : 'none';
    const defaultRadius = this.element.type === 'image' ? 2 : 4;

    return {
      // Position/size/rotation are managed by the directive for smooth interaction
      // Do NOT set width/height/left/top/transform here – the directive owns those
      // Selected element goes to the top of the stacking order so its resize/rotation
      // handles are always reachable, even when another element's box sits over it.
      zIndex: this.selected ? 9999 : this.zIndex,
      fontFamily: style.fontFamily ?? 'Inter, system-ui, sans-serif',
      fontSize: `${this.liveFontSize}px`,
      fontWeight: style.fontWeight ?? 'normal',
      fontStyle: style.fontStyle ?? 'normal',
      textDecoration: style.textDecoration ?? 'none',
      color: style.color ?? '#0f172a',
      backgroundColor: style.backgroundColor ?? 'transparent',
      border,
      borderRadius: `${(style.borderRadius ?? defaultRadius) * z}px`,
      opacity: style.opacity ?? 1,
      textAlign: style.textAlign ?? 'center',
      padding: this.element.type === 'image' ? '0' : this.scalePadding(style.padding ?? '6px 8px', z),
      lineHeight: this.liveLineHeight
    };
  }

  /** Scales each px value in a CSS padding/margin shorthand string (e.g. "6px 8px") so
   *  the element's inner spacing zooms in step with its (already zoom-scaled) box. */
  private scalePadding(value: string, factor: number): string {
    return value
      .trim()
      .split(/\s+/)
      .map(part => {
        const match = part.match(/^(-?\d+(?:\.\d+)?)(px)?$/);
        return match ? `${parseFloat(match[1]) * factor}px` : part;
      })
      .join(' ');
  }

  get innerStyles(): Record<string, string> {
    const sx = this.element.scaleX ?? 1;
    const sy = this.element.scaleY ?? 1;
    return {
      width: '100%',
      height: '100%',
      transform: sx === 1 && sy === 1 ? 'none' : `scale(${sx}, ${sy})`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: this.innerJustifyContent
    };
  }

  /** Mirrors the text-align setting as the flex justify-content so alignment is
   *  visibly reflected in the designer canvas, not just where the text span happens
   *  to already fill its box. Barcode/QR/image content always stays centered. */
  get innerJustifyContent(): string {
    if (this.element.type === 'barcode' || this.element.type === 'qr' || this.element.type === 'image') {
      return 'center';
    }
    switch (this.element.style?.textAlign) {
      case 'left': return 'flex-start';
      case 'right': return 'flex-end';
      default: return 'center';
    }
  }

  get liveFontSize(): number {
    return (this.element.style?.fontSize ?? 13) * this.zoomLevel;
  }

  get liveLineHeight(): string {
    const lh = this.element.style?.lineHeight ?? 1.2;
    return `${typeof lh === 'number' ? lh : parseFloat(lh as unknown as string) || 1.2}em`;
  }

  get displayText(): string {
    const value = this.element.value?.trim();
    return value ? `${this.element.prefix ?? ''}${value}` : this.element.label;
  }

  get barcodeValue(): string { return this.element.value?.trim() || '123456789012'; }
  get qrValue(): string { return this.element.value?.trim() || 'https://qliclabs.com'; }
  get barcodeHeight(): number { return Math.max(20, (this.element.height - 20) * this.zoomLevel); }
  get qrSize(): number { return Math.max(24, (Math.min(this.element.width, this.element.height) - 10) * this.zoomLevel); }
  get styleColor(): string { return this.element.style?.color || '#0f172a'; }
  get styleBackground(): string { return this.element.style?.backgroundColor || '#ffffff'; }

  onSelectElement(): void {
    this.selectedElement.emit(this.element.id);
  }

  onInnerClick(event: MouseEvent): void {
    if (this.element.type === 'image' && !this.element.imageSrc) {
      event.stopPropagation();
      this.fileInput?.nativeElement.click();
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      this.imageUpload.emit({ id: this.element.id, imageSrc: dataUrl });
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  onDesignerElementUpdate(event: { x: number; y: number; width: number; height: number }): void {
    this.resized.emit({
      id: this.element.id,
      width: event.width,
      height: event.height,
      left: event.x,
      top: event.y
    });
  }

  onDesignerElementRotation(rotation: number): void {
    this.rotationChange.emit({ id: this.element.id, rotation });
  }

  onDragGuides(guides: SnapGuide[]): void {
    this.dragGuides.emit(guides);
  }
}