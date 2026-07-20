import { LabelElement, LabelField } from './label-element.model';
import { LabelSettings } from './label.model';

export interface LabelTemplate {
  id: string;
  name: string;
  description: string;
  defaultSettings: LabelSettings;
  elements: LabelElement[];
  fields: LabelField[];
}

export interface LabelTemplateSummary {
  id: string;
  name: string;
  description: string;
}
