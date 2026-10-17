import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { TOUCH_TARGET_HEIGHT_CLASS } from '../../../lib/constants/ui'
import { PAGE_SIZE } from './compliance-drilldown'
import type { ControlRow } from './compliance-drilldown'

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
