import { LabelElement, LabelField } from './label-element.model';

export interface LabelDimensions {
  width: number;
  height: number;
  horizontalGap: number;
  verticalGap: number;
}

export interface PageMargins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface FontSettings {
  headingSize: number;
  bodySize: number;
  captionSize: number;
}

export interface LabelSettings {
  layoutName: string;
  printerType: 'Roll' | 'Sheet';
  rows: number;
  columns: number;
  dimensions: LabelDimensions;
  margins: PageMargins;
  fontSettings: FontSettings;
}

export interface LabelMetadata {
  createdAt: string;
  updatedAt: string;
}

export interface Label {
  id: string;
  name: string;
  templateId?: string;
  settings: LabelSettings;
  elements: LabelElement[];
  fields: LabelField[];
  metadata: LabelMetadata;
}
