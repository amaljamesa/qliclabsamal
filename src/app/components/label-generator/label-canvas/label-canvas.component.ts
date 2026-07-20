import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, DoCheck, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabelCanvasItemComponent } from './label-canvas-item.component';
import { LabelElement } from '../../../models/label-element.model';
import { LabelDimensions, PageMargins } from '../../../models/label.model';
import { SnapGuide } from '../../../engine/snap-engine';
import { MM_TO_PX } from '../../../models/label-units';

@Component({
  selector: 'app-label-canvas',
  standalone: true,
  imports: [CommonModule, FormsModule, LabelCanvasItemComponent],
  templateUrl: './label-canvas.component.html',
  styleUrls: ['./label-canvas.component.css']
})
export class LabelCanvasComponent implements AfterViewInit, OnDestroy, DoCheck {
  @ViewChild('canvasArea', { static: true }) canvasArea!: ElementRef<HTMLDivElement>;

  @Input() elements: LabelElement[] = [];
  @Input() selectedElementId = '';
  @Input() dimensions: LabelDimensions = { width: 50, height: 40, horizontalGap: 0, verticalGap: 0 };
  @Input() margins: PageMargins = { left: 0, right: 0, top: 0, bottom: 0 };
  @Input() showGrid = false;
  @Input() showRulers = false;
  /** When set, overrides the user-adjustable zoom with a fixed value (e.g. the true-size
   *  popup locks this to the CSS px-per-mm ratio so the canvas renders at real physical
   *  size) and hides the zoom controls' effect on it. */
  @Input() lockedZoomLevel?: number;
  /** Hides the header (title/grid/ruler toggles/zoom controls) and the bottom hint bar,
   *  for embedding the canvas inside another dialog that provides its own chrome. */
  @Input() chromeless = false;
  @Output() positionChange = new EventEmitter<{ id: string; x: number; y: number }>();
  @Output() resizeChange = new EventEmitter<{ id: string; width: number; height: number }>();
  @Output() selectElement = new EventEmitter<string>();
  @Output() zoomChange = new EventEmitter<number>();
  @Output() elementRotation = new EventEmitter<{ id: string; rotation: number }>();
  @Output() imageUpload = new EventEmitter<{ id: string; imageSrc: string }>();
  @Output() interactionStart = new EventEmitter<void>();

  readonly baseScale = MM_TO_PX; // 1mm = 4px at 1x zoom
  zoomLevel = 1;
  canvasRect = { width: 200, height: 160 };
  activeGuides: SnapGuide[] = [];

  private resizeObserver?: ResizeObserver;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastZoom = 1;

  get effectiveScale(): number {
    return this.baseScale * this.zoomLevel;
  }

  get canvasStyle(): Record<string, string> {
    const w = this.dimensions.width * this.effectiveScale;
    const h = this.dimensions.height * this.effectiveScale;
    return {
      width: `${w}px`,
      height: `${h}px`,
      background: '#ffffff',
      boxShadow: '0 2px 8px rgba(0,0,0,0.10), 0 8px 32px rgba(0,0,0,0.06)',
      borderRadius: '2px'
    };
  }

  get actualSizeLabel(): string {
    return `${this.dimensions.width}mm × ${this.dimensions.height}mm`;
  }

  get zoomPercent(): number {
    return Math.round(this.zoomLevel * 100);
  }

  get marginStyle(): Record<string, string> {
    const s = this.effectiveScale;
    return {
      left: `${this.margins.left * s}px`,
      right: `${this.margins.right * s}px`,
      top: `${this.margins.top * s}px`,
      bottom: `${this.margins.bottom * s}px`
    };
  }

  get hasMargins(): boolean {
    return this.margins.left > 0 || this.margins.right > 0 || this.margins.top > 0 || this.margins.bottom > 0;
  }

  get rulerMarksHorizontal(): { position: number; label: string }[] {
    const marks: { position: number; label: string }[] = [];
    const step = 10 * this.effectiveScale;
    const w = this.dimensions.width * this.effectiveScale;
    for (let px = 0; px <= w; px += step) {
      const mm = Math.round(px / this.effectiveScale);
      marks.push({ position: px, label: `${mm}` });
    }
    return marks;
  }

  get rulerMarksVertical(): { position: number; label: string }[] {
    const marks: { position: number; label: string }[] = [];
    const step = 10 * this.effectiveScale;
    const h = this.dimensions.height * this.effectiveScale;
    for (let px = 0; px <= h; px += step) {
      const mm = Math.round(px / this.effectiveScale);
      marks.push({ position: px, label: `${mm}` });
    }
    return marks;
  }

  get gridLines(): { horizontal: number[]; vertical: number[] } {
    const step = 10 * this.effectiveScale;
    const w = this.dimensions.width * this.effectiveScale;
    const h = this.dimensions.height * this.effectiveScale;
    const hLines: number[] = [];
    const vLines: number[] = [];
    for (let x = step; x < w; x += step) vLines.push(x);
    for (let y = step; y < h; y += step) hLines.push(y);
    return { horizontal: hLines, vertical: vLines };
  }

  /** Generate style for a snap guide line. guide.position is in the same logical
   *  (zoom-independent) space as element.x/y, so scale it up to match the canvas's
   *  actual on-screen (zoomed) size, same as element rendering does. */
  guideStyle(guide: SnapGuide): Record<string, string> {
    const position = guide.position * this.zoomLevel;
    if (guide.orientation === 'horizontal') {
      return {
        top: `${position}px`,
        left: '0',
        right: '0',
        height: '0'
      };
    }
    return {
      left: `${position}px`,
      top: '0',
      bottom: '0',
      width: '0'
    };
  }

  ngAfterViewInit(): void {
    if (this.lockedZoomLevel !== undefined) {
      this.zoomLevel = this.lockedZoomLevel;
    }
    this.updateCanvasSize();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  ngDoCheck(): void {
    if (this.lockedZoomLevel !== undefined && this.zoomLevel !== this.lockedZoomLevel) {
      this.zoomLevel = this.lockedZoomLevel;
    }
    const dims = this.dimensions;
    if (dims.width !== this.lastWidth || dims.height !== this.lastHeight || this.zoomLevel !== this.lastZoom) {
      this.lastWidth = dims.width;
      this.lastHeight = dims.height;
      this.lastZoom = this.zoomLevel;
      this.updateCanvasSize();
    }
  }

  /** Deselect on pointerdown (not click) targeting empty canvas. This mirrors how element
   *  selection is decided at pointerdown time in DesignerElementDirective – an element's
   *  own pointerdown handler stops propagation before this can fire. Deciding at pointerdown
   *  time (rather than on the trailing click) means the *end* of a drag/resize gesture never
   *  affects selection, even if canvas-bounds clamping leaves the cursor drifted off the
   *  element by the time the pointer is released. */
  onCanvasPointerDown(): void {
    this.selectElement.emit('');
    this.activeGuides = [];
  }

  onSelectElement(elementId: string): void {
    this.selectElement.emit(elementId);
  }

  onPositionChange(event: { id: string; x: number; y: number }): void {
    this.positionChange.emit(event);
  }

  onResize(event: { id: string; width: number; height: number; left: number; top: number }): void {
    // Emit both resize and position update
    this.resizeChange.emit({ id: event.id, width: event.width, height: event.height });
    this.positionChange.emit({ id: event.id, x: event.left, y: event.top });
  }

  onRotationChange(event: { id: string; rotation: number }): void {
    this.elementRotation.emit(event);
  }

  onDragGuides(guides: SnapGuide[]): void {
    this.activeGuides = guides;
  }

  onImageUpload(event: { id: string; imageSrc: string }): void {
    this.imageUpload.emit(event);
  }

  onInteractionStart(): void {
    this.interactionStart.emit();
  }

  trackByElementId(index: number, element: LabelElement): string {
    return element.id;
  }

  zoomIn(): void {
    if (this.lockedZoomLevel !== undefined) return;
    this.zoomLevel = Math.min(3, +(this.zoomLevel + 0.25).toFixed(2));
    this.zoomChange.emit(this.zoomLevel);
  }

  zoomOut(): void {
    if (this.lockedZoomLevel !== undefined) return;
    this.zoomLevel = Math.max(0.25, +(this.zoomLevel - 0.25).toFixed(2));
    this.zoomChange.emit(this.zoomLevel);
  }

  zoomReset(): void {
    if (this.lockedZoomLevel !== undefined) return;
    this.zoomLevel = 1;
    this.zoomChange.emit(this.zoomLevel);
  }

  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent): void {
    if (this.lockedZoomLevel !== undefined) return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.1 : 0.1;
      this.zoomLevel = Math.min(3, Math.max(0.25, +(this.zoomLevel + delta).toFixed(2)));
      this.zoomChange.emit(this.zoomLevel);
    }
  }

  /** canvasRect is the LOGICAL (zoom-independent) canvas size, in the same "1mm = 4px"
   *  coordinate space that element.x/y/width/height are stored in — it's what the
   *  designer directive clamps drags/resizes against. The VISUAL on-screen size (which
   *  does grow with zoom) is computed separately by canvasStyle via effectiveScale;
   *  elements are then scaled up to match at render time so they zoom in proportion
   *  with the canvas instead of staying pinned to their un-zoomed pixel size. */
  private updateCanvasSize(): void {
    this.canvasRect = {
      width: Math.max(80, this.dimensions.width * this.baseScale),
      height: Math.max(80, this.dimensions.height * this.baseScale)
    };
  }
}