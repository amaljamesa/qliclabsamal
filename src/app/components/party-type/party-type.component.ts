import { Component, HostListener, OnInit } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { DataService, PartyType } from '../../services/data.service';
import { ExcelTableFilter, SortDirection } from '../../shared/column-filter/excel-table-filter';
import { ColumnFilterMenuComponent } from '../../shared/column-filter/column-filter-menu.component';

@Component({
  selector: 'app-party-type',
  standalone: true,
  imports: [FormsModule, ColumnFilterMenuComponent],
  templateUrl: './party-type.component.html',
  styleUrls: ['./party-type.component.css']
})
export class PartyTypeComponent implements OnInit {
  partyTypes: PartyType[] = [];
  displayedPartyTypes: PartyType[] = [];
  searchQuery = '';

  tableFilter = new ExcelTableFilter<PartyType>();
  openFilterColumn: string | null = null;

  // Modal State
  showModal = false;
  modalTitle = 'Add Party Type';
  partyName = '';
  partyPrintName = '';
  editingPartyId: number | null = null;

  constructor(private dataService: DataService) {
    this.tableFilter.registerColumn('id', (p) => String(p.id));
    this.tableFilter.registerColumn('name', (p) => p.name);
    this.tableFilter.registerColumn('printName', (p) => p.printName);
  }

  ngOnInit(): void {
    this.loadPartyTypes();
  }

  loadPartyTypes(): void {
    this.partyTypes = this.dataService.getPartyTypes(this.searchQuery);
    this.tableFilter.refreshValues(this.partyTypes);
    this.refreshDisplayed();
  }

  refreshDisplayed(): void {
    this.displayedPartyTypes = this.tableFilter.apply(this.partyTypes);
  }

  columnValues(key: string): string[] {
    return this.tableFilter.getValues(key);
  }

  isColumnFiltered(key: string): boolean {
    return this.tableFilter.isFiltered(key);
  }

  columnSort(key: string): SortDirection {
    return this.tableFilter.getState(key).sort;
  }

  columnSelected(key: string): Set<string> | null {
    return this.tableFilter.getState(key).selected;
  }

  toggleFilterMenu(key: string, event: Event): void {
    event.stopPropagation();
    this.openFilterColumn = this.openFilterColumn === key ? null : key;
  }

  onSortChange(key: string, direction: SortDirection): void {
    this.tableFilter.setSort(key, direction);
    this.refreshDisplayed();
  }

  onFilterApply(key: string, selected: Set<string> | null): void {
    this.tableFilter.setFilter(key, selected);
    this.refreshDisplayed();
  }

  @HostListener('document:click')
  closeFilterMenu(): void {
    this.openFilterColumn = null;
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
      this.dataService.updatePartyType(this.editingPartyId, this.partyName, this.partyPrintName || this.partyName);
    } else {
      this.dataService.addPartyType(this.partyName, this.partyPrintName || this.partyName);
    }

    this.closeModal();
    this.loadPartyTypes();
  }
}
