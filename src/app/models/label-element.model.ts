export type LabelElementType =
  | 'text'
  | 'productName'
  | 'companyName'
  | 'brand'
  | 'category'
  | 'mrp'
  | 'salePrice'
  | 'offerPrice'
  | 'offerYouSave'
  | 'offer'
  | 'ratePer'
  | 'fssai'
  | 'pkdOn'
  | 'expiryDate'
  | 'batch'
  | 'bestBefore'
  | 'line1'
  | 'line2'
  | 'barcode'
  | 'qr'
  | 'logo'
  | 'rectangle'
  | 'line'
  | 'image';

/**
 * Default context prefix shown before an element's value, e.g. a "fssai" element
 * renders as "FSSAI No: <value>". Elements without an entry render just the value.
 * Per-element overrides live on LabelElement.prefix.
 */
export const LABEL_ELEMENT_PREFIXES: Partial<Record<LabelElementType, string>> = {
  mrp: 'MRP: ',
  salePrice: 'SP: ',
  offerPrice: 'Offer Price: ',
  offerYouSave: 'You Save: ',
  ratePer: 'Rate Per: ',
  fssai: 'FSSAI No: ',
  pkdOn: 'Pkd on: ',
  expiryDate: 'Exp Date: ',
  batch: 'Batch: ',
  bestBefore: 'Best Before: ',
  category: 'Category: '
};

export interface LabelElementStyle {
  fontSize?: number;
  fontWeight?: 'normal' | 'bold' | 'bolder';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline' | 'line-through' | 'underline line-through';
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
  color?: string;
  backgroundColor?: string;
  borderWidth?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
  borderColor?: string;
  borderRadius?: number;
  opacity?: number;
  rotation?: number;
  padding?: string;
  margin?: string;
  lineHeight?: number;
  /** Object-fit for image elements */
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
}

export interface LabelElement {
  id: string;
  type: LabelElementType;
  label: string;
  value?: string;
  /** Context template shown before the value, e.g. "FSSAI No: ". Defaults from LABEL_ELEMENT_PREFIXES by type. */
  prefix?: string;
  /** Base64 data URL or image path for image elements */
  imageSrc?: string;
  /** Whether to maintain aspect ratio on resize */
  maintainAspectRatio?: boolean;
  barcodeFormat?: 'CODE128' | 'EAN13' | 'UPC';
  qrErrorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  width: number;
  height: number;
  x: number;
  y: number;
  visible: boolean;
  locked?: boolean;
  zIndex?: number;
  /** Rotation in degrees (0-360) */
  rotation?: number;
  /** Horizontal scale applied to the rendered content (1 = original) */
  scaleX?: number;
  /** Vertical scale applied to the rendered content (1 = original) */
  scaleY?: number;
  style?: LabelElementStyle;
}

export interface LabelField {
  id: string;
  name: string;
  label: string;
  enabled: boolean;
}