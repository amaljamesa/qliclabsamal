import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LabelProfile } from '../../../models/label-profile.model';
import { LabelTemplate } from '../../../models/label-template.model';
import { Label } from '../../../models/label.model';

@Component({
  selector: 'app-label-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './label-sidebar.component.html',
  styleUrls: ['./label-sidebar.component.css']
})
export class LabelSidebarComponent {
  @Input() profiles: LabelProfile[] = [];
  @Input() templates: LabelTemplate[] = [];
  @Input() selectedProfileId = '';
  @Input() selectedTemplateId = '';
  @Input() savedLabels: Label[] = [];
  @Input() selectedSavedLabelId = '';

  @Output() selectProfile = new EventEmitter<string>();
  @Output() createProfile = new EventEmitter<void>();
  @Output() renameProfile = new EventEmitter<string>();
  @Output() deleteProfile = new EventEmitter<string>();
  @Output() setDefaultProfile = new EventEmitter<string>();

  @Output() selectTemplate = new EventEmitter<string>();
  @Output() createTemplate = new EventEmitter<void>();
  @Output() duplicateTemplate = new EventEmitter<string>();
  @Output() loadTemplate = new EventEmitter<string>();
  @Output() saveTemplate = new EventEmitter<void>();
  @Output() loadSavedLabel = new EventEmitter<string>();
  @Output() deleteSavedLabel = new EventEmitter<string>();

  onSelectProfile(profileId: string): void {
    this.selectProfile.emit(profileId);
  }

  onCreateProfile(): void {
    this.createProfile.emit();
  }

  onRenameProfile(profileId: string): void {
    this.renameProfile.emit(profileId);
  }

  onDeleteProfile(profileId: string): void {
    this.deleteProfile.emit(profileId);
  }

  onSetDefaultProfile(profileId: string): void {
    this.setDefaultProfile.emit(profileId);
  }

  onSelectTemplate(templateId: string): void {
    this.selectTemplate.emit(templateId);
  }

  onCreateTemplate(): void {
    this.createTemplate.emit();
  }

  onDuplicateTemplate(templateId: string): void {
    this.duplicateTemplate.emit(templateId);
  }

  onLoadTemplate(templateId: string): void {
    this.loadTemplate.emit(templateId);
  }

  onSaveTemplate(): void {
    this.saveTemplate.emit();
  }

  onLoadSavedLabel(labelId: string): void {
    this.loadSavedLabel.emit(labelId);
  }

  onDeleteSavedLabel(labelId: string): void {
    this.deleteSavedLabel.emit(labelId);
  }
}
