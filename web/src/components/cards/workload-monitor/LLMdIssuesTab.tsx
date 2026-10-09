// Issues tab content (filters, search, list, pagination) for the llm-d stack monitor card.
// Extracted from LLMdStackMonitor.tsx (issue #24058) — markup unchanged.
import { useTranslation } from 'react-i18next'
import { Pagination } from '../../ui/Pagination'
import { CardControls } from '../../ui/CardControls'
import { CardSearchInput } from '../../../lib/cards/CardComponents'
import type { MonitorIssue } from '../../../types/workloadMonitor'
import { LLMdIssuesList } from './LLMdIssuesList'
import {
  ISSUE_SORT_OPTIONS,
  SEVERITY_FILTER_OPTIONS,
  type ComponentItem,
  type IssueSortField,
  type SeverityFilter,
} from './LLMdStackMonitor.constants'

interface LLMdIssuesTabProps {
  severityFilter: SeverityFilter
  onSeverityFilterChange: (value: SeverityFilter) => void
  itemsPerPage: number | 'unlimited'
  onItemsPerPageChange: (value: number | 'unlimited') => void
  sortBy: IssueSortField
  onSortByChange: (value: IssueSortField) => void
  sortDirection: 'asc' | 'desc'
  onSortDirectionChange: (value: 'asc' | 'desc') => void
  search: string
  onSearchChange: (value: string) => void
  issues: MonitorIssue[]
  onDiagnoseItem: (item: ComponentItem) => void
  needsPagination: boolean
  currentPage: number
  totalPages: number
  totalItems: number
  onPageChange: (page: number) => void
}

export function LLMdIssuesTab({
  severityFilter,
  onSeverityFilterChange,
  itemsPerPage,
  onItemsPerPageChange,
  sortBy,
  onSortByChange,
  sortDirection,
  onSortDirectionChange,
  search,
  onSearchChange,
  issues,
  onDiagnoseItem,
  needsPagination,
  currentPage,
  totalPages,
  totalItems,
  onPageChange,
}: LLMdIssuesTabProps) {
  const { t } = useTranslation()
  return (
    <>
      {/* Controls row */}
      <div className="flex items-center gap-2 mb-2">
        {/* Severity filter */}
        {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from LLMdStackMonitor.tsx (pre-existing baselined violation) */}
        <select
          value={severityFilter}
          onChange={(e) => onSeverityFilterChange(e.target.value as SeverityFilter)}
          className="px-2 py-1 text-xs rounded-md bg-secondary border border-border text-foreground"
        >
          {SEVERITY_FILTER_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div className="flex-1" />
        <CardControls
          limit={itemsPerPage}
          onLimitChange={onItemsPerPageChange}
          sortBy={sortBy}
          sortOptions={ISSUE_SORT_OPTIONS}
          onSortChange={(v) => onSortByChange(v as IssueSortField)}
          sortDirection={sortDirection}
          onSortDirectionChange={onSortDirectionChange}
        />
      </div>

      {/* Search */}
      <CardSearchInput
        value={search}
        onChange={onSearchChange}
        placeholder={t('common.searchIssues')}
        className="mb-3"
      />

      {/* Issues list */}
      <LLMdIssuesList
        issues={issues}
        searchQuery={search}
        onDiagnoseItem={onDiagnoseItem}
      />

      {/* Pagination */}
      {needsPagination && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </>
  )
}
