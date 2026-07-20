import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface KeyAction {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** If true, the action only fires when NOT editing text input */
  skipWhenEditing?: boolean;
  handler: () => void;
}

/**
 * Central keyboard shortcut handler for the label designer.
 * Emits actions when registered shortcuts are pressed.
 */
@Injectable({ providedIn: 'root' })
export class KeyboardShortcutsService implements OnDestroy {
  private actions: Map<string, KeyAction> = new Map();
  private handlerRef: ((event: KeyboardEvent) => void) | null = null;

  constructor(private ngZone: NgZone) {}

  /**
   * Register a set of keyboard shortcuts.
   * Should be called from the canvas component on init.
   */
  register(actions: KeyAction[]): void {
    for (const action of actions) {
      const key = this.encodeKey(action.key, action.ctrl, action.shift, action.alt);
      this.actions.set(key, action);
    }
    this.attach();
  }

  /**
   * Unregister shortcuts.
   */
  unregister(actions: KeyAction[]): void {
    for (const action of actions) {
      const key = this.encodeKey(action.key, action.ctrl, action.shift, action.alt);
      this.actions.delete(key);
    }
    if (this.actions.size === 0) {
      this.detach();
    }
  }

  clear(): void {
    this.actions.clear();
    this.detach();
  }

  private attach(): void {
    if (this.handlerRef) return;
    this.handlerRef = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.matches('input, textarea, select, [contenteditable="true"]');
      const key = this.encodeKey(
        event.key,
        event.ctrlKey || event.metaKey,
        event.shiftKey,
        event.altKey
      );
      const action = this.actions.get(key);
      if (!action) return;
      if (action.skipWhenEditing && editing) return;
      event.preventDefault();
      event.stopPropagation();
      this.ngZone.run(() => action.handler());
    };
    document.addEventListener('keydown', this.handlerRef);
  }

  private detach(): void {
    if (this.handlerRef) {
      document.removeEventListener('keydown', this.handlerRef);
      this.handlerRef = null;
    }
  }

  private encodeKey(key: string, ctrl?: boolean, shift?: boolean, alt?: boolean): string {
    return `${ctrl ? 'C+' : ''}${shift ? 'S+' : ''}${alt ? 'A+' : ''}${key.toLowerCase()}`;
  }

  ngOnDestroy(): void {
    this.detach();
  }
}