/** Design-canvas convention: element geometry (x/y/width/height) and numeric style
 *  values (fontSize, borderWidth, borderRadius) are stored in "model units" where
 *  4 units = 1mm — i.e. the canvas renders at 4px/mm when zoomLevel = 1. Shared here
 *  so the designer canvas, print preview, and true-size popup all agree on the
 *  conversion instead of each hard-coding their own copy. */
export const MM_TO_PX = 4;

export function modelToMm(value: number): number {
  return value / MM_TO_PX;
}
