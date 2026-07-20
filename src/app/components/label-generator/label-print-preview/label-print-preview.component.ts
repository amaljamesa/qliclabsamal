import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgxBarcode6 } from 'ngx-barcode6';
import { QRCodeComponent } from 'angularx-qrcode';
import { Label } from '../../../models/label.model';
import { LabelElement } from '../../../models/label-element.model';
import { PrintService } from '../../../services/print.service';
import { modelToMm } from '../../../models/label-units';

/** CSS defines 1in = 96px and 1in = 25.4mm; used to convert model-space numbers that a
 *  child library (barcode/QR) needs as raw pixels back into the mm box they now sit in. */
const CSS_PX_PER_MM = 96 / 25.4;
const MM_TO_PX_MODEL = CSS_PX_PER_MM / 4; // matches LabelCanvasComponent's baseScale of 4

@Component({
  selector: 'app-label-print-preview',
  standalone: true,
  imports: [CommonModule, NgxBarcode6, QRCodeComponent],
  templateUrl: './label-print-preview.component.html',
  styleUrls: ['./label-print-preview.component.css']
})
export class LabelPrintPreviewComponent implements AfterViewInit {
  @Input({ required: true }) label!: Label;
  @Output() close = new EventEmitter<void>();
  @ViewChild('printArea') printArea?: ElementRef<HTMLElement>;

  constructor(private printService: PrintService) {}

  get copies(): number[] {
    return Array.from({ length: Math.max(1, this.label.settings.rows * this.label.settings.columns) }, (_, index) => index);
  }

  get sheetStyle(): Record<string, string> {
    return {
      gridTemplateColumns: `repeat(${Math.max(1, this.label.settings.columns)}, ${this.label.settings.dimensions.width}mm)`,
      gap: `${this.label.settings.dimensions.verticalGap}mm ${this.label.settings.dimensions.horizontalGap}mm`,
      padding: `${this.label.settings.margins.top}mm ${this.label.settings.margins.right}mm ${this.label.settings.margins.bottom}mm ${this.label.settings.margins.left}mm`
    };
  }

  get labelStyle(): Record<string, string> {
    return { width: `${this.label.settings.dimensions.width}mm`, height: `${this.label.settings.dimensions.height}mm` };
  }

  /** Element geometry/style numbers are stored in the same "4 units = 1mm" model space
   *  the design canvas uses, so they're converted to real mm here – matching the mm-sized
   *  label box below (labelStyle) and what the true-size extended preview already renders,
   *  so print output lines up with the design without any manual re-scaling. */
  elementStyle(element: LabelElement): Record<string, string | number> {
    const style = element.style || {};
    const border = style.borderWidth && style.borderStyle && style.borderStyle !== 'none'
      ? `${modelToMm(style.borderWidth)}mm ${style.borderStyle} ${style.borderColor ?? '#000'}` : 'none';
    const lineHeight = style.lineHeight ?? 1.2;
    return {
      width: `${modelToMm(element.width)}mm`, height: `${modelToMm(element.height)}mm`,
      left: `${modelToMm(element.x)}mm`, top: `${modelToMm(element.y)}mm`,
      transform: `rotate(${element.rotation ?? style.rotation ?? 0}deg)`, zIndex: element.zIndex ?? 1,
      fontFamily: style.fontFamily ?? 'Arial, sans-serif', fontSize: `${modelToMm(style.fontSize ?? 13)}mm`, fontWeight: style.fontWeight ?? 'normal',
      fontStyle: style.fontStyle ?? 'normal', textDecoration: style.textDecoration ?? 'none', textAlign: style.textAlign ?? 'center',
      color: style.color ?? '#000', backgroundColor: style.backgroundColor ?? 'transparent', border,
      borderRadius: `${modelToMm(style.borderRadius ?? 0)}mm`, opacity: style.opacity ?? 1,
      padding: this.scalePaddingToMm(style.padding ?? '6px 8px'),
      lineHeight: `${typeof lineHeight === 'number' ? lineHeight : parseFloat(lineHeight as unknown as string) || 1.2}em`
    };
  }

  /** Scales each px value in a CSS padding shorthand (e.g. "6px 8px") into the same mm
   *  units as the element box, so inner spacing stays proportional at print size. */
  private scalePaddingToMm(value: string): string {
    return value
      .trim()
      .split(/\s+/)
      .map(part => {
        const match = part.match(/^(-?\d+(?:\.\d+)?)(px)?$/);
        return match ? `${modelToMm(parseFloat(match[1]))}mm` : part;
      })
      .join(' ');
  }

  displayText(element: LabelElement): string {
    const value = element.value?.trim();
    return value ? `${element.prefix ?? ''}${value}` : element.label;
  }

  barcodeValue(element: LabelElement): string { return element.value?.trim() || '123456789012'; }
  qrValue(element: LabelElement): string { return element.value?.trim() || 'https://qliclabs.com'; }
  /** Barcode/QR libraries take raw pixel sizes, not CSS mm strings, so their internal
   *  render target is converted through the same mm ratio as the (now mm-sized) box. */
  barcodeHeight(element: LabelElement): number { return Math.max(20, (element.height - 24) * MM_TO_PX_MODEL); }
  qrSize(element: LabelElement): number { return Math.max(24, (Math.min(element.width, element.height) - 12) * MM_TO_PX_MODEL); }
  color(element: LabelElement): string { return element.style?.color || '#000000'; }
  background(element: LabelElement): string { return element.style?.backgroundColor || '#ffffff'; }

  ngAfterViewInit(): void { this.printService.storePreview(this.label); }

  print(): void {
    const markup = this.printArea?.nativeElement.innerHTML;
    if (markup) this.printService.printMarkup(markup, this.label.name);
  }
}
