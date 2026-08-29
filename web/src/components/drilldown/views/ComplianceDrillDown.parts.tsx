import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, X, Filter, Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../../ui/StatusBadge'
import { Input } from '../../ui/Input'
import { Select } from '../../ui/Select'
import { cn } from '../../../lib/cn'
import { TOUCH_TARGET_HEIGHT_CLASS, TOUCH_TARGET_SIZE_CLASS } from '../../../lib/constants/ui'
import { PAGE_SIZE, severityColor, statusIcon, statusLabel } from './compliance-drilldown'
import type { SortField, SortDir, ControlRow } from './compliance-drilldown'

// ─── Summary Stats ────────────────────────────────────────────────────────────

interface ComplianceSummaryStatsProps {
  passCount: number
  failCount: number
  otherCount: number
  totalCount: number
  statusFilter: string
  onClearFilter: () => void
  onPassClick: () => void
  onFailClick: () => void
  onOtherClick: () => void
}

/** Four-cell stat grid: total / passing / failing / other with filter toggle on click. */
export function ComplianceSummaryStats({
  passCount,
  failCount,
  otherCount,
  totalCount,
  statusFilter,
  onClearFilter,
  onPassClick,
  onFailClick,
  onOtherClick,
}: ComplianceSummaryStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <button
        onClick={onClearFilter}
        className={cn(
          cn('rounded-lg border p-3 text-left transition-colors', TOUCH_TARGET_HEIGHT_CLASS),
          !statusFilter ? 'border-teal-500/40 bg-teal-500/10' : 'border-border bg-card/50 hover:border-border/80'
        )}
      >
        <div className="text-xl font-bold text-foreground">{totalCount}</div>
        <div className="text-xs text-muted-foreground">Total Controls</div>
      </button>
      <button
        onClick={onPassClick}
        className={cn(
          cn('rounded-lg border p-3 text-left transition-colors', TOUCH_TARGET_HEIGHT_CLASS),
          statusFilter === 'pass' ? 'border-green-500/40 bg-green-500/10' : 'border-border bg-card/50 hover:border-border/80'
        )}
      >
        <div className="text-xl font-bold text-green-400">{passCount}</div>
        <div className="text-xs text-muted-foreground">Passing</div>
      </button>
      <button
        onClick={onFailClick}
        className={cn(
          cn('rounded-lg border p-3 text-left transition-colors', TOUCH_TARGET_HEIGHT_CLASS),
          statusFilter === 'fail' ? 'border-red-500/40 bg-red-500/10' : 'border-border bg-card/50 hover:border-border/80'
        )}
      >
        <div className="text-xl font-bold text-red-400">{failCount}</div>
        <div className="text-xs text-muted-foreground">Failing</div>
      </button>
      <button
        onClick={onOtherClick}
        className={cn(
          cn('rounded-lg border p-3 text-left transition-colors', TOUCH_TARGET_HEIGHT_CLASS),
          statusFilter === 'other' ? 'border-yellow-500/40 bg-yellow-500/10' : 'border-border bg-card/50 hover:border-border/80'
        )}
      >
        <div className="text-xl font-bold text-yellow-400">{otherCount}</div>
        <div className="text-xs text-muted-foreground">Other / N/A</div>
      </button>
    </div>
  )
}

// ─── Search & Filters ─────────────────────────────────────────────────────────

interface ComplianceSearchFiltersProps {
  searchQuery: string
  showFilters: boolean
  activeFilters: number
  statusFilter: string
  severityFilter: string
  clusterFilter: string
  profileFilter: string
  uniqueStatuses: string[]
  uniqueClusters: string[]
  uniqueProfiles: string[]
  onSearchChange: (q: string) => void
  onToggleFilters: () => void
  onStatusChange: (v: string) => void
  onSeverityChange: (v: string) => void
  onClusterChange: (v: string) => void
  onProfileChange: (v: string) => void
  onClearAll: () => void
}

/** Search bar with filter-toggle button and collapsible dropdown panel. */
export function ComplianceSearchFilters({
  searchQuery,
  showFilters,
  activeFilters,
  statusFilter,
  severityFilter,
  clusterFilter,
  profileFilter,
  uniqueStatuses,
  uniqueClusters,
  uniqueProfiles,
  onSearchChange,
  onToggleFilters,
  onStatusChange,
  onSeverityChange,
  onClusterChange,
  onProfileChange,
  onClearAll,
}: ComplianceSearchFiltersProps) {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            type="text"
            placeholder="Search by control ID, title, or description..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            leadingIcon={<Search className="w-4 h-4" />}
            className={cn('bg-card/50', TOUCH_TARGET_HEIGHT_CLASS)}
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className={cn('absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10', TOUCH_TARGET_SIZE_CLASS)}
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          onClick={onToggleFilters}
          aria-expanded={showFilters}
          aria-controls="compliance-filters-panel"
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors',
            TOUCH_TARGET_HEIGHT_CLASS,
            showFilters || activeFilters > 0
              ? 'border-teal-500/40 bg-teal-500/10 text-teal-400'
              : 'border-border bg-card/50 text-muted-foreground hover:text-foreground'
          )}
        >
          <Filter className="w-4 h-4" />
          Filters
          {activeFilters > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-teal-500/20 text-teal-400 text-xs font-medium">
              {activeFilters}
            </span>
          )}
        </button>
      </div>
      {showFilters && (
        <div id="compliance-filters-panel" className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
          <Select
            value={statusFilter}
            onChange={e => onStatusChange(e.target.value)}
            className={cn('bg-card/50', TOUCH_TARGET_HEIGHT_CLASS)}
          >
            <option value="">{t('drilldown.compliance.allStatuses')}</option>
            {uniqueStatuses.map(s => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </Select>
          <Select
            value={severityFilter}
            onChange={e => onSeverityChange(e.target.value)}
            className={cn('bg-card/50', TOUCH_TARGET_HEIGHT_CLASS)}
          >
            <option value="">{t('drilldown.compliance.allSeverities')}</option>
            <option value="critical">{t('drilldown.compliance.critical')}</option>
            <option value="high">{t('drilldown.compliance.high')}</option>
            <option value="medium">{t('drilldown.compliance.medium')}</option>
            <option value="low">{t('drilldown.compliance.low')}</option>
          </Select>
          <Select
            value={clusterFilter}
            onChange={e => onClusterChange(e.target.value)}
            className={cn('bg-card/50', TOUCH_TARGET_HEIGHT_CLASS)}
          >
            <option value="">{t('drilldown.compliance.allClusters')}</option>
            {uniqueClusters.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
          <Select
            value={profileFilter}
            onChange={e => onProfileChange(e.target.value)}
            className={cn('bg-card/50', TOUCH_TARGET_HEIGHT_CLASS)}
          >
            <option value="">{t('drilldown.compliance.allProfiles')}</option>
            {uniqueProfiles.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
          {activeFilters > 0 && (
            <button
              onClick={onClearAll}
              className={cn('col-span-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground md:col-span-4', TOUCH_TARGET_HEIGHT_CLASS)}
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </>
  )
}

// ─── Table ────────────────────────────────────────────────────────────────────

interface ComplianceTableProps {
  pagedRows: ControlRow[]
  sortField: SortField
  sortDir: SortDir
  isAggregateSummaryOnly: boolean
  onSort: (field: SortField) => void
}

function SortIndicator({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ChevronUp className="w-3 h-3 opacity-20" />
  return sortDir === 'asc'
    ? <ChevronUp className="w-3 h-3" />
    : <ChevronDown className="w-3 h-3" />
}

/** Scrollable table of compliance controls with sortable column headers. */
export function ComplianceTable({
  pagedRows,
  sortField,
  sortDir,
  isAggregateSummaryOnly,
  onSort,
}: ComplianceTableProps) {
  return (
    <div className="flex-1 overflow-y-auto px-6">
      {pagedRows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">
            {isAggregateSummaryOnly ? 'Detailed controls are unavailable for this view' : 'No controls match filters'}
          </p>
          <p className="text-xs mt-1">
            {isAggregateSummaryOnly
              ? 'The summary totals above match the values from the selected stat block.'
              : 'Try adjusting your search or filter criteria'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_2fr_100px_100px_120px_120px] gap-px bg-border text-xs font-medium text-muted-foreground">
            <button onClick={() => onSort('controlId')} className="flex min-w-11 min-h-11 items-center gap-1 px-3 py-2 bg-card/80 hover:bg-card transition-colors">
              Control <SortIndicator field="controlId" sortField={sortField} sortDir={sortDir} />
            </button>
            <div className="px-3 py-2 min-h-11 bg-card/80">Description</div>
            <button onClick={() => onSort('status')} className="flex min-w-11 min-h-11 items-center gap-1 px-3 py-2 bg-card/80 hover:bg-card transition-colors">
              Status <SortIndicator field="status" sortField={sortField} sortDir={sortDir} />
            </button>
            <button onClick={() => onSort('severity')} className="flex min-w-11 min-h-11 items-center gap-1 px-3 py-2 bg-card/80 hover:bg-card transition-colors">
              Severity <SortIndicator field="severity" sortField={sortField} sortDir={sortDir} />
            </button>
            <button onClick={() => onSort('cluster')} className="flex min-w-11 min-h-11 items-center gap-1 px-3 py-2 bg-card/80 hover:bg-card transition-colors">
              Cluster <SortIndicator field="cluster" sortField={sortField} sortDir={sortDir} />
            </button>
            <button onClick={() => onSort('profile')} className="flex min-w-11 min-h-11 items-center gap-1 px-3 py-2 bg-card/80 hover:bg-card transition-colors">
              Profile <SortIndicator field="profile" sortField={sortField} sortDir={sortDir} />
            </button>
          </div>
          {/* Table rows */}
          {pagedRows.map((row, i) => (
            <div
              key={`${row.cluster}-${row.controlId}-${i}`}
              className={cn(
                'grid grid-cols-[1fr_2fr_100px_100px_120px_120px] gap-px text-sm',
                row.status === 'fail' ? 'bg-red-500/5' : 'bg-transparent',
                'hover:bg-card/40 transition-colors'
              )}
            >
              <div className="px-3 py-2.5 font-mono text-xs font-medium text-foreground truncate">
                {row.controlId}
              </div>
              <div className="px-3 py-2.5 text-xs text-muted-foreground truncate" title={row.description || row.title}>
                {row.title}
              </div>
              <div className="px-3 py-2.5 flex items-center gap-1.5">
                {statusIcon(row.status)}
                <span className="text-xs">{statusLabel(row.status)}</span>
              </div>
              <div className="px-3 py-2.5">
                {row.severity && (
                  <span className={cn('px-2 py-0.5 rounded text-xs font-medium border', severityColor(row.severity))}>
                    {row.severity}
                  </span>
                )}
              </div>
              <div className="px-3 py-2.5">
                <StatusBadge color="blue" size="xs">
                  {row.cluster.split('/').pop() || row.cluster}
                </StatusBadge>
              </div>
              <div className="px-3 py-2.5 text-xs text-muted-foreground truncate" title={row.profile}>
                {row.profile || '-'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Pagination ───────────────────────────────────────────────────────────────

interface CompliancePaginationProps {
  page: number
  totalPages: number
  totalRows: number
  onFirst: () => void
  onPrev: () => void
  onNext: () => void
  onLast: () => void
}

/** Page-nav controls shown below the table. */
export function CompliancePagination({
  page,
  totalPages,
  totalRows,
  onFirst,
  onPrev,
  onNext,
  onLast,
}: CompliancePaginationProps) {
  return (
    <div className="px-6 py-3 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalRows)} of {totalRows} controls
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={onFirst}
          disabled={page === 0}
          className="p-2 rounded hover:bg-card/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-h-11 min-w-11"
          title="First page"
          aria-label="First page"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button
          onClick={onPrev}
          disabled={page === 0}
          className="p-2 rounded hover:bg-card/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-h-11 min-w-11"
          title="Previous page"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="px-3 text-xs">
          Page {page + 1} of {totalPages}
        </span>
        <button
          onClick={onNext}
          disabled={page >= totalPages - 1}
          className="p-2 rounded hover:bg-card/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-h-11 min-w-11"
          title="Next page"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={onLast}
          disabled={page >= totalPages - 1}
          className="p-2 rounded hover:bg-card/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-h-11 min-w-11"
          title="Last page"
          aria-label="Last page"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Per-Cluster Breakdown ────────────────────────────────────────────────────

interface ComplianceClusterBreakdownProps {
  uniqueClusters: string[]
  filteredRows: ControlRow[]
  clusterFilter: string
  onClusterClick: (cluster: string) => void
}

/** Mini per-cluster stat grid rendered below the pagination bar. */
export function ComplianceClusterBreakdown({
  uniqueClusters,
  filteredRows,
  clusterFilter,
  onClusterClick,
}: ComplianceClusterBreakdownProps) {
  return (
    <div className="px-6 py-3 border-t border-border">
      <p className="text-xs text-muted-foreground mb-2">Per-cluster breakdown</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {uniqueClusters.map(cluster => {
          const clusterRows = filteredRows.filter(r => r.cluster === cluster)
          const cPass = clusterRows.filter(r => r.status === 'pass').length
          const cFail = clusterRows.filter(r => r.status === 'fail').length
          const cTotal = clusterRows.length
          const cScore = cTotal > 0 ? Math.round((cPass / cTotal) * 100) : 0
          return (
            <button
              key={cluster}
              onClick={() => onClusterClick(cluster)}
              className={cn(
                'rounded-lg border p-2 text-left transition-colors',
                TOUCH_TARGET_HEIGHT_CLASS,
                clusterFilter === cluster ? 'border-blue-500/40 bg-blue-500/10' : 'border-border bg-card/50 hover:border-border/80'
              )}
            >
              <div className="text-xs font-medium text-foreground truncate">{cluster.split('/').pop() || cluster}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-green-400">{cPass} pass</span>
                <span className="text-xs text-red-400">{cFail} fail</span>
                <span className={cn(
                  'text-xs font-bold ml-auto',
                  cScore >= 80 ? 'text-green-400' : cScore >= 60 ? 'text-yellow-400' : 'text-red-400'
                )}>
                  {cScore}%
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
