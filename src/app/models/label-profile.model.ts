import { Label } from './label.model';

export interface LabelProfile {
  id: string;
  name: string;
  default: boolean;
  label: Label;
}
