import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';

import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { LABEL_ELEMENT_PREFIXES, LabelElement, LabelElementStyle } from '../../../models/label-element.model';

@Component({
  selector: 'app-label-properties',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './label-properties.component.html',
  styleUrls: ['./label-properties.component.css']
})
export class LabelPropertiesComponent implements OnDestroy {
  @Input() set element(value: LabelElement | undefined) {
    this._element = value;
    this.syncFormWithElement();
  }
  get element(): LabelElement | undefined {
    return this._element;
  }

  @Output() propertiesChange = new EventEmitter<Partial<LabelElement> & { id: string }>();
  @Output() deleteElement = new EventEmitter<string>();
  @Output() duplicateElement = new EventEmitter<string>();
  @Output() bringForward = new EventEmitter<string>();
  @Output() sendBackward = new EventEmitter<string>();
  @Output() toggleLock = new EventEmitter<string>();

  form: FormGroup;
  private _element?: LabelElement;
  private valueChangesSub?: Subscription;

  expandedSections: Record<string, boolean> = {
    content: true,
    typography: true,
    box: true,
    size: true
  };

  toggleSection(section: string): void {
    this.expandedSections[section] = !this.expandedSections[section];
  }

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      fontFamily: ['Inter, system-ui, sans-serif'],
      fontSize: [13, [Validators.min(8), Validators.max(72)]],
      bold: [false],
      italic: [false],
      underline: [false],
      textColor: ['#0f172a'],
      backgroundColor: ['transparent'],
      borderWidth: [0, [Validators.min(0), Validators.max(20)]],
      borderStyle: ['solid'],
      borderColor: ['#cbd5e1'],
      borderRadius: [0, [Validators.min(0), Validators.max(50)]],
      opacity: [1, [Validators.min(0), Validators.max(1)]],
      rotation: [0, [Validators.min(0), Validators.max(360)]],
      alignment: ['center'],
      width: [160, [Validators.min(20)]],
      height: [32, [Validators.min(20)]],
      padding: ['8px'],
      margin: ['0px'],
      value: [''],
      label: [''],
      prefix: [''],
      barcodeFormat: ['CODE128'],
      qrErrorCorrectionLevel: ['M']
    });

    this.valueChangesSub = this.form.valueChanges.subscribe(() => {
      if (this.element) {
        this.emitPropertyChanges();
      }
    });
  }

  ngOnDestroy(): void {
    this.valueChangesSub?.unsubscribe();
  }

  onDelete(): void {
    if (this.element) {
      this.deleteElement.emit(this.element.id);
    }
  }

  onDuplicate(): void {
    if (this.element) {
      this.duplicateElement.emit(this.element.id);
    }
  }

  onBringForward(): void {
    if (this.element) {
      this.bringForward.emit(this.element.id);
    }
  }

  onSendBackward(): void {
    if (this.element) {
      this.sendBackward.emit(this.element.id);
    }
  }

  onToggleLock(): void {
    if (this.element) {
      this.toggleLock.emit(this.element.id);
    }
  }

  private syncFormWithElement(): void {
    const defaults = {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 13,
      bold: false,
      italic: false,
      underline: false,
      textColor: '#0f172a',
      backgroundColor: 'transparent',
      borderWidth: 0,
      borderStyle: 'solid',
      borderColor: '#cbd5e1',
      borderRadius: 0,
      opacity: 1,
      rotation: 0,
      alignment: 'center',
      width: 160,
      height: 32,
      padding: '8px',
      margin: '0px',
      value: '',
      label: '',
      prefix: '',
      barcodeFormat: 'CODE128',
      qrErrorCorrectionLevel: 'M'
    };

    if (!this.element) {
      this.form.reset(defaults, { emitEvent: false });
      return;
    }

    const style: LabelElementStyle = this.element.style || {};
    // Use element.rotation if available, otherwise fallback to style.rotation
    const rotation = this.element.rotation ?? style.rotation ?? defaults.rotation;
    this.form.patchValue(
      {
        fontFamily: style.fontFamily ?? defaults.fontFamily,
        fontSize: style.fontSize ?? defaults.fontSize,
        bold: style.fontWeight === 'bold',
        italic: style.fontStyle === 'italic',
        underline: style.textDecoration === 'underline',
        textColor: style.color ?? defaults.textColor,
        backgroundColor: style.backgroundColor ?? defaults.backgroundColor,
        borderWidth: style.borderWidth ?? defaults.borderWidth,
        borderStyle: style.borderStyle ?? defaults.borderStyle,
        borderColor: style.borderColor ?? defaults.borderColor,
        borderRadius: style.borderRadius ?? defaults.borderRadius,
        opacity: style.opacity ?? defaults.opacity,
        rotation,
        alignment: style.textAlign ?? defaults.alignment,
        width: Math.max(20, this.element.width),
        height: Math.max(20, this.element.height),
        padding: style.padding ?? defaults.padding,
        margin: style.margin ?? defaults.margin,
        value: this.element.value ?? defaults.value,
        label: this.element.label ?? defaults.label,
        prefix: this.element.prefix ?? LABEL_ELEMENT_PREFIXES[this.element.type] ?? defaults.prefix,
        barcodeFormat: this.element.barcodeFormat ?? defaults.barcodeFormat,
        qrErrorCorrectionLevel: this.element.qrErrorCorrectionLevel ?? defaults.qrErrorCorrectionLevel
      },
      { emitEvent: false }
    );
  }

  private emitPropertyChanges(): void {
    if (!this.element) {
      return;
    }

    const value = this.form.value;
    
    // Clamp width/height to at least 20px
    let width = typeof value.width === 'number' ? value.width : 20;
    let height = typeof value.height === 'number' ? value.height : 20;
    
    if (width < 20 || height < 20) {
      width = Math.max(20, width);
      height = Math.max(20, height);
      this.form.patchValue({ width, height }, { emitEvent: false });
    }

    const style: LabelElementStyle = {
      ...(this.element.style || {}),
      fontFamily: value.fontFamily,
      fontSize: value.fontSize,
      fontWeight: value.bold ? 'bold' : 'normal',
      fontStyle: value.italic ? 'italic' : 'normal',
      textDecoration: value.underline ? 'underline' : 'none',
      color: value.textColor,
      backgroundColor: value.backgroundColor,
      borderWidth: value.borderWidth,
      borderStyle: value.borderStyle,
      borderColor: value.borderColor,
      borderRadius: value.borderRadius,
      opacity: value.opacity,
      rotation: value.rotation,
      textAlign: value.alignment,
      padding: value.padding,
      margin: value.margin
    };

    this.propertiesChange.emit({
      id: this.element.id,
      width,
      height,
      value: value.value,
      label: value.label,
      prefix: value.prefix,
      rotation: value.rotation,
      ...(this.element.type === 'barcode' ? { barcodeFormat: value.barcodeFormat } : {}),
      ...(this.element.type === 'qr' ? { qrErrorCorrectionLevel: value.qrErrorCorrectionLevel } : {}),
      style
    });
  }
}
