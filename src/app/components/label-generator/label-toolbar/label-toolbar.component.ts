import { Component, EventEmitter, Input, Output } from '@angular/core';

import { LabelElementType } from '../../../models/label-element.model';

export interface LabelElementTypeOption {
  type: LabelElementType;
  label: string;
}

@Component({
  selector: 'app-label-toolbar',
  standalone: true,
  imports: [],
  templateUrl: './label-toolbar.component.html',
  styleUrls: ['./label-toolbar.component.css']
})
export class LabelToolbarComponent {
  @Input() elementTypes: LabelElementTypeOption[] = [];
  @Output() addElement = new EventEmitter<LabelElementType>();
  @Output() saveLayout = new EventEmitter<void>();
  @Output() previewPrint = new EventEmitter<void>();
  @Output() extendedPreview = new EventEmitter<void>();
  @Output() importImage = new EventEmitter<void>();
  @Input() canUndo = false;
  @Input() canRedo = false;
  @Output() undo = new EventEmitter<void>();
  @Output() redo = new EventEmitter<void>();

  onAddElement(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const type = select.value as LabelElementType;
    if (type) {
      this.addElement.emit(type);
    }
  }

  onSaveLayout(): void {
    this.saveLayout.emit();
  }

  onPreviewPrint(): void {
    this.previewPrint.emit();
  }

  onExtendedPreview(): void {
    this.extendedPreview.emit();
  }

  onImportImage(): void {
    this.importImage.emit();
  }

  onUndo(): void { this.undo.emit(); }
  onRedo(): void { this.redo.emit(); }
}
