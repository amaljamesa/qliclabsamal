import { LABEL_ELEMENT_PREFIXES, LabelElement, LabelElementType } from './label-element.model';

/** The set of content fields exposed as toggleable checkboxes in both the main
 *  "Barcode Design Fields" panel and the extended preview's sidebar, so the two stay
 *  in lockstep without hand-copying the list twice. */
export const BARCODE_DESIGN_FIELD_TYPES: LabelElementType[] = [
  'productName', 'brand', 'category', 'mrp', 'salePrice', 'offerPrice', 'offerYouSave',
  'offer', 'ratePer', 'barcode', 'pkdOn', 'expiryDate', 'batch', 'bestBefore',
  'companyName', 'fssai', 'line1', 'line2'
];

/** 'barcode' renders its numeric text at a fixed size (see NgxBarcode6's bc-font-size),
 *  so a font-size control for it wouldn't visibly do anything. */
export function fieldSupportsFontSize(type: LabelElementType): boolean {
  return type !== 'barcode';
}

export function displayLabelForType(type: LabelElementType): string {
  switch (type) {
    case 'text':
      return 'Text';
    case 'productName':
      return 'Product Name';
    case 'companyName':
      return 'Company Name';
    case 'brand':
      return 'Brand';
    case 'category':
      return 'Category';
    case 'mrp':
      return 'MRP';
    case 'salePrice':
      return 'Sale Price';
    case 'offerPrice':
      return 'Offer Price';
    case 'offerYouSave':
      return 'You Save';
    case 'offer':
      return 'Offer';
    case 'ratePer':
      return 'Rate Per';
    case 'fssai':
      return 'FSSAI No';
    case 'pkdOn':
      return 'Packed On';
    case 'expiryDate':
      return 'Expiry Date';
    case 'batch':
      return 'Batch No';
    case 'bestBefore':
      return 'Best Before';
    case 'line1':
      return 'Line 1';
    case 'line2':
      return 'Line 2';
    case 'barcode':
      return 'Barcode Placeholder';
    case 'qr':
      return 'QR Placeholder';
    case 'logo':
      return 'Logo Placeholder';
    case 'image':
      return 'Image';
    case 'rectangle':
      return 'Rectangle';
    case 'line':
      return 'Line';
    default:
      return 'Element';
  }
}

export function createLabelElement(type: LabelElementType): LabelElement {
  const id = `element-${type}-${Date.now()}`;

  const base = {
    id,
    type,
    label: displayLabelForType(type),
    prefix: LABEL_ELEMENT_PREFIXES[type] ?? '',
    width: 160,
    height: 32,
    x: 12,
    y: 12,
    visible: true,
    style: {
      fontSize: 13,
      fontWeight: 'normal',
      color: '#0f172a'
    }
  } as LabelElement;

  switch (type) {
    case 'barcode':
      return {
        ...base,
        width: 180,
        height: 72,
        value: '123456789012',
        barcodeFormat: 'CODE128',
        style: {
          ...base.style,
          backgroundColor: '#ffffff'
        }
      };
    case 'qr':
      return {
        ...base,
        width: 100,
        height: 100,
        value: 'https://qliclabs.com',
        qrErrorCorrectionLevel: 'M',
        style: {
          ...base.style,
          backgroundColor: '#ffffff',
          borderColor: '#cbd5e1'
        }
      };
    case 'logo':
      return {
        ...base,
        width: 120,
        height: 60,
        label: 'Logo Placeholder',
        style: {
          ...base.style,
          backgroundColor: '#e2e8f0',
          borderColor: '#cbd5e1'
        }
      };
    case 'image':
      return {
        ...base,
        width: 120,
        height: 120,
        label: 'Image',
        maintainAspectRatio: true,
        imageSrc: undefined,
        style: {
          ...base.style,
          backgroundColor: '#f1f5f9',
          borderColor: '#cbd5e1',
          objectFit: 'contain' as 'contain'
        }
      };
    case 'rectangle':
      return {
        ...base,
        height: 80,
        label: 'Rectangle',
        style: {
          ...base.style,
          backgroundColor: '#f8fafc',
          borderColor: '#94a3b8'
        }
      };
    case 'line':
      return {
        ...base,
        width: 180,
        height: 4,
        label: '',
        style: {
          ...base.style,
          backgroundColor: '#0f172a'
        }
      };
    case 'text':
    case 'productName':
    case 'companyName':
    case 'brand':
    case 'mrp':
    case 'salePrice':
    case 'offerPrice':
    case 'offer':
    default:
      return {
        ...base,
        label: displayLabelForType(type),
        style: {
          ...base.style,
          fontWeight: 'bold'
        }
      };
  }
}

/** Picks a spot for a newly added element that doesn't land on top of existing ones:
 *  starting from the default top-left corner, keeps stepping down past whatever it
 *  would currently overlap until it finds (or runs out of canvas for) a clear spot. */
export function findFreeElementPosition(
  elements: LabelElement[],
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  const gap = 6;
  const x = 12;
  let y = 12;

  const overlapsAt = (candidateY: number) =>
    elements.some(el =>
      x < el.x + el.width && el.x < x + width &&
      candidateY < el.y + el.height && el.y < candidateY + height
    );

  for (let i = 0; i < 40 && overlapsAt(y); i++) {
    const blocker = elements
      .filter(el => x < el.x + el.width && el.x < x + width && el.y + el.height > y)
      .sort((a, b) => a.y - b.y)[0];
    y = blocker ? blocker.y + blocker.height + gap : y + height + gap;
  }

  return {
    x: Math.max(0, Math.min(x, Math.max(0, canvasWidth - width))),
    y: Math.max(0, Math.min(y, Math.max(0, canvasHeight - height)))
  };
}
