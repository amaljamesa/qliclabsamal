import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabelSidebarComponent } from './label-sidebar/label-sidebar.component';
import { LabelToolbarComponent, LabelElementTypeOption } from './label-toolbar/label-toolbar.component';
import { LabelCanvasComponent } from './label-canvas/label-canvas.component';
import { LabelPropertiesComponent } from './label-properties/label-properties.component';
import { LabelPrintPreviewComponent } from './label-print-preview/label-print-preview.component';
import { LabelImageImportComponent } from './label-image-import/label-image-import.component';
import { LabelExtendedPreviewComponent } from './label-extended-preview/label-extended-preview.component';
import { LabelElement, LabelElementType, LabelField } from '../../models/label-element.model';
import { Label, LabelSettings, LabelDimensions } from '../../models/label.model';
import { LabelProfile } from '../../models/label-profile.model';
import { LabelTemplate } from '../../models/label-template.model';
import { ProfileTemplateService } from '../../services/profile-template.service';
import { LabelService } from '../../services/label.service';
import { MM_TO_PX } from '../../models/label-units';
import { createLabelElement, displayLabelForType, findFreeElementPosition } from '../../models/label-element-factory';

interface EditorSnapshot {
  labelName: string;
  labelSettings: LabelSettings;
  elements: LabelElement[];
}

@Component({
  selector: 'app-label-generator',
  standalone: true,
  imports: [CommonModule, FormsModule, LabelSidebarComponent, LabelToolbarComponent, LabelCanvasComponent, LabelPropertiesComponent, LabelPrintPreviewComponent, LabelImageImportComponent, LabelExtendedPreviewComponent],
  templateUrl: './label-generator.component.html',
  styleUrls: ['./label-generator.component.css']
})
export class LabelGeneratorComponent implements OnInit {
  elementTypes: LabelElementTypeOption[] = [
    { type: 'text', label: 'Text' },
    { type: 'productName', label: 'Product Name' },
    { type: 'companyName', label: 'Company Name' },
    { type: 'brand', label: 'Brand' },
    { type: 'category', label: 'Category' },
    { type: 'mrp', label: 'MRP' },
    { type: 'salePrice', label: 'Sale Price' },
    { type: 'offerPrice', label: 'Offer Price' },
    { type: 'offerYouSave', label: 'You Save' },
    { type: 'offer', label: 'Offer' },
    { type: 'ratePer', label: 'Rate Per' },
    { type: 'fssai', label: 'FSSAI No' },
    { type: 'pkdOn', label: 'Packed On' },
    { type: 'expiryDate', label: 'Expiry Date' },
    { type: 'batch', label: 'Batch No' },
    { type: 'bestBefore', label: 'Best Before' },
    { type: 'line1', label: 'Line 1' },
    { type: 'line2', label: 'Line 2' },
    { type: 'barcode', label: 'Barcode Placeholder' },
    { type: 'qr', label: 'QR Placeholder' },
    { type: 'logo', label: 'Logo Placeholder' },
    { type: 'image', label: 'Image' },
    { type: 'rectangle', label: 'Rectangle' },
    { type: 'line', label: 'Line' }
  ];

  profiles: LabelProfile[] = [];
  templates: LabelTemplate[] = [];
  selectedProfileId = '';
  selectedTemplateId = '';
  savedLabels: Label[] = [];
  selectedSavedLabelId = '';
  saveMessage = '';
  printPreviewLabel?: Label;
  showImageImport = false;
  showExtendedPreview = false;
  private readonly historyLimit = 50;
  private undoStack: EditorSnapshot[] = [];
  private redoStack: EditorSnapshot[] = [];
  private copiedElement?: LabelElement;

  /** A "Barcode Design Field" checkbox is checked exactly when a visible element of
   *  that type exists on the canvas – so it's derived from `elements`, not separate
   *  state that could drift out of sync with what's actually on the label. */
  isFieldEnabled(type: LabelElementType): boolean {
    return this.elements.some(element => element.type === type && element.visible !== false);
  }

  toggleField(type: LabelElementType, enabled: boolean): void {
    this.recordHistory();
    const existing = this.elements.filter(element => element.type === type);

    if (enabled) {
      if (existing.length === 0) {
        const element = createLabelElement(type);
        const position = this.findFreePosition(element.width, element.height);
        element.x = position.x;
        element.y = position.y;
        this.elements = [...this.elements, element];
        this.selectedElementId = element.id;
      } else {
        this.elements = this.elements.map(element =>
          element.type === type ? { ...element, visible: true } : element
        );
      }
    } else {
      this.elements = this.elements.map(element =>
        element.type === type ? { ...element, visible: false } : element
      );
      if (existing.some(element => element.id === this.selectedElementId)) {
        this.selectedElementId = '';
      }
    }
  }

  selectedElementId = '';
  labelName = 'New Label';
  labelSettings: LabelSettings = this.defaultLabelSettings();
  elements: LabelElement[] = [
    {
      id: 'element-barcode',
      type: 'barcode',
      label: 'Barcode Placeholder',
      value: '123456789012',
      barcodeFormat: 'CODE128',
      width: 180,
      height: 60,
      x: 10,
      y: 10,
      visible: true,
      style: {
        borderColor: '#94a3b8',
        backgroundColor: '#ffffff',
        color: '#0f172a'
      }
    },
    {
      id: 'element-product',
      type: 'productName',
      label: 'Product Name',
      width: 180,
      height: 30,
      x: 10,
      y: 90,
      visible: true,
      style: {
        fontSize: 14,
        fontWeight: 'bold'
      }
    }
  ];

  constructor(
    private profileTemplateService: ProfileTemplateService,
    private labelService: LabelService
  ) {}

  ngOnInit(): void {
    this.profiles = this.profileTemplateService.getProfiles();
    this.templates = this.profileTemplateService.getTemplates();
    this.savedLabels = this.labelService.getLabels();

    const defaultProfile = this.profiles.find(profile => profile.default) || this.profiles[0];
    if (defaultProfile) {
      this.loadProfile(defaultProfile.id);
    }
  }

  addElement(type: LabelElementType): void {
    this.recordHistory();
    const element = createLabelElement(type);
    const position = this.findFreePosition(element.width, element.height);
    element.x = position.x;
    element.y = position.y;
    this.elements = [...this.elements, element];
    this.selectedElementId = element.id;
  }

  private findFreePosition(width: number, height: number): { x: number; y: number } {
    return findFreeElementPosition(
      this.elements,
      width,
      height,
      this.labelSettings.dimensions.width * MM_TO_PX,
      this.labelSettings.dimensions.height * MM_TO_PX
    );
  }

  /** Snapshot of the selected element's size/fontSize at the moment a resize gesture
   *  starts, so every frame's fontSize can be computed fresh from this fixed baseline
   *  instead of compounding off the previous (already-rounded) frame – re-deriving from
   *  a rounded value every frame made the size get stuck instead of tracking the drag. */
  private resizeBaseline: { id: string; width: number; height: number; fontSize: number } | null = null;

  /** Called once per drag/resize/rotate gesture (or keypress), before the first live
   *  update is applied, so undo captures one checkpoint per gesture instead of one per frame. */
  beginInteraction(): void {
    this.recordHistory();
    const current = this.elements.find(item => item.id === this.selectedElementId);
    this.resizeBaseline = current
      ? { id: current.id, width: current.width, height: current.height, fontSize: current.style?.fontSize ?? 13 }
      : null;
  }

  updateElementPosition(position: { id: string; x: number; y: number }): void {
    this.elements = this.elements.map(item =>
      item.id === position.id ? { ...item, x: position.x, y: position.y } : item
    );
  }

  resizeElement(event: { id: string; width: number; height: number }): void {
    this.elements = this.elements.map(item => {
      if (item.id !== event.id) return item;
      const updated: LabelElement = { ...item, width: event.width, height: event.height };
      // Barcode text is rendered at a fixed size by the barcode library, so scaling
      // fontSize wouldn't do anything visible there; every other type keeps its text
      // proportional to the box as it's dragged bigger/smaller.
      const baseline = this.resizeBaseline?.id === item.id ? this.resizeBaseline : null;
      if (item.type !== 'barcode' && baseline && baseline.width > 0 && baseline.height > 0) {
        const scale = Math.sqrt((event.width / baseline.width) * (event.height / baseline.height));
        updated.style = { ...item.style, fontSize: Math.max(6, Math.round(baseline.fontSize * scale)) };
      }
      return updated;
    });
  }

  handlePropertyChange(update: Partial<LabelElement> & { id: string }): void {
    this.recordHistory();
    this.elements = this.elements.map(item =>
      item.id === update.id
        ? {
            ...item,
            ...(update.width !== undefined ? { width: update.width } : {}),
            ...(update.height !== undefined ? { height: update.height } : {}),
            ...(update.rotation !== undefined ? { rotation: update.rotation } : {}),
            ...(update.value !== undefined ? { value: update.value } : {}),
            ...(update.label !== undefined ? { label: update.label } : {}),
            ...(update.prefix !== undefined ? { prefix: update.prefix } : {}),
            ...(update.barcodeFormat !== undefined ? { barcodeFormat: update.barcodeFormat } : {}),
            ...(update.qrErrorCorrectionLevel !== undefined ? { qrErrorCorrectionLevel: update.qrErrorCorrectionLevel } : {}),
            ...(update.style ? { style: update.style } : {})
          }
        : item
    );
  }

  selectElement(id: string): void {
    this.selectedElementId = id;
  }

  get selectedElement(): LabelElement | undefined {
    return this.elements.find(item => item.id === this.selectedElementId);
  }

  updateElementRotation(event: { id: string; rotation: number }): void {
    this.elements = this.elements.map(item =>
      item.id === event.id
        ? { ...item, rotation: event.rotation }
        : item
    );
  }

  updateElementImage(event: { id: string; imageSrc: string }): void {
    this.recordHistory();
    this.elements = this.elements.map(item =>
      item.id === event.id ? { ...item, imageSrc: event.imageSrc } : item
    );
  }

  deleteElement(elementId: string): void {
    this.recordHistory();
    this.elements = this.elements.filter(item => item.id !== elementId);
    if (this.selectedElementId === elementId) {
      this.selectedElementId = '';
    }
  }

  duplicateElement(elementId: string): void {
    const element = this.elements.find(item => item.id === elementId);
    if (!element) {
      return;
    }

    this.recordHistory();
    const duplicate = {
      ...element,
      id: `${element.id}-copy-${Date.now()}`,
      x: element.x + 20,
      y: element.y + 20,
      locked: false
    };

    this.elements = [...this.elements, duplicate];
    this.selectedElementId = duplicate.id;
  }

  bringForward(elementId: string): void {
    this.recordHistory();
    this.elements = this.moveElementInStack(elementId, 1);
  }

  sendBackward(elementId: string): void {
    this.recordHistory();
    this.elements = this.moveElementInStack(elementId, -1);
  }

  toggleLock(elementId: string): void {
    this.recordHistory();
    this.elements = this.elements.map(item =>
      item.id === elementId ? { ...item, locked: !item.locked } : item
    );
  }

  createProfile(): void {
    const name = window.prompt('New profile name', `Profile ${this.profiles.length + 1}`);
    if (!name) {
      return;
    }
    const profile = this.profileTemplateService.createProfile(name, this.buildCurrentLabel());
    this.profiles = this.profileTemplateService.getProfiles();
    this.selectedProfileId = profile.id;
    this.selectedTemplateId = '';
  }

  renameProfile(profileId: string): void {
    const profile = this.profiles.find(item => item.id === profileId);
    if (!profile) {
      return;
    }
    const name = window.prompt('Rename profile', profile.name);
    if (!name) {
      return;
    }
    this.profileTemplateService.renameProfile(profileId, name);
    this.profiles = this.profileTemplateService.getProfiles();
  }

  deleteProfile(profileId: string): void {
    this.profileTemplateService.deleteProfile(profileId);
    this.profiles = this.profileTemplateService.getProfiles();
    if (this.selectedProfileId === profileId) {
      const defaultProfile = this.profiles.find(profile => profile.default) || this.profiles[0];
      if (defaultProfile) {
        this.loadProfile(defaultProfile.id);
      }
    }
  }

  setDefaultProfile(profileId: string): void {
    this.profileTemplateService.setDefaultProfile(profileId);
    this.profiles = this.profileTemplateService.getProfiles();
    this.selectedProfileId = profileId;
  }

  selectProfile(profileId: string): void {
    this.loadProfile(profileId);
  }

  saveLayout(): void {
    const existing = this.selectedSavedLabelId
      ? this.labelService.loadLabel(this.selectedSavedLabelId)
      : undefined;
    const label: Label = {
      ...this.buildCurrentLabel(),
      id: existing?.id ?? `label-${Date.now()}`,
      metadata: existing?.metadata ?? {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
    const saved = this.labelService.saveLabel(label);
    this.selectedSavedLabelId = saved.id;
    this.savedLabels = this.labelService.getLabels();
    this.saveMessage = `Saved "${saved.name}".`;
  }

  loadSavedLayout(labelId: string): void {
    const label = this.labelService.loadLabel(labelId);
    if (!label) {
      return;
    }
    this.applyLabel(label);
    this.selectedSavedLabelId = label.id;
    this.selectedProfileId = '';
    this.selectedTemplateId = '';
    this.saveMessage = `Loaded "${label.name}".`;
  }

  deleteSavedLayout(labelId: string): void {
    if (!this.labelService.deleteLabel(labelId)) {
      return;
    }
    if (this.selectedSavedLabelId === labelId) {
      this.selectedSavedLabelId = '';
    }
    this.savedLabels = this.labelService.getLabels();
    this.saveMessage = 'Saved layout deleted.';
  }

  openPrintPreview(): void {
    // The editor canvas stays mounted behind the preview modal, and the selected
    // element renders at z-index 9999 (to keep its resize handles reachable above
    // other elements) with no stacking context in between to contain it – so its
    // selection outline/handles would otherwise show through on top of the preview.
    this.selectedElementId = '';
    this.printPreviewLabel = this.buildCurrentLabel();
  }

  closePrintPreview(): void {
    this.printPreviewLabel = undefined;
  }

  openExtendedPreview(): void {
    this.selectedElementId = '';
    this.showExtendedPreview = true;
  }

  closeExtendedPreview(): void {
    this.showExtendedPreview = false;
  }

  applyExtendedPreview(elements: LabelElement[]): void {
    this.recordHistory();
    this.elements = elements;
    this.showExtendedPreview = false;
    this.saveMessage = 'Preview changes applied. Save Layout to persist them.';
  }

  openImageImport(): void {
    this.showImageImport = true;
  }

  closeImageImport(): void {
    this.showImageImport = false;
  }

  applyImageImport(result: { elements: LabelElement[]; dimensions: LabelDimensions }): void {
    this.recordHistory();
    this.labelSettings = { ...this.labelSettings, dimensions: result.dimensions };
    this.lastDimensions = { ...result.dimensions };
    this.elements = result.elements;
    this.selectedElementId = '';
    this.showImageImport = false;
    this.saveMessage = `Generated ${result.elements.length} field${result.elements.length === 1 ? '' : 's'} from the uploaded image.`;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(this.createSnapshot());
    this.restoreSnapshot(previous);
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.createSnapshot());
    this.restoreSnapshot(next);
  }

  copySelectedElement(): void {
    if (!this.selectedElement) return;
    this.copiedElement = this.clone(this.selectedElement);
  }

  pasteElement(): void {
    if (!this.copiedElement) return;
    this.recordHistory();
    const copy: LabelElement = {
      ...this.clone(this.copiedElement),
      id: `element-${this.copiedElement.type}-${Date.now()}`,
      x: this.copiedElement.x + 20,
      y: this.copiedElement.y + 20,
      locked: false
    };
    this.elements = [...this.elements, copy];
    this.selectedElementId = copy.id;
  }

  onSettingsFocus(): void { this.recordHistory(); }

  /** Tracks the label's own last known-good width/height (mm), separate from
   *  labelSettings.dimensions, so onDimensionsChange always scales relative to the previous
   *  step rather than a fixed baseline – each keystroke's factor composes correctly into the
   *  overall before/after ratio no matter how many intermediate values a typed edit passes
   *  through (including a transiently empty/zero field), instead of compounding drift. */
  private lastDimensions: LabelDimensions = { ...this.labelSettings.dimensions };

  /** Rescales every element's position/size (and font size) in proportion to how the label's
   *  width/height just changed, so elements keep their relative layout instead of being
   *  clipped or stranded off-canvas when the label shrinks. Scaling (vs. clamping to the new
   *  bounds) is what makes this safe against transient invalid values mid-edit: a bogus
   *  factor is simply skipped rather than permanently shrinking elements to fit it. */
  onDimensionsChange(): void {
    const dimensions = this.labelSettings.dimensions;
    this.labelSettings.dimensions = { ...dimensions };

    const scaleX = this.dimensionScale(dimensions.width, this.lastDimensions.width);
    const scaleY = this.dimensionScale(dimensions.height, this.lastDimensions.height);

    if (scaleX !== 1 || scaleY !== 1) {
      const fontScale = Math.sqrt(scaleX * scaleY);
      this.elements = this.elements.map(element => ({
        ...element,
        x: element.x * scaleX,
        y: element.y * scaleY,
        width: element.width * scaleX,
        height: element.height * scaleY,
        style: element.type !== 'barcode' && element.style?.fontSize
          ? { ...element.style, fontSize: Math.max(6, Math.round(element.style.fontSize * fontScale)) }
          : element.style
      }));
    }

    if (this.isPositiveFinite(dimensions.width)) this.lastDimensions.width = dimensions.width;
    if (this.isPositiveFinite(dimensions.height)) this.lastDimensions.height = dimensions.height;
  }

  private dimensionScale(next: number, previous: number): number {
    return this.isPositiveFinite(next) && this.isPositiveFinite(previous) ? next / previous : 1;
  }

  private isPositiveFinite(value: number): boolean {
    return Number.isFinite(value) && value > 0;
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const editingText = target?.matches('input, textarea, select, [contenteditable="true"]');
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (modifier && key === 'z') { event.preventDefault(); event.shiftKey ? this.redo() : this.undo(); return; }
    if (modifier && key === 'y') { event.preventDefault(); this.redo(); return; }
    if (modifier && key === 'c' && !editingText) { event.preventDefault(); this.copySelectedElement(); return; }
    if (modifier && key === 'v' && !editingText) { event.preventDefault(); this.pasteElement(); return; }
    if ((event.key === 'Delete' || event.key === 'Backspace') && !editingText && this.selectedElementId) {
      event.preventDefault();
      this.deleteElement(this.selectedElementId);
    }
  }

  createTemplate(): void {
    const name = window.prompt('Template name', `Template ${this.templates.length + 1}`);
    if (!name) {
      return;
    }
    const description = window.prompt('Template description', 'Custom template') || '';
    const template = this.profileTemplateService.createTemplate(name, description, this.buildCurrentLabel());
    this.templates = this.profileTemplateService.getTemplates();
    this.selectedTemplateId = template.id;
  }

  duplicateTemplate(templateId: string): void {
    const template = this.profileTemplateService.duplicateTemplate(templateId);
    if (!template) {
      return;
    }
    this.templates = this.profileTemplateService.getTemplates();
    this.selectedTemplateId = template.id;
  }

  loadTemplate(templateId: string): void {
    const template = this.profileTemplateService.loadTemplate(templateId);
    if (!template) {
      return;
    }
    this.selectedTemplateId = templateId;
    this.selectedProfileId = '';
    this.selectedSavedLabelId = '';
    this.applyTemplate(template);
  }

  saveTemplate(): void {
    const label = this.buildCurrentLabel();
    if (this.selectedTemplateId) {
      const template = this.templates.find(item => item.id === this.selectedTemplateId);
      if (!template) {
        return;
      }
      const updated: LabelTemplate = {
        ...template,
        defaultSettings: label.settings,
        elements: label.elements.map(item => ({ ...item })),
        fields: label.fields
      };
      this.profileTemplateService.saveTemplate(updated);
    } else {
      const name = window.prompt('Save current template as', `Custom Template ${this.templates.length + 1}`);
      if (!name) {
        return;
      }
      const description = window.prompt('Template description', 'Saved template') || '';
      const template = this.profileTemplateService.createTemplate(name, description, label);
      this.selectedTemplateId = template.id;
    }
    this.templates = this.profileTemplateService.getTemplates();
  }

  selectTemplate(templateId: string): void {
    this.selectedTemplateId = templateId;
  }

  private loadProfile(profileId: string): void {
    const profile = this.profiles.find(item => item.id === profileId);
    if (!profile) {
      return;
    }
    this.selectedProfileId = profileId;
    this.selectedTemplateId = '';
    this.selectedSavedLabelId = '';
    this.applyLabel(profile.label);
  }

  private applyLabel(label: Label): void {
    this.labelName = label.name;
    this.labelSettings = { ...label.settings };
    this.lastDimensions = { ...label.settings.dimensions };
    this.elements = label.elements.map(element => ({ ...element }));
    this.selectedElementId = '';
  }

  private applyTemplate(template: LabelTemplate): void {
    this.labelName = template.name;
    this.labelSettings = { ...template.defaultSettings };
    this.lastDimensions = { ...template.defaultSettings.dimensions };
    this.elements = template.elements.map(element => ({ ...element }));
    this.selectedElementId = '';
  }

  private buildCurrentLabel(): Label {
    return {
      id: `label-${Date.now()}`,
      name: this.labelName,
      settings: { ...this.labelSettings },
      elements: this.elements.map(item => ({ ...item })),
      fields: this.buildFields(),
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
  }

  private buildFields(): LabelField[] {
    const seen = new Set<string>();
    const fields: LabelField[] = [];

    for (const element of this.elements) {
      if (!seen.has(element.type)) {
        seen.add(element.type);
        fields.push({
          id: `field-${element.type}-${element.id}`,
          name: element.type,
          label: displayLabelForType(element.type),
          enabled: true
        });
      }
    }

    return fields;
  }

  private moveElementInStack(elementId: string, direction: 1 | -1): LabelElement[] {
    const index = this.elements.findIndex(item => item.id === elementId);
    if (index === -1) {
      return this.elements;
    }

    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= this.elements.length) {
      return this.elements;
    }

    const next = [...this.elements];
    const [element] = next.splice(index, 1);
    next.splice(nextIndex, 0, element);
    return next;
  }

  private recordHistory(): void {
    this.undoStack.push(this.createSnapshot());
    if (this.undoStack.length > this.historyLimit) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  private createSnapshot(): EditorSnapshot {
    return this.clone({
      labelName: this.labelName,
      labelSettings: this.labelSettings,
      elements: this.elements
    });
  }

  private restoreSnapshot(snapshot: EditorSnapshot): void {
    this.labelName = snapshot.labelName;
    this.labelSettings = this.clone(snapshot.labelSettings);
    this.lastDimensions = { ...this.labelSettings.dimensions };
    this.elements = this.clone(snapshot.elements);
    this.selectedElementId = '';
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private defaultLabelSettings(): LabelSettings {
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