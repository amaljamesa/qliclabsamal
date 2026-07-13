import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService, PartyType } from '../../services/data.service';

@Component({
  selector: 'app-party-type',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './party-type.component.html',
  styleUrls: ['./party-type.component.css']
})
export class PartyTypeComponent implements OnInit {
  partyTypes: PartyType[] = [];
  searchQuery = '';

  // Modal State
  showModal = false;
  modalTitle = 'Add Party Type';
  partyName = '';
  partyPrintName = '';
  editingPartyId: number | null = null;

  constructor(private dataService: DataService) {}

  ngOnInit(): void {
    this.loadPartyTypes();
  }

  loadPartyTypes(): void {
    this.partyTypes = this.dataService.getPartyTypes(this.searchQuery);
  }

  onSearch(): void {
    this.loadPartyTypes();
  }

  openAddModal(): void {
    this.modalTitle = 'Add Party Type';
    this.partyName = '';
    this.partyPrintName = '';
    this.editingPartyId = null;
    this.showModal = true;
  }

  openEditModal(party: PartyType, event: Event): void {
    event.stopPropagation();
    this.modalTitle = 'Edit Party Type';
    this.partyName = party.name;
    this.partyPrintName = party.printName;
    this.editingPartyId = party.id;
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
  }

  savePartyType(): void {
    if (!this.partyName.trim()) {
      alert('Please enter a party type name');
      return;
    }

    if (this.editingPartyId !== null) {
      // Edit
      this.dataService.updatePartyType(this.editingPartyId, this.partyName, this.partyPrintName || this.partyName);
    } else {
      // Add
      this.dataService.addPartyType(this.partyName, this.partyPrintName || this.partyName);
    }

    this.closeModal();
    this.loadPartyTypes();
  }

  deleteParty(id: number, event: Event): void {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this party type?')) {
      this.dataService.deletePartyType(id);
      this.loadPartyTypes();
    }
  }
}
