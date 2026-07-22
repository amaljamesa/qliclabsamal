import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SortDirection } from './excel-table-filter';

@Component({
  selector: 'app-column-filter-menu',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './column-filter-menu.component.html',
  styleUrls: ['./column-filter-menu.component.css'],
})
export class ColumnFilterMenuComponent implements OnChanges {
  @Input() values: string[] = [];
  @Input() selected: Set<string> | null = null;
  @Input() sort: SortDirection = null;

  @Output() sortChange = new EventEmitter<SortDirection>();
  @Output() filterApply = new EventEmitter<Set<string> | null>();
  @Output() closed = new EventEmitter<void>();

  searchText = '';
  draftSelected = new Set<string>();

  ngOnChanges(): void {
    this.draftSelected = this.selected ? new Set(this.selected) : new Set(this.values);
  }

  get filteredValues(): string[] {
    const query = this.searchText.trim().toLowerCase();
    if (!query) return this.values;
    return this.values.filter((v) => v.toLowerCase().includes(query));
  }

  get allChecked(): boolean {
    const list = this.filteredValues;
    return list.length > 0 && list.every((v) => this.draftSelected.has(v));
  }

  toggleAll(checked: boolean): void {
    for (const v of this.filteredValues) {
      if (checked) this.draftSelected.add(v);
      else this.draftSelected.delete(v);
    }
  }

  toggleValue(value: string, checked: boolean): void {
    if (checked) this.draftSelected.add(value);
    else this.draftSelected.delete(value);
  }

  sortAsc(): void {
    this.sortChange.emit('asc');
    this.closed.emit();
  }

  sortDesc(): void {
    this.sortChange.emit('desc');
    this.closed.emit();
  }

  applyFilter(): void {
    const allSelected = this.values.length > 0 && this.values.every((v) => this.draftSelected.has(v));
    this.filterApply.emit(allSelected ? null : new Set(this.draftSelected));
    this.closed.emit();
  }

  clearFilter(): void {
    this.filterApply.emit(null);
    this.closed.emit();
  }

  cancel(): void {
    this.closed.emit();
  }

  stopClose(event: Event): void {
    event.stopPropagation();
  }
}
