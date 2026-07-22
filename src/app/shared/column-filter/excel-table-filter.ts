export type SortDirection = 'asc' | 'desc' | null;

export interface ColumnFilterState {
  sort: SortDirection;
  /** null means "no filter applied" (every value visible) */
  selected: Set<string> | null;
}

/**
 * Excel-style per-column filter + single-column sort for an in-memory row array.
 * Instantiate one per table, register a string accessor per filterable/sortable
 * column, then call `apply(rows)` to get the filtered + sorted result.
 */
export class ExcelTableFilter<T> {
  private accessors = new Map<string, (row: T) => string>();
  private states = new Map<string, ColumnFilterState>();
  private sortColumn: string | null = null;

  // Cached per-column distinct value lists. The filter menu's [values] input
  // must stay reference-stable across change-detection cycles: recomputing a
  // fresh array in a template getter makes Angular think the input changed on
  // every tick, re-running ngOnChanges and wiping out in-progress selections.
  private valuesCache = new Map<string, string[]>();

  registerColumn(key: string, accessor: (row: T) => string): void {
    this.accessors.set(key, accessor);
    if (!this.states.has(key)) {
      this.states.set(key, { sort: null, selected: null });
    }
  }

  getState(key: string): ColumnFilterState {
    return this.states.get(key) ?? { sort: null, selected: null };
  }

  isFiltered(key: string): boolean {
    return this.getState(key).selected !== null;
  }

  /** Recompute the cached distinct values for every registered column. Call whenever the source rows change. */
  refreshValues(rows: T[]): void {
    for (const [key, accessor] of this.accessors) {
      const values = new Set<string>();
      for (const row of rows) values.add(accessor(row));
      this.valuesCache.set(
        key,
        Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      );
    }
  }

  getValues(key: string): string[] {
    return this.valuesCache.get(key) ?? [];
  }

  setFilter(key: string, selected: Set<string> | null): void {
    this.states.set(key, { ...this.getState(key), selected });
  }

  clearFilter(key: string): void {
    this.setFilter(key, null);
  }

  clearAllFilters(): void {
    for (const key of this.states.keys()) {
      this.setFilter(key, null);
    }
  }

  setSort(key: string, direction: SortDirection): void {
    for (const [k, state] of this.states) {
      if (k !== key && state.sort) {
        this.states.set(k, { ...state, sort: null });
      }
    }
    this.sortColumn = direction ? key : null;
    this.states.set(key, { ...this.getState(key), sort: direction });
  }

  apply(rows: T[]): T[] {
    let result = rows;

    if (this.states.size > 0) {
      result = result.filter((row) => {
        for (const [key, accessor] of this.accessors) {
          const selected = this.states.get(key)?.selected;
          if (selected && !selected.has(accessor(row))) {
            return false;
          }
        }
        return true;
      });
    }

    if (this.sortColumn) {
      const accessor = this.accessors.get(this.sortColumn);
      const direction = this.getState(this.sortColumn).sort;
      if (accessor && direction) {
        result = [...result].sort((a, b) => {
          const cmp = accessor(a).localeCompare(accessor(b), undefined, {
            numeric: true,
            sensitivity: 'base',
          });
          return direction === 'desc' ? -cmp : cmp;
        });
      }
    }

    return result;
  }
}
