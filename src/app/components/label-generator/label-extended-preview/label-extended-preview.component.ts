import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabelCanvasComponent } from '../label-canvas/label-canvas.component';
import { LabelElement, LabelElementType } from '../../../models/label-element.model';
import { LabelDimensions, PageMargins } from '../../../models/label.model';
import { MM_TO_PX } from '../../../models/label-units';
import {
  BARCODE_DESIGN_FIELD_TYPES,
  createLabelElement,
  displayLabelForType,
  fieldSupportsFontSize as typeSupportsFontSize,
  findFreeElementPosition
} from '../../../models/label-element-factory';

const DEFAULT_FONT_SIZE = 13;

/** CSS defines 1in = 96px and 1in = 25.4mm; used to lock the embedded canvas's zoom
 *  so it renders at the label's true physical size on screen instead of an arbitrary
 *  zoom level – what you arrange here is what prints, with nothing to re-scale later. */
const CSS_PX_PER_MM = 96 / 25.4;

@Component({
  selector: 'app-label-extended-preview',
  standalone: true,
  imports: [CommonModule, FormsModule, LabelCanvasComponent],
  templateUrl: './label-extended-preview.component.html',
  styleUrls: ['./label-extended-preview.component.css']
})
export class LabelExtendedPreviewComponent implements OnChanges {
  @Input({ required: true }) elements: LabelElement[] = [];
  @Input({ required: true }) dimensions: LabelDimensions = { width: 50, height: 40, horizontalGap: 0, verticalGap: 0 };
  @Input() margins: PageMargins = { left: 0, right: 0, top: 0, bottom: 0 };
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<LabelElement[]>();

  readonly trueSizeZoom = CSS_PX_PER_MM / MM_TO_PX;
  readonly fieldTypes = BARCODE_DESIGN_FIELD_TYPES;

  draftElements: LabelElement[] = [];
  selectedElementId = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['elements']) {
      this.draftElements = this.elements.map(element => ({ ...element }));
    }
  }

  get actualSizeLabel(): string {
    return `${this.dimensions.width}mm × ${this.dimensions.height}mm`;
  }

  selectElement(id: string): void {
    this.selectedElementId = id;
  }

  fieldLabel(type: LabelElementType): string {
    return displayLabelForType(type);
  }

  fieldSupportsFontSize(type: LabelElementType): boolean {
    return typeSupportsFontSize(type);
  }

  /** A field row is checked exactly when a visible element of that type exists in the
   *  draft – mirrors the main "Barcode Design Fields" panel so the two never disagree. */
  isFieldEnabled(type: LabelElementType): boolean {
    return this.draftElements.some(element => element.type === type && element.visible !== false);
  }

  toggleField(type: LabelElementType, enabled: boolean): void {
    const existing = this.draftElements.filter(element => element.type === type);

    if (enabled) {
      if (existing.length === 0) {
        const element = createLabelElement(type);
        const position = findFreeElementPosition(
          this.draftElements,
          element.width,
          element.height,
          this.dimensions.width * MM_TO_PX,
          this.dimensions.height * MM_TO_PX
        );
        element.x = position.x;
        element.y = position.y;
        this.draftElements = [...this.draftElements, element];
        this.selectedElementId = element.id;
      } else {
        this.draftElements = this.draftElements.map(element =>
          element.type === type ? { ...element, visible: true } : element
        );
        this.selectedElementId = existing[0].id;
      }
    } else {
      this.draftElements = this.draftElements.map(element =>
        element.type === type ? { ...element, visible: false } : element
      );
      if (existing.some(element => element.id === this.selectedElementId)) {
        this.selectedElementId = '';
      }
    }
  }

  /** Font size of the first element of this type, for populating the sidebar's number
   *  input – a direct numeric control is much easier to use than trying to drag-resize
   *  text at the label's true (often very small) physical size. */
  fieldFontSize(type: LabelElementType): number {
    const element = this.draftElements.find(item => item.type === type);
    return element?.style?.fontSize ?? DEFAULT_FONT_SIZE;
  }

  setFieldFontSize(type: LabelElementType, value: number): void {
    if (!value || value < 1) return;
    this.draftElements = this.draftElements.map(element =>
      element.type === type ? { ...element, style: { ...element.style, fontSize: value } } : element
    );
  }

  updatePosition(event: { id: string; x: number; y: number }): void {
    this.draftElements = this.draftElements.map(item =>
      item.id === event.id ? { ...item, x: event.x, y: event.y } : item
    );
  }

  resizeElement(event: { id: string; width: number; height: number }): void {
    this.draftElements = this.draftElements.map(item =>
      item.id === event.id ? { ...item, width: event.width, height: event.height } : item
    );
  }

  rotateElement(event: { id: string; rotation: number }): void {
    this.draftElements = this.draftElements.map(item =>
      item.id === event.id ? { ...item, rotation: event.rotation } : item
    );
  }

  uploadImage(event: { id: string; imageSrc: string }): void {
    this.draftElements = this.draftElements.map(item =>
      item.id === event.id ? { ...item, imageSrc: event.imageSrc } : item
    );
  }

  saveChanges(): void {
    this.save.emit(this.draftElements);
  }

  cancel(): void {
    this.close.emit();
  }
}
