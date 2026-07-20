/** Pure, DOM-free pixel-analysis helpers used to spot a barcode's bars and any other
 *  non-text graphic (e.g. a logo) in an uploaded label photo. Kept free of Angular/DOM
 *  types (besides structural shapes) so the detection math can run — and be tested —
 *  outside a browser.
 */

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface GrayImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface PixelBuffer {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export function toGrayscale(imageData: PixelBuffer): GrayImage {
  const { data, width, height } = imageData;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return { data: gray, width, height };
}

/** Classic Otsu's method: picks the grayscale threshold that best separates ink from background. */
export function otsuThreshold(gray: GrayImage): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.data.length; i++) {
    hist[gray.data[i]]++;
  }
  const total = gray.data.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let varMax = -1;
  let threshold = 127;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);
    // >= (not >) so ties resolve to the last t in a flat run, landing the threshold
    // between clusters instead of getting stuck at the first t of a tied plateau.
    if (varBetween >= varMax) {
      varMax = varBetween;
      threshold = t;
    }
  }
  return threshold;
}

/** 1 = ink/dark, 0 = background/light. */
export function binarize(gray: GrayImage, threshold: number): Uint8Array {
  const mask = new Uint8Array(gray.data.length);
  for (let i = 0; i < gray.data.length; i++) {
    mask[i] = gray.data[i] < threshold ? 1 : 0;
  }
  return mask;
}

function countTransitions(mask: Uint8Array, width: number, y: number): number {
  let prev = mask[y * width];
  let count = 0;
  for (let x = 1; x < width; x++) {
    const v = mask[y * width + x];
    if (v !== prev) count++;
    prev = v;
  }
  return count;
}

function rowSimilarity(mask: Uint8Array, width: number, y1: number, y2: number): number {
  let same = 0;
  const base1 = y1 * width;
  const base2 = y2 * width;
  for (let x = 0; x < width; x++) {
    if (mask[base1 + x] === mask[base2 + x]) same++;
  }
  return same / width;
}

/** Detects a barcode-like band: a tall run of rows with many alternating bars whose
 *  pattern stays nearly identical row-to-row — the defining trait of parallel vertical
 *  bars, unlike text whose stroke pattern varies from row to row. */
export function detectBarcodeBand(mask: Uint8Array, width: number, height: number): Rect | null {
  const minTransitions = Math.max(18, Math.round(width * 0.08));
  let best: { y0: number; y1: number } | null = null;
  let y = 0;

  while (y < height) {
    if (countTransitions(mask, width, y) >= minTransitions) {
      const runStart = y;
      let prevRow = y;
      let y2 = y + 1;
      while (
        y2 < height &&
        countTransitions(mask, width, y2) >= minTransitions &&
        rowSimilarity(mask, width, prevRow, y2) >= 0.85
      ) {
        prevRow = y2;
        y2++;
      }
      if (!best || y2 - runStart > best.y1 - best.y0) {
        best = { y0: runStart, y1: y2 };
      }
      y = y2;
    } else {
      y++;
    }
  }

  if (!best) return null;
  const minRunLen = Math.max(6, Math.round(height * 0.035));
  if (best.y1 - best.y0 < minRunLen) return null;

  const colDark = new Uint8Array(width);
  for (let yy = best.y0; yy < best.y1; yy++) {
    const base = yy * width;
    for (let x = 0; x < width; x++) {
      if (mask[base + x]) colDark[x] = 1;
    }
  }

  let x0 = -1;
  let x1 = -1;
  for (let x = 0; x < width; x++) {
    if (colDark[x]) {
      if (x0 === -1) x0 = x;
      x1 = x;
    }
  }
  if (x0 === -1) return null;
  x0 = Math.max(0, x0 - 1);
  x1 = Math.min(width, x1 + 2);

  const bw = x1 - x0;
  const bh = best.y1 - best.y0;
  if (bw < bh * 1.1) return null; // a barcode is noticeably wider than tall

  return { x0, y0: best.y0, x1, y1: best.y1 };
}

/** Finds the single largest non-excluded "ink" blob (e.g. a logo) using a coarse
 *  occupancy grid + flood fill, avoiding full pixel-resolution connected-component work. */
export function detectGraphicBlob(mask: Uint8Array, width: number, height: number, exclude: Rect[]): Rect | null {
  const cell = Math.max(4, Math.round(Math.min(width, height) / 40));
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const occupied = new Uint8Array(cols * rows);

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const x0 = gx * cell;
      const y0 = gy * cell;
      const x1 = Math.min(width, x0 + cell);
      const y1 = Math.min(height, y0 + cell);
      if (exclude.some(r => x0 < r.x1 && r.x0 < x1 && y0 < r.y1 && r.y0 < y1)) continue;

      let dark = 0;
      let total = 0;
      for (let y = y0; y < y1; y++) {
        const base = y * width;
        for (let x = x0; x < x1; x++) {
          total++;
          if (mask[base + x]) dark++;
        }
      }
      if (total > 0 && dark / total > 0.12) occupied[gy * cols + gx] = 1;
    }
  }

  const visited = new Uint8Array(cols * rows);
  let bestSize = 0;
  let best: { minGx: number; maxGx: number; minGy: number; maxGy: number } | null = null;

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const idx = gy * cols + gx;
      if (!occupied[idx] || visited[idx]) continue;

      const stack = [idx];
      visited[idx] = 1;
      let minGx = gx;
      let maxGx = gx;
      let minGy = gy;
      let maxGy = gy;
      let size = 0;

      while (stack.length) {
        const cur = stack.pop() as number;
        const cy = Math.floor(cur / cols);
        const cx = cur % cols;
        size++;
        minGx = Math.min(minGx, cx);
        maxGx = Math.max(maxGx, cx);
        minGy = Math.min(minGy, cy);
        maxGy = Math.max(maxGy, cy);

        const neighbors = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const nidx = ny * cols + nx;
          if (occupied[nidx] && !visited[nidx]) {
            visited[nidx] = 1;
            stack.push(nidx);
          }
        }
      }

      if (size > bestSize) {
        bestSize = size;
        best = { minGx, maxGx, minGy, maxGy };
      }
    }
  }

  if (!best || bestSize < 4) return null;

  const x0 = best.minGx * cell;
  const y0 = best.minGy * cell;
  const x1 = Math.min(width, (best.maxGx + 1) * cell);
  const y1 = Math.min(height, (best.maxGy + 1) * cell);
  const bw = x1 - x0;
  const bh = y1 - y0;
  const area = bw * bh;
  const imageArea = width * height;

  if (area > imageArea * 0.6) return null; // too large to be a logo — likely texture/background
  const aspect = bw / bh;
  if (aspect > 6 || aspect < 1 / 6) return null; // reject thin bars/rules, not a logo shape

  return { x0, y0, x1, y1 };
}

export function overlapFraction(a: Rect, b: Rect): number {
  const ix0 = Math.max(a.x0, b.x0);
  const iy0 = Math.max(a.y0, b.y0);
  const ix1 = Math.min(a.x1, b.x1);
  const iy1 = Math.min(a.y1, b.y1);
  const iw = Math.max(0, ix1 - ix0);
  const ih = Math.max(0, iy1 - iy0);
  const interArea = iw * ih;
  const aArea = Math.max(1, (a.x1 - a.x0) * (a.y1 - a.y0));
  return interArea / aArea;
}
