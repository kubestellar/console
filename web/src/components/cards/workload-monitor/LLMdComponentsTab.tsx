// Components tab content (filters, search, sections, pagination) for the llm-d stack monitor card.
// Extracted from LLMdStackMonitor.tsx (issue #24058) — markup unchanged.
import { useTranslation } from 'react-i18next'
import { Pagination } from '../../ui/Pagination'
import { CardControls } from '../../ui/CardControls'
import { CardSearchInput } from '../../../lib/cards/CardComponents'
import { LLMdComponentSections, type LLMdSection } from './LLMdComponentSections'
import {
  SORT_OPTIONS,
  STATUS_FILTER_OPTIONS,
  type ComponentItem,
  type SortField,
  type StatusFilter,
} from './LLMdStackMonitor.constants'

interface LLMdComponentsTabProps {
  statusFilter: StatusFilter
  onStatusFilterChange: (value: StatusFilter) => void
  itemsPerPage: number | 'unlimited'
  onItemsPerPageChange: (value: number | 'unlimited') => void
  sortBy: SortField
  onSortByChange: (value: SortField) => void
  sortDirection: 'asc' | 'desc'
  onSortDirectionChange: (value: 'asc' | 'desc') => void
  search: string
  onSearchChange: (value: string) => void
  sections: LLMdSection[]
  expandedSections: Set<string>
  onToggleSection: (label: string) => void
  onDiagnoseItem: (item: ComponentItem) => void
  needsPagination: boolean
  currentPage: number
  totalPages: number
  totalItems: number
  onPageChange: (page: number) => void
}

export function LLMdComponentsTab({
  statusFilter,
  onStatusFilterChange,
  itemsPerPage,
  onItemsPerPageChange,
  sortBy,
  onSortByChange,
  sortDirection,
  onSortDirectionChange,
  search,
  onSearchChange,
  sections,
  expandedSections,
  onToggleSection,
  onDiagnoseItem,
  needsPagination,
  currentPage,
  totalPages,
  totalItems,
  onPageChange,
}: LLMdComponentsTabProps) {
  const { t } = useTranslation()
  return (
    <>
      {/* Controls row */}
      <div className="flex items-center gap-2 mb-2">
        {/* Status filter */}
        {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from LLMdStackMonitor.tsx (pre-existing baselined violation) */}
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value as StatusFilter)}
          className="px-2 py-1 text-xs rounded-md bg-secondary border border-border text-foreground"
        >
          {STATUS_FILTER_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div className="flex-1" />
        <CardControls
          limit={itemsPerPage}
          onLimitChange={onItemsPerPageChange}
          sortBy={sortBy}
          sortOptions={SORT_OPTIONS}
          onSortChange={(v) => onSortByChange(v as SortField)}
          sortDirection={sortDirection}
          onSortDirectionChange={onSortDirectionChange}
        />
      </div>

      {/* Search */}
      <CardSearchInput
        value={search}
        onChange={onSearchChange}
        placeholder={t('common.searchComponents')}
        className="mb-3"
      />

      {/* Component sections */}
      <LLMdComponentSections
        sections={sections}
        expandedSections={expandedSections}
        onToggleSection={onToggleSection}
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
