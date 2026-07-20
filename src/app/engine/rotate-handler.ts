/**
 * Rotation handler – computes rotation angle from pointer events.
 */
import { snapRotation } from './snap-engine';

export interface RotateConfig {
  /** Element center X in viewport coords */
  cx: number;
  /** Element center Y in viewport coords */
  cy: number;
  /** Pointer X in viewport coords */
  px: number;
  /** Pointer Y in viewport coords */
  py: number;
  /** Snap increment in degrees (0 = no snap) */
  snapDeg?: number;
  /** Previous angle to accumulate from */
  baseAngle?: number;
}

export interface RotateResult {
  angle: number;
  snapped: number;
}

/**
 * Compute rotation angle from pointer position relative to element center.
 * Returns both raw and snapped angle in degrees (0-360).
 */
export function computeRotation(config: RotateConfig): RotateResult {
  const { cx, cy, px, py, snapDeg = 15, baseAngle = 0 } = config;
  
  // Angle from center to pointer
  const rad = Math.atan2(py - cy, px - cx);
  // Convert to degrees offset from top (subtract 90 degrees)
  let deg = rad * (180 / Math.PI) - 90;
  
  // Normalize to 0-360
  deg = ((deg % 360) + 360) % 360;
  
  const snapped = snapDeg > 0 ? snapRotation(deg, snapDeg) : Math.round(deg);
  
  return {
    angle: Math.round(deg),
    snapped
  };
}