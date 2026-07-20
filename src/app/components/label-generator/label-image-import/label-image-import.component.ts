import { Component, EventEmitter, OnDestroy, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DetectedField, LabelImageImportService } from '../../../services/label-image-import.service';
import { LabelElement } from '../../../models/label-element.model';
import { LabelDimensions } from '../../../models/label.model';

@Component({
  selector: 'app-label-image-import',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './label-image-import.component.html',
  styleUrls: ['./label-image-import.component.css']
})
export class LabelImageImportComponent implements OnDestroy {
  @Output() close = new EventEmitter<void>();
  @Output() apply = new EventEmitter<{ elements: LabelElement[]; dimensions: LabelDimensions }>();

  targetWidth = 50;
  targetHeight = 40;
  previewUrl = '';
  status: 'idle' | 'analyzing' | 'done' | 'error' = 'idle';
  progress = 0;
  errorMessage = '';
  fields: DetectedField[] = [];

  private selectedFile?: File;
  private imageWidth = 0;
  private imageHeight = 0;

  constructor(private importService: LabelImageImportService) {}

  ngOnDestroy(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
    }
  }

  get includedCount(): number {
    return this.fields.filter(field => field.include).length;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
    }

    this.selectedFile = file;
    this.previewUrl = URL.createObjectURL(file);
    this.fields = [];
    this.status = 'idle';
    this.errorMessage = '';
    input.value = '';
  }

  async analyze(): Promise<void> {
    if (!this.selectedFile) {
      return;
    }

    this.status = 'analyzing';
    this.progress = 0;
    this.errorMessage = '';

    try {
      const result = await this.importService.analyzeImage(this.selectedFile, percent => (this.progress = percent));
      this.imageWidth = result.imageWidth;
      this.imageHeight = result.imageHeight;
      this.fields = result.fields;

      if (!this.fields.length) {
        this.status = 'error';
        this.errorMessage = 'No readable text was found in this image. Try a clearer, higher-resolution photo.';
        return;
      }

      const suggested = this.importService.suggestSizeMm(result.imageWidth, result.imageHeight);
      this.targetWidth = suggested.width;
      this.targetHeight = suggested.height;
      this.status = 'done';
    } catch {
      this.status = 'error';
      this.errorMessage = 'Something went wrong reading this image. Please try again.';
    }
  }

  toggleField(field: DetectedField): void {
    field.include = !field.include;
  }

  onApply(): void {
    const elements = this.importService.toElements(this.fields, this.imageWidth, this.imageHeight, {
      width: this.targetWidth,
      height: this.targetHeight
    });

    this.apply.emit({
      elements,
      dimensions: { width: this.targetWidth, height: this.targetHeight, horizontalGap: 0, verticalGap: 0 }
    });
  }

  onClose(): void {
    this.close.emit();
  }
}
