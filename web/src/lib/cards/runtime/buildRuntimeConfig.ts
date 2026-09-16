/**
 * Helpers to build the filter/sort configuration passed to useCardData()
 * from a card's declarative definition.
 */

import { CardColumnDefinition, CardFilterDefinition } from '../types'
import { SortDirection } from '../cardHooks'

export function buildFilterConfig(filterDefs: CardFilterDefinition[] | undefined) {
  const searchFields: string[] = []
  let clusterField: string | undefined
  let statusField: string | undefined

  filterDefs?.forEach(f => {
    if (f.type === 'text' && f.searchFields) {
      searchFields.push(...f.searchFields)
    }
    if (f.field === 'cluster') clusterField = 'cluster'
    if (f.field === 'status') statusField = 'status'
  })

  return {
    searchFields: searchFields.length > 0 ? searchFields : ['name', 'namespace'],
    clusterField,
    statusField }
}

export function buildSortConfig(columns: CardColumnDefinition[] | undefined) {
  const sortableColumns = columns?.filter(c => c.sortable !== false) || []
  const comparators: Record<string, (a: unknown, b: unknown) => number> = {}

  sortableColumns.forEach(col => {
    comparators[col.field] = (a: unknown, b: unknown) => {
      const aVal = (a as Record<string, unknown>)[col.field]
      const bVal = (b as Record<string, unknown>)[col.field]
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return aVal - bVal
      }
      return String(aVal || '').localeCompare(String(bVal || ''))
    }
  })

  return {
    defaultField: sortableColumns[0]?.field || 'name',
    defaultDirection: 'asc' as SortDirection,
    comparators }
}
