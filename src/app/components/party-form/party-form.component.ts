import { Component } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PartyDraft } from '../../models/party.model';
import { PartyService } from '../../services/party.service';

@Component({
  selector: 'app-party-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './party-form.component.html',
  styleUrls: ['./party-form.component.css']
})
export class PartyFormComponent {
  branchTitle = 'Eprise Activity - Bejai';

  saving = false;
  errorMessage = '';
  savedName = '';

  party: PartyDraft = {
    name: '',
    tallyExportName: '',
    shortName: '',
    alias: '',
    address: '',
    state: 'Karnataka',
    pincode: '',
    partyType: 'N/A',
    email: '',
    cellphone: '',
    landLine: '',
    appearUnder: 'Personal',
    inwardTax: 'Exclusive- E',
    branch: 'Eprise Activity - Bejai',
    enablePortal: false,

    pan: '',
    gstSupplyType: 'Regular',
    gstin: '',

    createLedger: true,
    openingBalance: 0,
    balanceType: 'Nil Balance',
    dueInDaysType: 'Default from Settings',

    regionName: '',
    areaName: '',
    route: '',

    fromDate: this.formatDate(new Date()),
    toDate: this.formatDate(new Date()),
    active: true,

    transactions: 'Inward & Outward',
    servicedBy: 'EPrise',
    smartTags: ''
  };

  constructor(private router: Router, private location: Location, private partyService: PartyService) {}

  private formatDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    return `${day}-${month}-${date.getFullYear()}`;
  }

  get fetchDisabled(): boolean {
    return !this.party.gstin.trim();
  }

  get balanceTypeDisabled(): boolean {
    return !this.party.openingBalance;
  }

  get toDateDisabled(): boolean {
    return this.party.active;
  }

  fetchGstin(): void {}

  fillGstin(): void {}

  goBack(): void {
    this.location.back();
  }

  async save(): Promise<void> {
    if (this.saving) {
      return;
    }
    if (!this.party.name.trim()) {
      this.errorMessage = 'Name is required.';
      this.savedName = '';
      return;
    }

    this.saving = true;
    this.errorMessage = '';
    try {
      const saved = await this.partyService.create(this.party);
      this.savedName = saved.name;
    } catch {
      this.errorMessage = 'Could not save the party. Please try again.';
    } finally {
      this.saving = false;
    }
  }

  cancel(): void {
    this.router.navigateByUrl('/dashboard');
  }
}
