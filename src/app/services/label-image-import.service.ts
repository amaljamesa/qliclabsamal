import { Injectable } from '@angular/core';
import { createWorker } from 'tesseract.js';
import { LABEL_ELEMENT_PREFIXES, LabelElement, LabelElementType } from '../models/label-element.model';
import { LabelDimensions } from '../models/label.model';
import { Rect, binarize, detectBarcodeBand, detectGraphicBlob, otsuThreshold, overlapFraction, toGrayscale } from './label-image-pixel-utils';
import { MM_TO_PX } from '../models/label-units';

export interface DetectedField {
  id: string;
  type: LabelElementType;
  rawText: string;
  value: string;
  label: string;
  prefix: string;
  include: boolean;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  /** Glyph height (ascender + descender) in source-image px, when Tesseract reports it. */
  glyphHeightPx?: number;
  /** Cropped bitmap for a detected non-text graphic (e.g. a logo), as a data URL. */
  imageSrc?: string;
  /** True when bbox comes from pixel analysis of the actual graphic (barcode bars or a
   *  logo blob), as opposed to an OCR text line — so toElements can skip text-only heuristics. */
  fromImageDetection?: boolean;
}

export interface ImageImportResult {
  fields: DetectedField[];
  imageWidth: number;
  imageHeight: number;
}

interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface OcrLine {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  glyphHeightPx?: number;
  words?: OcrWord[];
}

interface ClassificationRule {
  type: LabelElementType;
  test: RegExp;
  extract: (text: string) => string;
}

const DATE_RE = /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/;
const NUMBER_RE = /\d[\d,]*(?:\.\d{1,2})?/;
const DIGITS_ONLY_RE = /^\d{8,14}$/;

function afterColon(text: string): string {
  const idx = text.indexOf(':');
  const rest = idx >= 0 ? text.slice(idx + 1) : text;
  return rest.trim();
}

function extractDate(text: string): string {
  return text.match(DATE_RE)?.[0] ?? afterColon(text);
}

function extractNumber(text: string): string {
  return text.match(NUMBER_RE)?.[0] ?? afterColon(text);
}

/** Ordered most-specific-first: the first matching rule wins. Keywords are matched as
 *  loosely as we safely can (leading word-boundary only, not trailing) because OCR often
 *  drops the punctuation/space that would normally separate a label from its value —
 *  "EXP DATE: 10-01-2025" can come back as "EXPDATE10-01-2025", and a strict \bexp\b
 *  (which demands a non-word character right after "exp") would then miss it entirely. */
const RULES: ClassificationRule[] = [
  { type: 'fssai', test: /fssai/i, extract: t => t.match(/\d{6,14}/)?.[0] ?? afterColon(t) },
  { type: 'bestBefore', test: /best\s*before/i, extract: extractDate },
  { type: 'pkdOn', test: /\bpkd|packed|pack(ing)?\s*date/i, extract: extractDate },
  // "Exp"/"Exp Date"/"Expiry"/"Expiry Date"/"Use By" are all the expiry date, tagged as
  // 'expiryDate' regardless of which wording or spacing/punctuation OCR happened to read.
  { type: 'expiryDate', test: /\bexp|use\s*by/i, extract: extractDate },
  { type: 'batch', test: /\bbatch/i, extract: afterColon },
  { type: 'offerYouSave', test: /you\s*save/i, extract: extractNumber },
  { type: 'offerPrice', test: /offer\s*price/i, extract: extractNumber },
  // "SP" is a common enough two-letter substring (e.g. "display", "spice") that it needs
  // boundaries on both sides unless immediately followed by punctuation/digits (its price).
  { type: 'salePrice', test: /(?<![a-z])sp(?=[:.\s]|\d)|sale\s*price/i, extract: extractNumber },
  { type: 'mrp', test: /\bmrp/i, extract: extractNumber },
  { type: 'ratePer', test: /rate\s*per|\/\s*(kg|ltr|ml|gm|g|l)\b/i, extract: afterColon },
  { type: 'category', test: /\bcategory/i, extract: afterColon },
  { type: 'brand', test: /\bbrand/i, extract: afterColon },
  { type: 'offer', test: /\boffer\b|%\s*off/i, extract: afterColon }
];

const TYPE_LABELS: Partial<Record<LabelElementType, string>> = {
  fssai: 'FSSAI No', bestBefore: 'Best Before', pkdOn: 'Packed On', expiryDate: 'Expiry Date',
  batch: 'Batch No', offerYouSave: 'You Save', offerPrice: 'Offer Price', salePrice: 'Sale Price',
  mrp: 'MRP', ratePer: 'Rate Per', category: 'Category', brand: 'Brand', offer: 'Offer',
  barcode: 'Barcode Placeholder', companyName: 'Company Name', productName: 'Product Name', text: 'Text'
};

@Injectable({ providedIn: 'root' })
export class LabelImageImportService {

  async analyzeImage(file: File, onProgress?: (percent: number) => void): Promise<ImageImportResult> {
    const img = await this.loadImage(file);
    const imageWidth = img.naturalWidth;
    const imageHeight = img.naturalHeight;

    const worker = await createWorker('eng', undefined, {
      logger: message => {
        if (message.status === 'recognizing text' && onProgress) {
          onProgress(Math.round(message.progress * 100));
        }
      }
    });

    let lines: OcrLine[];
    try {
      const { data } = await worker.recognize(file);
      lines = (data.lines ?? [])
        .map(line => {
          const ascenders = line.rowAttributes?.ascenders ?? 0;
          const descenders = Math.abs(line.rowAttributes?.descenders ?? 0);
          return {
            text: line.text.trim(),
            bbox: line.bbox,
            glyphHeightPx: ascenders && descenders ? ascenders + descenders : undefined,
            words: (line.words ?? []).map(word => ({ text: word.text, bbox: word.bbox }))
          };
        })
        .filter(line => line.text.length > 0)
        // A photo often has two fields side by side on the same visual row (e.g. "Pkd on"
        // and "Exp Date"), which Tesseract groups into a single line since they share a
        // baseline. Split those apart on unusually large word gaps before classifying,
        // otherwise only the first field would be kept and the second silently lost.
        .flatMap(line => this.splitByColumnGaps(line))
        // Safety net for when the gap-based split above doesn't fire (e.g. Tesseract
        // didn't report word boxes, or the two fields happened to sit close together): if
        // the line's text still contains two different field keywords (e.g. "SP:80.00
        // FSSAI: 12345678"), split directly on where each keyword starts. This doesn't
        // depend on word positions at all, so it catches what the gap split misses.
        .flatMap(line => this.splitByKeywordMatches(line));
    } finally {
      await worker.terminate();
    }

    const visual = this.detectVisualRegions(img, lines.map(line => line.bbox));
    const fields = this.classify(lines, visual.barcodeBox);
    if (visual.logoBox && visual.logoImageSrc) {
      fields.push(this.makeImageField(visual.logoBox, visual.logoImageSrc));
    }
    fields.sort((a, b) => a.bbox.y0 - b.bbox.y0);

    return { fields, imageWidth, imageHeight };
  }

  /** Splits one OCR line into multiple fields when it visually contains two side-by-side
   *  columns (a much bigger gap between two clusters of words than the normal spacing
   *  within either cluster) — otherwise a row like "Pkd on: 01-01-2025   Exp Date: 10-01-2025"
   *  would be swallowed whole by whichever keyword rule matches first. */
  private splitByColumnGaps(line: OcrLine): OcrLine[] {
    const words = line.words;
    if (!words || words.length < 2) {
      return [line];
    }

    const gaps: number[] = [];
    for (let i = 1; i < words.length; i++) {
      gaps.push(Math.max(0, words[i].bbox.x0 - words[i - 1].bbox.x1));
    }
    const sortedGaps = [...gaps].sort((a, b) => a - b);
    const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)] ?? 0;
    const lineHeight = line.bbox.y1 - line.bbox.y0;
    const splitThreshold = Math.max(lineHeight * 1.5, medianGap * 3, 18);

    const groups: OcrWord[][] = [[words[0]]];
    for (let i = 1; i < words.length; i++) {
      if (gaps[i - 1] > splitThreshold) {
        groups.push([words[i]]);
      } else {
        groups[groups.length - 1].push(words[i]);
      }
    }

    if (groups.length < 2) {
      return [line];
    }

    return groups
      .map(group => ({
        text: group.map(word => word.text).join(' ').trim(),
        bbox: {
          x0: Math.min(...group.map(word => word.bbox.x0)),
          y0: Math.min(...group.map(word => word.bbox.y0)),
          x1: Math.max(...group.map(word => word.bbox.x1)),
          y1: Math.max(...group.map(word => word.bbox.y1))
        },
        glyphHeightPx: line.glyphHeightPx
      }))
      .filter(candidate => candidate.text.length > 0);
  }

  /** Splits a line directly on keyword positions when it contains 2+ different field
   *  keywords (e.g. "SP:80.00 FSSAI: 12345678"), regardless of word spacing — a pure
   *  text-level fallback for splitByColumnGaps, since RULES.find() would otherwise match
   *  only the first keyword and silently swallow everything else in the line into that
   *  one field (e.g. an "SP:80.00" that precedes "FSSAI" would vanish entirely, consumed
   *  as part of the fssai match's raw text). Sub-bboxes are estimated by character
   *  position within the line, which is approximate but far better than losing the field. */
  private splitByKeywordMatches(line: OcrLine): OcrLine[] {
    const text = line.text;
    const matches = RULES
      .map(rule => ({ rule, match: rule.test.exec(text) }))
      .filter((entry): entry is { rule: ClassificationRule; match: RegExpExecArray } => entry.match !== null)
      .map(entry => ({ index: entry.match.index }))
      .sort((a, b) => a.index - b.index);

    if (matches.length < 2) {
      return [line];
    }

    const totalLen = Math.max(1, text.length);
    const bboxWidth = line.bbox.x1 - line.bbox.x0;
    const segments: OcrLine[] = [];

    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index;
      const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
      const segmentText = text.slice(start, end).trim();
      if (!segmentText) {
        continue;
      }
      const x0 = line.bbox.x0 + Math.round((start / totalLen) * bboxWidth);
      const x1 = line.bbox.x0 + Math.round((end / totalLen) * bboxWidth);
      segments.push({
        text: segmentText,
        bbox: { x0, y0: line.bbox.y0, x1: Math.max(x0 + 1, x1), y1: line.bbox.y1 },
        glyphHeightPx: line.glyphHeightPx
      });
    }

    return segments.length >= 2 ? segments : [line];
  }

  /** Runs lightweight pixel analysis (grayscale → Otsu threshold → binary mask) to spot
   *  a barcode's actual bar pattern and any other non-text graphic (e.g. a logo), since
   *  OCR only ever sees printed text and would otherwise miss both entirely. */
  private detectVisualRegions(img: HTMLImageElement, textBoxes: Rect[]): { barcodeBox?: Rect; logoBox?: Rect; logoImageSrc?: string } {
    const maxDim = 500;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const procWidth = Math.max(1, Math.round(img.naturalWidth * scale));
    const procHeight = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = procWidth;
    canvas.height = procHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return {};
    }
    ctx.drawImage(img, 0, 0, procWidth, procHeight);

    const imageData = ctx.getImageData(0, 0, procWidth, procHeight);
    const gray = toGrayscale(imageData);
    const threshold = otsuThreshold(gray);
    const mask = binarize(gray, threshold);

    const barcodeBandProc = detectBarcodeBand(mask, procWidth, procHeight);
    const excludeProc: Rect[] = textBoxes.map(box => ({
      x0: box.x0 * scale, y0: box.y0 * scale, x1: box.x1 * scale, y1: box.y1 * scale
    }));
    if (barcodeBandProc) {
      excludeProc.push(barcodeBandProc);
    }

    const logoBandProc = detectGraphicBlob(mask, procWidth, procHeight, excludeProc);

    const result: { barcodeBox?: Rect; logoBox?: Rect; logoImageSrc?: string } = {};
    if (barcodeBandProc) {
      result.barcodeBox = this.scaleRect(barcodeBandProc, 1 / scale, img.naturalWidth, img.naturalHeight);
    }
    if (logoBandProc) {
      result.logoBox = this.scaleRect(logoBandProc, 1 / scale, img.naturalWidth, img.naturalHeight);
      result.logoImageSrc = this.cropToDataUrl(img, result.logoBox);
    }
    return result;
  }

  private scaleRect(rect: Rect, factor: number, maxWidth: number, maxHeight: number): Rect {
    return {
      x0: Math.max(0, Math.round(rect.x0 * factor)),
      y0: Math.max(0, Math.round(rect.y0 * factor)),
      x1: Math.min(maxWidth, Math.round(rect.x1 * factor)),
      y1: Math.min(maxHeight, Math.round(rect.y1 * factor))
    };
  }

  private cropToDataUrl(img: HTMLImageElement, rect: Rect): string {
    const width = Math.max(1, rect.x1 - rect.x0);
    const height = Math.max(1, rect.y1 - rect.y0);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return '';
    }
    ctx.drawImage(img, rect.x0, rect.y0, width, height, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  }

  /** Converts the accepted detected fields into canvas-ready elements. Uses a single
   *  uniform scale factor (never independent X/Y scales) so font size, line spacing and
   *  alignment stay in the same proportion as the source photo instead of stretching or
   *  squashing to fill the target size; if the target's aspect ratio differs from the
   *  photo's, the laid-out content is centered (letterboxed) rather than distorted.
   *  A final overlap-resolution pass then shrinks any boxes that would otherwise collide. */
  toElements(fields: DetectedField[], imageWidth: number, imageHeight: number, targetMm: { width: number; height: number }): LabelElement[] {
    const canvasWidth = targetMm.width * MM_TO_PX;
    const canvasHeight = targetMm.height * MM_TO_PX;
    const scale = imageWidth > 0 && imageHeight > 0
      ? Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight)
      : 1;
    const offsetX = (canvasWidth - imageWidth * scale) / 2;
    const offsetY = (canvasHeight - imageHeight * scale) / 2;

    const MIN_WIDTH = 14;
    const MIN_HEIGHT = 10;
    const MIN_BARCODE_WIDTH = 90;

    const elements: LabelElement[] = [];

    fields.filter(field => field.include).forEach((field, index) => {
      const bw = Math.max(1, field.bbox.x1 - field.bbox.x0);
      const bh = Math.max(1, field.bbox.y1 - field.bbox.y0);

      let width = Math.round(bw * scale);
      let height = Math.round(bh * scale);
      let x = Math.round(offsetX + field.bbox.x0 * scale);
      let y = Math.round(offsetY + field.bbox.y0 * scale);

      if (field.type !== 'barcode' && field.type !== 'image' && field.type !== 'qr' && field.value) {
        // The box was measured from the ORIGINAL printed text (e.g. "FSSAI: 12345678"),
        // but we render "prefix + value" using our own template (e.g. "FSSAI No: 12345678"),
        // which can be longer than what was actually on the label. Widen proportionally so
        // the substituted text isn't clipped by the box sized for the shorter original.
        const renderedLength = (field.prefix + field.value).length;
        const originalLength = field.rawText.length;
        if (originalLength > 0 && renderedLength > originalLength * 1.05) {
          const ratio = Math.min(2.2, renderedLength / originalLength);
          width = Math.round(width * ratio);
        }
      }

      if (field.type === 'barcode' && !field.fromImageDetection) {
        // Fallback path: we only have the OCR'd human-readable number, not the actual
        // bars (pixel analysis found no bar pattern), so reserve space above it to
        // approximate where the bars would be — but never grow past whatever's already
        // been placed directly above it. When fromImageDetection is true, field.bbox is
        // already the real, pixel-detected bar region and needs no such guesswork.
        let ceiling = 0;
        for (const placed of elements) {
          const xOverlap = x < placed.x + placed.width && placed.x < x + width;
          if (xOverlap && placed.y + placed.height <= y) {
            ceiling = Math.max(ceiling, placed.y + placed.height);
          }
        }
        const desiredBars = Math.round(height * 1.8);
        const barsHeight = Math.max(0, Math.min(desiredBars, y - ceiling - 2));
        height += barsHeight;
        y -= barsHeight;
      }
      if (field.type === 'barcode') {
        width = Math.max(width, MIN_BARCODE_WIDTH);
      }

      width = Math.max(MIN_WIDTH, Math.min(width, canvasWidth));
      height = Math.max(MIN_HEIGHT, Math.min(height, canvasHeight));
      x = Math.max(0, Math.min(x, Math.max(0, canvasWidth - width)));
      y = Math.max(0, Math.min(y, Math.max(0, canvasHeight - height)));

      const glyphHeightPx = field.glyphHeightPx ?? bh * 0.72;
      const fontSize = Math.max(7, Math.min(60, Math.round(glyphHeightPx * scale * 0.95)));

      const element: LabelElement = {
        id: `element-${field.type}-${Date.now()}-${index}`,
        type: field.type,
        label: field.label,
        value: field.value,
        prefix: field.prefix,
        width,
        height,
        x,
        y,
        visible: true,
        style: {
          fontSize,
          fontWeight: field.type === 'productName' || field.type === 'salePrice' ? 'bold' : 'normal',
          color: '#0f172a',
          textAlign: this.inferAlign(field.bbox, imageWidth),
          padding: '1px 3px',
          lineHeight: 1.05,
          ...(field.type === 'barcode' ? { backgroundColor: '#ffffff' } : {})
        }
      };

      if (field.type === 'barcode') {
        element.barcodeFormat = 'CODE128';
      }

      if (field.type === 'image' && field.imageSrc) {
        element.imageSrc = field.imageSrc;
        element.maintainAspectRatio = true;
        element.style = { ...element.style, backgroundColor: '#ffffff', objectFit: 'contain' };
      }

      elements.push(element);
    });

    this.resolveOverlaps(elements);

    // Re-fit font sizes to any box that got shrunk during overlap resolution so text
    // isn't visually clipped by the box's own overflow:hidden.
    elements.forEach(element => {
      if (element.type === 'barcode' || element.type === 'qr' || element.type === 'image' || !element.style?.fontSize) {
        return;
      }
      const maxFontSize = Math.max(7, element.height - 4);
      if (element.style.fontSize > maxFontSize) {
        element.style = { ...element.style, fontSize: maxFontSize };
      }
    });

    return elements;
  }

  /** Infers left/center/right alignment for a line by comparing its horizontal
   *  center to the source image's center, mirroring how it actually sits in the photo. */
  private inferAlign(bbox: { x0: number; x1: number }, imageWidth: number): 'left' | 'center' | 'right' {
    if (imageWidth <= 0) {
      return 'center';
    }
    const lineCenter = (bbox.x0 + bbox.x1) / 2;
    const imageCenter = imageWidth / 2;
    const offsetRatio = Math.abs(lineCenter - imageCenter) / imageWidth;
    if (offsetRatio < 0.08) {
      return 'center';
    }
    return lineCenter < imageCenter ? 'left' : 'right';
  }

  /** Shrinks (never moves) element boxes so none visually overlap: first clamps each
   *  element's height against the nearest element below it that shares its x-range,
   *  then clamps width against the nearest element to its right that shares its y-range.
   *  Positions are preserved so alignment relative to the source photo stays intact. */
  private resolveOverlaps(elements: LabelElement[]): void {
    const BUFFER = 1;

    elements.forEach(element => {
      let maxBottom = Infinity;
      elements.forEach(other => {
        if (other === element || other.y <= element.y) {
          return;
        }
        const xOverlap = element.x < other.x + other.width && other.x < element.x + element.width;
        if (xOverlap) {
          maxBottom = Math.min(maxBottom, other.y);
        }
      });
      if (maxBottom < Infinity) {
        const allowed = maxBottom - element.y - BUFFER;
        if (allowed > 4 && allowed < element.height) {
          element.height = allowed;
        }
      }
    });

    elements.forEach(element => {
      let maxRight = Infinity;
      elements.forEach(other => {
        if (other === element || other.x <= element.x) {
          return;
        }
        const yOverlap = element.y < other.y + other.height && other.y < element.y + element.height;
        if (yOverlap) {
          maxRight = Math.min(maxRight, other.x);
        }
      });
      if (maxRight < Infinity) {
        const allowed = maxRight - element.x - BUFFER;
        if (allowed > 8 && allowed < element.width) {
          element.width = allowed;
        }
      }
    });
  }

  /** Suggests a matching label size (mm) from the uploaded image's aspect ratio,
   *  anchored to a sensible printable width. */
  suggestSizeMm(imageWidth: number, imageHeight: number): LabelDimensions {
    const width = 50;
    const height = imageWidth > 0 ? Math.round((imageHeight / imageWidth) * width) : 40;
    return { width, height: Math.max(20, Math.min(150, height)), horizontalGap: 0, verticalGap: 0 };
  }

  /** Classifies OCR'd lines into typed fields. Every line becomes a field — nothing is
   *  ever silently dropped, even OCR garbage from misreading the barcode's bars, since a
   *  wrong guess the user can delete is better than text that quietly vanished. When a
   *  barcode graphic was found by pixel analysis, a clean digit-string line near it
   *  becomes that barcode's value instead of its own field (so the barcode yields exactly
   *  one element); anything else overlapping the bars is kept as a plain text field so the
   *  user can see and judge it themselves rather than having it disappear. */
  private classify(lines: OcrLine[], barcodeBox?: Rect): DetectedField[] {
    const fields: DetectedField[] = [];
    const unclassified: OcrLine[] = [];

    lines.forEach(line => {
      const digitsOnly = line.text.replace(/\s+/g, '');
      const isCleanDigits = DIGITS_ONLY_RE.test(digitsOnly);

      if (barcodeBox && !isCleanDigits && overlapFraction(line.bbox, barcodeBox) > 0.5) {
        // Likely OCR noise from misreading the bars as glyphs, but keep it visible as
        // plain text rather than guessing it away — the user can delete it if it's junk.
        fields.push(this.makeField('text', line, line.text));
        return;
      }

      const rule = RULES.find(candidate => candidate.test.test(line.text));
      if (rule) {
        const value = rule.extract(line.text).trim() || line.text;
        fields.push(this.makeField(rule.type, line, value));
        return;
      }

      if (isCleanDigits) {
        fields.push(this.makeField('barcode', line, digitsOnly));
        return;
      }

      unclassified.push(line);
    });

    // Pull out a short alphanumeric code sitting right under/over the barcode (e.g. a SKU
    // like "20830A" that isn't a clean 8-14 digit run) before company/product-name pick
    // from the same unclassified pool, so it isn't mistaken for either of those. Picks the
    // CLOSEST qualifying line, not just the first one in reading order — a company name
    // sitting well above the barcode can still fall inside the generous proximity margin,
    // and being earlier in the array must not let it beat a line that's actually adjacent.
    let nearBarcodeText: OcrLine | undefined;
    if (barcodeBox) {
      const candidates = unclassified
        .map((line, idx) => ({ line, idx, score: this.barcodeProximityScore(line.bbox, barcodeBox) }))
        .filter((c): c is { line: OcrLine; idx: number; score: number } =>
          c.score !== null && c.line.text.replace(/\s+/g, '').length <= 20
        )
        .sort((a, b) => a.score - b.score);
      if (candidates.length) {
        nearBarcodeText = candidates[0].line;
        unclassified.splice(candidates[0].idx, 1);
      }
    }

    const remaining = [...unclassified];

    if (remaining.length && !fields.some(f => f.type === 'companyName')) {
      remaining.sort((a, b) => a.bbox.y0 - b.bbox.y0);
      const top = remaining.shift()!;
      fields.push(this.makeField('companyName', top, top.text));
    }

    if (remaining.length && !fields.some(f => f.type === 'productName')) {
      remaining.sort((a, b) => (b.bbox.y1 - b.bbox.y0) - (a.bbox.y1 - a.bbox.y0));
      const biggest = remaining.shift()!;
      fields.push(this.makeField('productName', biggest, biggest.text));
    }

    remaining.forEach(line => fields.push(this.makeField('text', line, line.text)));

    if (barcodeBox) {
      // Only a digit line actually near the bars (below/above/overlapping, sharing its
      // x-range) is the bars' own printed number — an unrelated digit string elsewhere
      // on the label (e.g. a batch ID) stays its own separate barcode-type field. Prefer
      // that clean digit reading; fall back to the alphanumeric code pulled out above
      // (e.g. "20830A") if that's all there was. Again: closest match wins, not first.
      const barcodeFieldCandidates = fields
        .filter(f => f.type === 'barcode')
        .map(f => ({ field: f, score: this.barcodeProximityScore(f.bbox, barcodeBox) }))
        .filter((c): c is { field: DetectedField; score: number } => c.score !== null)
        .sort((a, b) => a.score - b.score);
      const ocrBarcodeField = barcodeFieldCandidates[0]?.field;
      const withoutOcrBarcode = fields.filter(f => f !== ocrBarcodeField);
      const value = ocrBarcodeField?.value ?? nearBarcodeText?.text ?? '';
      const merged = this.makeField('barcode', { text: value, bbox: barcodeBox }, value);
      merged.rawText = ocrBarcodeField?.rawText ?? nearBarcodeText?.text ?? 'Barcode graphic (no readable number)';
      merged.fromImageDetection = true;
      withoutOcrBarcode.push(merged);
      return withoutOcrBarcode;
    }

    return fields;
  }

  /** Lower is closer/better; null means not a candidate at all. Requires horizontal overlap
   *  with the barcode (the number is printed under/over the bars, not off to the side), and
   *  strongly prefers a line below the bars over one above them — real labels overwhelmingly
   *  print the human-readable number underneath, so a company name or heading that happens to
   *  sit just within the margin above the bars shouldn't out-rank the line actually below. */
  private barcodeProximityScore(bbox: Rect, barcodeBox: Rect): number | null {
    const xOverlap = bbox.x0 < barcodeBox.x1 && barcodeBox.x0 < bbox.x1;
    if (!xOverlap) {
      return null;
    }
    if (bbox.y0 < barcodeBox.y1 && barcodeBox.y0 < bbox.y1) {
      return 0; // directly overlapping the band
    }
    const barcodeHeight = barcodeBox.y1 - barcodeBox.y0;
    const margin = Math.max(20, barcodeHeight * 0.6);

    if (bbox.y0 >= barcodeBox.y1 - 4) {
      const gap = bbox.y0 - barcodeBox.y1;
      return gap <= margin ? gap : null;
    }
    if (bbox.y1 <= barcodeBox.y0 + 4) {
      const gap = barcodeBox.y0 - bbox.y1;
      return gap <= margin ? gap + 1000 : null; // heavy penalty: below always wins over above
    }
    return null;
  }

  private makeField(type: LabelElementType, line: OcrLine, value: string): DetectedField {
    return {
      id: `detected-${type}-${line.bbox.x0}-${line.bbox.y0}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      rawText: line.text,
      value,
      label: TYPE_LABELS[type] ?? 'Text',
      prefix: LABEL_ELEMENT_PREFIXES[type] ?? '',
      include: true,
      bbox: line.bbox,
      glyphHeightPx: line.glyphHeightPx
    };
  }

  private makeImageField(rect: Rect, imageSrc: string): DetectedField {
    return {
      id: `detected-image-${rect.x0}-${rect.y0}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'image',
      rawText: 'Image detected in photo',
      value: '',
      label: 'Image',
      prefix: '',
      include: true,
      bbox: rect,
      imageSrc,
      fromImageDetection: true
    };
  }

  private loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        resolve(img);
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not load image'));
      };
      img.src = url;
    });
  }
}
