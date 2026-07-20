/**
 * Snap engine for alignment guides (Canva/Figma style).
 * Pure functions – no side effects.
 */
import { Bounds, round, centerX, centerY, right, bottom } from './geometry';

export interface SnapGuide {
  orientation: 'horizontal' | 'vertical';
  position: number;
  visible: boolean;
}

export interface SnappedDelta {
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

export interface SnapConfig {
  /** Snap threshold in pixels */
  threshold?: number;
  /** Element bounds */
  element: Bounds;
  /** Canvas container bounds */
  container: Bounds;
  /** Other element bounds to snap against */
  others: Bounds[];
}

const DEFAULT_THRESHOLD = 6;

/**
 * Compute snapping delta and guide lines for a dragged element.
 * Returns the delta to add to the target position, and guides to render.
 */
export function computeSnap(config: SnapConfig): SnappedDelta {
  const threshold = config.threshold ?? DEFAULT_THRESHOLD;
  const el = config.element;
  const container = config.container;
  const guides: SnapGuide[] = [];

  // Collect snap points from container
  const containerSnapPoints: { hz: number[]; vt: number[] } = {
    hz: [0, container.top + container.height / 2, container.top + container.height],
    vt: [0, container.left + container.width / 2, container.left + container.width]
  };

  // Collect snap points from other elements
  const otherEdgesHZ: number[] = [];
  const otherEdgesVT: number[] = [];
  const otherCentersHZ: number[] = [];
  const otherCentersVT: number[] = [];

  for (const other of config.others) {
    // Top edge, bottom edge, center Y
    otherEdgesHZ.push(other.top, other.top + other.height);
    otherCentersHZ.push(centerY(other));
    // Left edge, right edge, center X
    otherEdgesVT.push(other.left, other.left + other.width);
    otherCentersVT.push(centerX(other));
  }

  const elLeft = el.left;
  const elRight = el.left + el.width;
  const elCX = centerX(el);
  const elTop = el.top;
  const elBottom = el.top + el.height;
  const elCY = centerY(el);

  let snapDx = 0;
  let snapDy = 0;

  // --- Horizontal snapping (vertical guides) ---
  const vtTargets: { pos: number; value: number }[] = [
    { pos: elLeft, value: elLeft },
    { pos: elRight, value: elRight },
    { pos: elCX, value: elCX },
  ];

  // Container vertical snap points
  for (const sp of containerSnapPoints.vt) {
    for (const t of vtTargets) {
      const diff = t.pos - snapDx - sp;
      if (Math.abs(diff) < threshold) {
        snapDx += diff;
        guides.push({ orientation: 'vertical', position: sp, visible: true });
      }
    }
  }

  // Other elements vertical snap
  const allVT = [...otherEdgesVT, ...otherCentersVT];
  for (const sp of allVT) {
    for (const t of [elLeft, elRight, elCX]) {
      const adjustedPos = t - snapDx;
      const diff = adjustedPos - sp;
      if (Math.abs(diff) < threshold) {
        if (sp !== elLeft && sp !== elRight && sp !== elCX) {
          snapDx += diff;
          guides.push({ orientation: 'vertical', position: sp, visible: true });
        }
      }
    }
  }

  // --- Vertical snapping (horizontal guides) ---
  const hzTargets: { pos: number; value: number }[] = [
    { pos: elTop, value: elTop },
    { pos: elBottom, value: elBottom },
    { pos: elCY, value: elCY },
  ];

  // Container horizontal snap points
  for (const sp of containerSnapPoints.hz) {
    for (const t of hzTargets) {
      const diff = t.pos - snapDy - sp;
      if (Math.abs(diff) < threshold) {
        snapDy += diff;
        guides.push({ orientation: 'horizontal', position: sp, visible: true });
      }
    }
  }

  // Other elements horizontal snap
  const allHZ = [...otherEdgesHZ, ...otherCentersHZ];
  for (const sp of allHZ) {
    for (const t of [elTop, elBottom, elCY]) {
      const adjustedPos = t - snapDy;
      const diff = adjustedPos - sp;
      if (Math.abs(diff) < threshold) {
        if (sp !== elTop && sp !== elBottom && sp !== elCY) {
          snapDy += diff;
          guides.push({ orientation: 'horizontal', position: sp, visible: true });
        }
      }
    }
  }

  // Deduplicate guide positions (keep unique)
  const seen = new Set<string>();
  const uniqueGuides = guides.filter(g => {
    const key = `${g.orientation}-${g.position}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { dx: round(snapDx), dy: round(snapDy), guides: uniqueGuides };
}

/**
 * Snap a rotation angle to the nearest increment (e.g., 15 degrees).
 */
export function snapRotation(angleDeg: number, snapInc: number = 15): number {
  return Math.round(angleDeg / snapInc) * snapInc;
}