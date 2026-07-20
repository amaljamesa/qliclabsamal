import { Injectable } from '@angular/core';
import { Bounds } from './geometry';

export type InteractionMode = 'idle' | 'drag' | 'resize' | 'rotate';
export type ResizeDirection = 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w';

export interface DragState {
  active: boolean;
  startX: number;
  startY: number;
  startBounds: Bounds;
  currentBounds: Bounds;
}

export interface ResizeState {
  active: boolean;
  direction: ResizeDirection | null;
  startX: number;
  startY: number;
  startBounds: Bounds;
  currentBounds: Bounds;
}

export interface RotateState {
  active: boolean;
  startX: number;
  startY: number;
  centerX: number;
  centerY: number;
  currentAngle: number;
}

/**
 * Singleton service that tracks the active interaction state.
 * This is the single source of truth for drag/resize/rotate operations.
 * Multiple elements can share this service – each interaction gets a unique
 * interactionId to prevent cross-talk.
 */
@Injectable({ providedIn: 'root' })
export class InteractionStateService {
  private mode: InteractionMode = 'idle';
  private interactionId: string | null = null;
  private elementId: string | null = null;

  dragState: DragState = { active: false, startX: 0, startY: 0, startBounds: { left: 0, top: 0, width: 0, height: 0 }, currentBounds: { left: 0, top: 0, width: 0, height: 0 } };
  resizeState: ResizeState = { active: false, direction: null, startX: 0, startY: 0, startBounds: { left: 0, top: 0, width: 0, height: 0 }, currentBounds: { left: 0, top: 0, width: 0, height: 0 } };
  rotateState: RotateState = { active: false, startX: 0, startY: 0, centerX: 0, centerY: 0, currentAngle: 0 };

  constructor() {}

  get currentMode(): InteractionMode { return this.mode; }
  get currentInteractionId(): string | null { return this.interactionId; }
  get currentElementId(): string | null { return this.elementId; }

  isOwner(interactionId: string): boolean {
    return this.interactionId === interactionId;
  }

  beginDrag(interactionId: string, elementId: string, clientX: number, clientY: number, bounds: Bounds): void {
    this.endInteraction();
    this.interactionId = interactionId;
    this.elementId = elementId;
    this.mode = 'drag';
    this.dragState = {
      active: true,
      startX: clientX,
      startY: clientY,
      startBounds: { ...bounds },
      currentBounds: { ...bounds }
    };
  }

  beginResize(interactionId: string, elementId: string, direction: ResizeDirection, clientX: number, clientY: number, bounds: Bounds): void {
    this.endInteraction();
    this.interactionId = interactionId;
    this.elementId = elementId;
    this.mode = 'resize';
    this.resizeState = {
      active: true,
      direction,
      startX: clientX,
      startY: clientY,
      startBounds: { ...bounds },
      currentBounds: { ...bounds }
    };
  }

  beginRotate(interactionId: string, elementId: string, clientX: number, clientY: number, centerX: number, centerY: number): void {
    this.endInteraction();
    this.interactionId = interactionId;
    this.elementId = elementId;
    this.mode = 'rotate';
    this.rotateState = {
      active: true,
      startX: clientX,
      startY: clientY,
      centerX,
      centerY,
      currentAngle: 0
    };
  }

  endInteraction(): void {
    this.reset();
  }

  cancelInteraction(): void {
    this.reset();
  }

  private reset(): void {
    this.mode = 'idle';
    this.interactionId = null;
    this.elementId = null;
    this.dragState = { active: false, startX: 0, startY: 0, startBounds: { left: 0, top: 0, width: 0, height: 0 }, currentBounds: { left: 0, top: 0, width: 0, height: 0 } };
    this.resizeState = { active: false, direction: null, startX: 0, startY: 0, startBounds: { left: 0, top: 0, width: 0, height: 0 }, currentBounds: { left: 0, top: 0, width: 0, height: 0 } };
    this.rotateState = { active: false, startX: 0, startY: 0, centerX: 0, centerY: 0, currentAngle: 0 };
  }
}