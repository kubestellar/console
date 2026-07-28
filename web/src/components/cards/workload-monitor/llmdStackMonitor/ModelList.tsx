import { ChevronDown, ChevronRight } from 'lucide-react'
import { CardControls } from '../../../ui/CardControls'
import { CardSearchInput, CardAIActions } from '../../../../lib/cards/CardComponents'
import { Pagination } from '../../../ui/Pagination'
import { StatusBadge } from '../../../ui/StatusBadge'
import { cn } from '../../../../lib/cn'

interface ComponentItem {
  name: string
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  type?: string
  namespace?: string
  detail?: string
  cluster?: string
}

interface Section {
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  items: ComponentItem[]
}

type SortField = 'name' | 'status' | 'type' | 'cluster'
type StatusFilter = 'all' | 'healthy' | 'degraded' | 'unhealthy'

interface ModelListProps {
  t: (key: string, options?: Record<string, unknown>) => string
  statusFilter: StatusFilter
  setStatusFilter: (v: StatusFilter) => void
  statusFilterOptions: Array<{ value: string; label: string }>
  itemsPerPage: number | 'unlimited'
  setItemsPerPage: (v: number | 'unlimited') => void
  sortBy: SortField
  setSortBy: (v: SortField) => void
  sortOptions: Array<{ value: string; label: string }>
  sortDirection: 'asc' | 'desc'
  setSortDirection: (v: 'asc' | 'desc') => void
  search: string
  setSearch: (v: string) => void
  sections: Section[]
  expandedSections: Set<string>
  toggleSection: (label: string) => void
  statusDot: Record<string, string>
  handleItemDiagnose: (item: ComponentItem) => void
  needsPagination: boolean
  safeCurrentPage: number
  totalPages: number
  totalItems: number
  currentPageSize: number
  setCurrentPage: (page: number) => void
}

export function ModelList({
  t,
  statusFilter,
  setStatusFilter,
  statusFilterOptions,
  itemsPerPage,
  setItemsPerPage,
  sortBy,
  setSortBy,
  sortOptions,
  sortDirection,
  setSortDirection,
  search,
  setSearch,
  sections,
  expandedSections,
  toggleSection,
  statusDot,
  handleItemDiagnose,
  needsPagination,
  safeCurrentPage,
  totalPages,
  totalItems,
  currentPageSize,
  setCurrentPage,
}: ModelListProps) {
  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); setCurrentPage(1) }}
          className="px-2 py-1 text-xs rounded-md bg-secondary border border-border text-foreground"
        >
          {statusFilterOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div className="flex-1" />
        <CardControls
          limit={itemsPerPage}
          onLimitChange={(v) => { setItemsPerPage(v); setCurrentPage(1) }}
          sortBy={sortBy}
          sortOptions={sortOptions}
          onSortChange={(v) => setSortBy(v as SortField)}
          sortDirection={sortDirection}
          onSortDirectionChange={setSortDirection}
        />
      </div>

      <CardSearchInput
        value={search}
        onChange={(v) => { setSearch(v); setCurrentPage(1) }}
        placeholder={t('common.searchComponents')}
        className="mb-3"
      />

      <div className="flex-1 overflow-y-auto space-y-0.5">
        {sections.map(section => {
          const SectionIcon = section.icon
          const isExpanded = expandedSections.has(section.label)
          const sectionHealthy = section.items.filter(i => i.status === 'healthy').length
          const allHealthy = sectionHealthy === section.items.length

          return (
            <div key={section.label} className="border-b border-border/30 last:border-0">
              <button
                onClick={() => toggleSection(section.label)}
                className="w-full flex items-center gap-2 py-1.5 px-1 text-left hover:bg-card/30 rounded transition-colors"
              >
                {isExpanded
                  ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                  : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                <SectionIcon className={cn('w-3.5 h-3.5 shrink-0', section.color)} />
                <span className="text-sm text-foreground flex-1">{section.label}</span>
                <span
                  className={cn(
                    'text-xs px-1.5 py-0.5 rounded cursor-default',
                    allHealthy ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400',
                  )}
                  title={`${sectionHealthy} healthy out of ${section.items.length} total ${section.label} components`}
                >
                  {sectionHealthy}/{section.items.length}
                </span>
              </button>
              {isExpanded && (
                <div className="ml-8 mb-1.5 space-y-0.5">
                  {section.items.map((item, idx) => (
                    <div key={`${section.label}-${idx}-${item.name}`} className="flex items-center gap-2 py-0.5 px-1 rounded hover:bg-card/30 transition-colors group">
                      <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusDot[item.status] || 'bg-gray-400')} />
                      <span className="text-xs text-foreground truncate flex-1">{item.name}</span>
                      {item.namespace && (
                        <StatusBadge color="purple" size="xs" className="shrink-0">
                          {item.namespace}
                        </StatusBadge>
                      )}
                      {item.detail && (
                        <span className="text-2xs text-muted-foreground shrink-0 truncate max-w-[150px]">
                          {item.detail}
                        </span>
                      )}
                      {item.cluster && (
                        <span className="text-2xs px-1 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">
                          {item.cluster}
                        </span>
                      )}
                      {item.status !== 'healthy' && (
                        <CardAIActions
                          resource={{ kind: 'Deployment', name: item.name, namespace: item.namespace, cluster: item.cluster, status: item.status }}
                          issues={item.detail ? [{ name: item.status, message: item.detail }] : []}
                          showRepair={false}
                          onDiagnose={(e) => { e.stopPropagation(); handleItemDiagnose(item) }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {needsPagination && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <Pagination
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={currentPageSize}
            onPageChange={setCurrentPage}
          />
        </div>
      )}
    </>
  )
}
