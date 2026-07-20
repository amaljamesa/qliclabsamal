import { Directive, ElementRef, EventEmitter, HostListener, Input, NgZone, OnDestroy, OnInit, OnChanges, SimpleChanges, Output } from '@angular/core';
import { LabelElement } from '../models/label-element.model';
import { InteractionStateService, ResizeDirection } from '../engine/interaction-state.service';
import { computeResize, Bounds } from '../engine/geometry';
import { computeSnap, SnapGuide, snapRotation } from '../engine/snap-engine';
import { computeRotation } from '../engine/rotate-handler';

export type { SnapGuide, ResizeDirection };

/** A unique counter to generate interaction IDs */
let interactionCounter = 0;

interface HandleConfig {
  direction: ResizeDirection;
  cursor: string;
  position: Record<string, string>;
}

const HANDLE_CONFIGS: HandleConfig[] = [
  { direction: 'nw', cursor: 'nwse-resize', position: { top: '-6px', left: '-6px', width: '12px', height: '12px' } },
  { direction: 'n', cursor: 'ns-resize', position: { top: '-6px', left: '50%', transform: 'translateX(-50%)', width: '12px', height: '12px' } },
  { direction: 'ne', cursor: 'nesw-resize', position: { top: '-6px', right: '-6px', width: '12px', height: '12px' } },
  { direction: 'e', cursor: 'ew-resize', position: { right: '-6px', top: '50%', transform: 'translateY(-50%)', width: '12px', height: '12px' } },
  { direction: 'se', cursor: 'nwse-resize', position: { bottom: '-6px', right: '-6px', width: '12px', height: '12px' } },
  { direction: 's', cursor: 'ns-resize', position: { bottom: '-6px', left: '50%', transform: 'translateX(-50%)', width: '12px', height: '12px' } },
  { direction: 'sw', cursor: 'nesw-resize', position: { bottom: '-6px', left: '-6px', width: '12px', height: '12px' } },
  { direction: 'w', cursor: 'ew-resize', position: { left: '-6px', top: '50%', transform: 'translateY(-50%)', width: '12px', height: '12px' } },
];

@Directive({
  selector: '[appDesignerElement]',
  standalone: true
})
export class DesignerElementDirective implements OnInit, OnChanges, OnDestroy {
  @Input() element!: LabelElement;
  @Input() canvasWidth = 0;
  @Input() canvasHeight = 0;
  @Input() selected = false;
  @Input() locked = false;
  @Input() allElements: LabelElement[] = [];
  @Input() zoomLevel = 1;

  @Output() update = new EventEmitter<{ x: number; y: number; width: number; height: number }>();
  @Output() rotationChange = new EventEmitter<number>();
  @Output() dragGuides = new EventEmitter<SnapGuide[]>();
  @Output() selectElement = new EventEmitter<void>();
  /** Fires once per gesture, on the first frame that actually changes the element – the
   *  signal for the parent to record a single undo checkpoint for the whole gesture. */
  @Output() interactionStart = new EventEmitter<void>();

  private interactionId = `interaction-${++interactionCounter}`;
  private handles: HTMLElement[] = [];
  private rotationHandle: HTMLElement | null = null;
  private connector: HTMLElement | null = null;
  private angleBadge: HTMLElement | null = null;
  private animationFrameId: number | null = null;
  /** Ensures interactionStart is only emitted once per gesture, not once per frame. */
  private historyFlagged = false;

  // Bound refs for add/remove event listeners
  private pointerMoveRef = this.onPointerMove.bind(this);
  private pointerUpRef = this.onPointerUp.bind(this);

  constructor(
    private elementRef: ElementRef<HTMLElement>,
    private ngZone: NgZone,
    private interactionState: InteractionStateService
  ) {
    const host = this.elementRef.nativeElement;
    // These must be set immediately even without @Input() element data
    host.style.position = 'absolute';
    host.style.touchAction = 'none';
    host.style.willChange = 'transform';
    host.style.backfaceVisibility = 'hidden';
  }

  ngOnInit(): void {
    // First-time styles: element @Input is now available
    this.applyStyles();
    this.syncHandlesState();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selected'] || changes['locked']) {
      this.syncHandlesState();
    }
    if (changes['element'] || changes['zoomLevel']) {
      this.applyStyles();
    }
  }

  ngOnDestroy(): void {
    this.removeGlobalListeners();
    this.removeHandles();
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  /** Push element model styles directly to the DOM – no Angular CD needed */
  private applyStyles(): void {
    if (this.isActiveDrag()) {
      // A live drag owns left/top/transform for its duration (translate3d fast path below).
      // Re-applying element.x/y here (echoed back from the model on every frame) would
      // double-apply the offset on top of the transform and reintroduce jumping.
      return;
    }
    const host = this.elementRef.nativeElement;
    const el = this.element;
    const z = this.zoomLevel;
    host.style.left = `${el.x * z}px`;
    host.style.top = `${el.y * z}px`;
    host.style.width = `${el.width * z}px`;
    host.style.height = `${el.height * z}px`;
    host.style.opacity = `${el.style?.opacity ?? 1}`;
    host.style.transform = `rotate(${this.currentRotation()}deg)`;
  }

  private currentRotation(): number {
    return this.element.rotation ?? this.element.style?.rotation ?? 0;
  }

  private isActiveDrag(): boolean {
    return this.interactionState.currentMode === 'drag' && this.interactionState.isOwner(this.interactionId);
  }

  private emitInteractionStartOnce(): void {
    if (!this.historyFlagged) {
      this.historyFlagged = true;
      this.interactionStart.emit();
    }
  }

  // ────────── HANDLE MANAGEMENT ──────────

  private syncHandlesState(): void {
    const shouldShow = this.selected && !this.locked;
    if (shouldShow) {
      if (this.handles.length === 0) {
        this.createHandles();
      }
    } else {
      this.removeHandles();
    }
  }

  private createHandles(): void {
    const host = this.elementRef.nativeElement;

    // 8 Resize handles
    HANDLE_CONFIGS.forEach(cfg => {
      const el = document.createElement('div');
      el.className = 'designer-handle';
      el.dataset['direction'] = cfg.direction;
      const css = Object.entries(cfg.position).map(([k, v]) => `${k}:${v}`).join(';');
      el.style.cssText = `
        position:absolute;width:12px;height:12px;
        background:#ffffff;border:2px solid #0ea5e9;
        border-radius:2px;cursor:${cfg.cursor};
        z-index:30;box-shadow:0 1px 3px rgba(0,0,0,0.15);
        box-sizing:border-box;${css}
      `;
      host.appendChild(el);
      this.handles.push(el);
    });

    // Rotation handle
    const rHandle = document.createElement('div');
    rHandle.className = 'designer-rotation-handle';
    rHandle.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;
    rHandle.style.cssText = `
      position:absolute;top:-32px;left:50%;transform:translateX(-50%);
      width:22px;height:22px;background:#0ea5e9;border:2px solid #ffffff;
      border-radius:50%;display:flex;align-items:center;justify-content:center;
      cursor:grab;z-index:35;color:#ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.15);
      box-sizing:border-box;
    `;

    // Angle badge
    this.angleBadge = document.createElement('div');
    this.angleBadge.style.cssText = `
      position:absolute;top:-22px;left:50%;transform:translateX(-50%);
      white-space:nowrap;font-size:10px;font-weight:600;color:#0ea5e9;
      background:#ffffff;border:1px solid #bae6fd;border-radius:4px;
      padding:1px 5px;pointer-events:none;display:none;z-index:36;
    `;

    // Connector
    this.connector = document.createElement('div');
    this.connector.style.cssText = `
      position:absolute;top:-10px;left:50%;width:1px;height:10px;
      background:#0ea5e9;pointer-events:none;z-index:25;
    `;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `position:absolute;top:0;left:0;width:100%;height:0;pointer-events:none;z-index:25;`;
    wrapper.appendChild(this.connector);
    wrapper.appendChild(rHandle);
    wrapper.appendChild(this.angleBadge);
    host.appendChild(wrapper);

    this.rotationHandle = rHandle;
  }

  private removeHandles(): void {
    this.handles.forEach(h => h.remove());
    this.handles = [];
    if (this.rotationHandle) {
      this.rotationHandle.parentElement?.remove();
      this.rotationHandle = null;
    }
    this.connector = null;
    this.angleBadge = null;
  }

  // ────────── POINTER DOWN ──────────

  @HostListener('pointerdown', ['$event'])
  onPointerDown(event: PointerEvent): void {
    if (this.locked) return;

    const target = event.target as HTMLElement;

    // Let inputs handle clicks naturally
    if (target.matches('input, textarea, select, button, option, [contenteditable]')) {
      return;
    }

    const isHandle = target.classList.contains('designer-handle');
    const isRotation = target.classList.contains('designer-rotation-handle') || target.closest('.designer-rotation-handle') !== null;

    // Always select on pointer down
    this.ngZone.run(() => this.selectElement.emit());
    event.stopPropagation();

    if (isHandle || isRotation) {
      event.preventDefault();
    }

    const bounds: Bounds = {
      left: this.element.x,
      top: this.element.y,
      width: this.element.width,
      height: this.element.height
    };

    this.historyFlagged = false;

    if (isRotation) {
      const host = this.elementRef.nativeElement;
      const rect = host.getBoundingClientRect();
      this.interactionState.beginRotate(
        this.interactionId,
        this.element.id,
        event.clientX,
        event.clientY,
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      );
      if (this.rotationHandle) this.rotationHandle.style.cursor = 'grabbing';
      if (this.angleBadge) {
        this.angleBadge.style.display = 'block';
        this.angleBadge.textContent = `0°`;
      }
    } else if (isHandle) {
      const dir = target.dataset['direction'] as ResizeDirection;
      this.interactionState.beginResize(this.interactionId, this.element.id, dir, event.clientX, event.clientY, bounds);
    } else {
      this.interactionState.beginDrag(this.interactionId, this.element.id, event.clientX, event.clientY, bounds);
    }

    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('pointermove', this.pointerMoveRef);
      window.addEventListener('pointerup', this.pointerUpRef);
    });
  }

  // ────────── POINTER MOVE ──────────

  private onPointerMove(event: PointerEvent): void {
    if (!this.interactionState.isOwner(this.interactionId)) return;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.animationFrameId = requestAnimationFrame(() => {
      this.handleInteraction(event);
    });
  }

  private handleInteraction(event: PointerEvent): void {
    const mode = this.interactionState.currentMode;
    const host = this.elementRef.nativeElement;

    if (mode === 'drag') {
      this.handleDrag(event, host);
    } else if (mode === 'resize') {
      this.handleResize(event, host);
    } else if (mode === 'rotate') {
      this.handleRotate(event, host);
    }
  }

  // ────────── DRAG ──────────

  private handleDrag(event: PointerEvent, host: HTMLElement): void {
    const state = this.interactionState.dragState;
    const dx = (event.clientX - state.startX) / this.zoomLevel;
    const dy = (event.clientY - state.startY) / this.zoomLevel;

    let targetX = state.startBounds.left + dx;
    let targetY = state.startBounds.top + dy;
    const width = state.startBounds.width;
    const height = state.startBounds.height;

    // Snapping
    const elBounds: Bounds = { left: targetX, top: targetY, width, height };
    const container: Bounds = { left: 0, top: 0, width: this.canvasWidth, height: this.canvasHeight };
    const others: Bounds[] = (this.allElements || [])
      .filter(e => e.id !== this.element.id)
      .map(e => ({ left: e.x, top: e.y, width: e.width, height: e.height }));

    const snap = computeSnap({ element: elBounds, container, others });

    targetX = targetX + snap.dx;
    targetY = targetY + snap.dy;

    // Clamp inside canvas
    targetX = Math.max(0, Math.min(targetX, this.canvasWidth - width));
    targetY = Math.max(0, Math.min(targetY, this.canvasHeight - height));

    const roundedX = Math.round(targetX);
    const roundedY = Math.round(targetY);

    // Compositor-only visual update: left/top stay fixed at the gesture's start position
    // (set by applyStyles() before the drag began) and translate3d carries the live offset.
    // This avoids per-frame layout reflow – only the final position is baked back into
    // left/top on pointerup. The offset itself is in model space, so scale it back up to
    // screen pixels (applyStyles' base left/top are already zoomLevel-scaled).
    const offsetX = (roundedX - state.startBounds.left) * this.zoomLevel;
    const offsetY = (roundedY - state.startBounds.top) * this.zoomLevel;
    host.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) rotate(${this.currentRotation()}deg)`;

    // Update state
    state.currentBounds = { left: roundedX, top: roundedY, width, height };

    this.ngZone.run(() => {
      this.emitInteractionStartOnce();
      this.dragGuides.emit(snap.guides);
      this.update.emit({
        x: roundedX,
        y: roundedY,
        width: Math.round(width),
        height: Math.round(height)
      });
    });
  }

  // ────────── RESIZE ──────────

  private handleResize(event: PointerEvent, host: HTMLElement): void {
    const state = this.interactionState.resizeState;
    const dx = (event.clientX - state.startX) / this.zoomLevel;
    const dy = (event.clientY - state.startY) / this.zoomLevel;

    const minW = 20;
    const minH = 20;

    const result = computeResize(
      state.startBounds,
      state.direction!,
      dx,
      dy,
      minW,
      minH,
      this.canvasWidth,
      this.canvasHeight,
      this.element.maintainAspectRatio === true
    );

    // Update DOM (result is model space; scale to screen pixels for the live visual)
    const z = this.zoomLevel;
    host.style.left = `${result.left * z}px`;
    host.style.top = `${result.top * z}px`;
    host.style.width = `${result.width * z}px`;
    host.style.height = `${result.height * z}px`;

    state.currentBounds = result;

    this.ngZone.run(() => {
      this.emitInteractionStartOnce();
      this.update.emit({
        x: result.left,
        y: result.top,
        width: result.width,
        height: result.height
      });
    });
  }

  // ────────── ROTATE ──────────

  private handleRotate(event: PointerEvent, host: HTMLElement): void {
    const state = this.interactionState.rotateState;
    const rect = host.getBoundingClientRect();

    const rotResult = computeRotation({
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      px: event.clientX,
      py: event.clientY,
      snapDeg: 15
    });

    state.currentAngle = rotResult.snapped;
    host.style.transform = `rotate(${rotResult.snapped}deg)`;

    if (this.angleBadge) {
      this.angleBadge.textContent = `${rotResult.snapped}°`;
    }

    this.ngZone.run(() => {
      this.emitInteractionStartOnce();
      this.rotationChange.emit(rotResult.snapped);
    });
  }

  // ────────── POINTER UP ──────────

  private onPointerUp(): void {
    this.removeGlobalListeners();

    if (this.interactionState.isOwner(this.interactionId)) {
      const mode = this.interactionState.currentMode;
      if (mode === 'drag') {
        // Commit: bake the translate3d offset back into left/top and drop the transform
        // offset, so the model (already synced live) and the DOM agree on final position.
        const host = this.elementRef.nativeElement;
        const final = this.interactionState.dragState.currentBounds;
        host.style.left = `${final.left * this.zoomLevel}px`;
        host.style.top = `${final.top * this.zoomLevel}px`;
        host.style.transform = `rotate(${this.currentRotation()}deg)`;
      }
      if (mode === 'rotate') {
        if (this.rotationHandle) this.rotationHandle.style.cursor = 'grab';
        if (this.angleBadge) this.angleBadge.style.display = 'none';
      }
      this.interactionState.endInteraction();
    }

    this.ngZone.run(() => {
      this.dragGuides.emit([]);
    });
  }

  // ────────── KEYBOARD ──────────

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (!this.selected || this.locked) return;
    const target = event.target as HTMLElement | null;
    if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;

    const delta = event.shiftKey ? 10 : 1;
    let moved = false;
    let tx = this.element.x;
    let ty = this.element.y;

    switch (event.key) {
      case 'ArrowLeft': tx = Math.max(0, tx - delta); moved = true; break;
      case 'ArrowRight': tx = Math.min(this.canvasWidth - this.element.width, tx + delta); moved = true; break;
      case 'ArrowUp': ty = Math.max(0, ty - delta); moved = true; break;
      case 'ArrowDown': ty = Math.min(this.canvasHeight - this.element.height, ty + delta); moved = true; break;
      case 'Escape': this.ngZone.run(() => this.dragGuides.emit([])); break;
    }

    if (moved) {
      event.preventDefault();
      const host = this.elementRef.nativeElement;
      host.style.left = `${tx * this.zoomLevel}px`;
      host.style.top = `${ty * this.zoomLevel}px`;
      this.ngZone.run(() => {
        // Each keypress is already a discrete, atomic action – one undo step per press.
        this.interactionStart.emit();
        this.update.emit({ x: tx, y: ty, width: this.element.width, height: this.element.height });
      });
    }
  }

  // ────────── CLEANUP ──────────

  private removeGlobalListeners(): void {
    window.removeEventListener('pointermove', this.pointerMoveRef);
    window.removeEventListener('pointerup', this.pointerUpRef);
  }
}