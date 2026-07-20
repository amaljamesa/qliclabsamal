/**
 * Pure geometry utilities for rectangle math used across the interaction engine.
 * All coordinates are in element-space pixels unless otherwise noted.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Create bounds from x,y,w,h */
export function toBounds(r: Rect): Bounds {
  return { left: r.x, top: r.y, width: r.width, height: r.height };
}

/** Create rect from bounds */
export function toRect(b: Bounds): Rect {
  return { x: b.left, y: b.top, width: b.width, height: b.height };
}

/** Right edge */
export function right(b: Bounds): number {
  return b.left + b.width;
}

/** Bottom edge */
export function bottom(b: Bounds): number {
  return b.top + b.height;
}

/** Center X */
export function centerX(b: Bounds): number {
  return b.left + b.width / 2;
}

/** Center Y */
export function centerY(b: Bounds): number {
  return b.top + b.height / 2;
}

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Round to integer */
export function round(n: number): number {
  return Math.round(n);
}

/** Ensure positive non-NaN value */
export function validSize(n: number, fallback: number): number {
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Ensure valid position value (can be 0) */
export function validPos(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/** Distance between two points */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/** Check if a point is inside a bounds */
export function containsPoint(b: Bounds, px: number, py: number): boolean {
  return px >= b.left && px <= right(b) && py >= b.top && py <= bottom(b);
}

/** Constrain a rect inside a container */
export function constrainRect(rect: Bounds, container: Bounds, minW: number, minH: number): Bounds {
  const w = Math.max(minW, Math.min(rect.width, container.width));
  const h = Math.max(minH, Math.min(rect.height, container.height));
  const x = clamp(rect.left, container.left, container.left + container.width - w);
  const y = clamp(rect.top, container.top, container.top + container.height - h);
  return { left: x, top: y, width: w, height: h };
}

/** Aspect ratio */
export function aspectRatio(w: number, h: number): number {
  return h > 0 ? w / h : 1;
}

/** Scale a size maintaining aspect ratio */
export function scaleToAspect(w: number, h: number, target: number, isWidth: boolean): { width: number; height: number } {
  const ratio = aspectRatio(w, h);
  if (isWidth) {
    return { width: target, height: Math.round(target / ratio) };
  }
  return { width: Math.round(target * ratio), height: target };
}

export type ResizeDirection = 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w';

/**
 * Compute new bounds from a resize gesture (Canva/Figma style).
 * Pure function – no side effects.
 */
export function computeResize(
  start: Bounds,
  direction: ResizeDirection,
  dx: number,
  dy: number,
  minWidth: number,
  minHeight: number,
  maxWidth: number,
  maxHeight: number,
  lockAspect?: boolean
): Bounds {
  const minW = Math.max(20, minWidth);
  const minH = Math.max(20, minHeight);

  const hasW = direction.includes('w');
  const hasE = direction.includes('e');
  const hasN = direction.includes('n');
  const hasS = direction.includes('s');

  let L = start.left;
  let R = start.left + start.width;
  let T = start.top;
  let B = start.top + start.height;

  // Horizontal edge
  if (hasW) {
    L = start.left + dx;
    R = start.left + start.width;
    if (L <= R) {
      let w = R - L;
      if (w < minW) { L = R - minW; }
    } else {
      let w = L - R;
      if (w < minW) { L = R + minW; }
      const temp = L; L = R; R = temp;
    }
  } else if (hasE) {
    L = start.left;
    R = start.left + start.width + dx;
    if (R >= L) {
      let w = R - L;
      if (w < minW) { R = L + minW; }
    } else {
      let w = L - R;
      if (w < minW) { R = L - minW; }
      const temp = L; L = R; R = temp;
    }
  }

  // Vertical edge
  if (hasN) {
    T = start.top + dy;
    B = start.top + start.height;
    if (T <= B) {
      let h = B - T;
      if (h < minH) { T = B - minH; }
    } else {
      let h = T - B;
      if (h < minH) { T = B + minH; }
      const temp = T; T = B; B = temp;
    }
  } else if (hasS) {
    T = start.top;
    B = start.top + start.height + dy;
    if (B >= T) {
      let h = B - T;
      if (h < minH) { B = T + minH; }
    } else {
      let h = T - B;
      if (h < minH) { B = T - minH; }
      const temp = T; T = B; B = temp;
    }
  }

  let width = R - L;
  let height = B - T;

  // Aspect ratio lock
  if (lockAspect && start.width > 0 && start.height > 0) {
    const aspect = start.width / start.height;
    if (hasE || hasW) {
      height = Math.round(width / aspect);
      if (height < minH) { height = minH; width = Math.round(height * aspect); }
      if (hasN) { T = B - height; } else { B = T + height; }
      if (hasW) { L = R - width; } else { R = L + width; }
    } else {
      width = Math.round(height * aspect);
      if (width < minW) { width = minW; height = Math.round(width / aspect); }
      if (hasW) { L = R - width; } else { R = L + width; }
      if (hasN) { T = B - height; } else { B = T + height; }
    }
  }

  // Max constraints
  if (width > maxWidth) { width = maxWidth; if (hasW) { L = R - maxWidth; } else { R = L + maxWidth; } }
  if (height > maxHeight) { height = maxHeight; if (hasN) { T = B - maxHeight; } else { B = T + maxHeight; } }

  // Parent boundary
  L = clamp(L, 0, maxWidth - minW);
  T = clamp(T, 0, maxHeight - minH);
  R = clamp(R, minW, maxWidth);
  B = clamp(B, minH, maxHeight);

  width = R - L;
  height = B - T;

  return {
    left: round(L),
    top: round(T),
    width: round(width),
    height: round(height)
  };
}