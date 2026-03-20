import { useState, useMemo, useRef, useCallback } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { StatusBadge } from '../ui/StatusBadge'
import { useCardLoadingState } from './CardDataContext'
import { CardSkeleton, CardSearchInput, CardPaginationFooter } from '../../lib/cards/CardComponents'

// ---------------------------------------------------------------------------
// Named constants — no magic numbers
// ---------------------------------------------------------------------------

/** Default number of findings shown per page */
const DEFAULT_PAGE_SIZE = 10

/** Estimated height (px) for a single finding row in the virtualized list */
const FINDING_ROW_HEIGHT_PX = 72

/** Extra rows to render outside the visible area for smoother scrolling */
const VIRTUALIZER_OVERSCAN_COUNT = 5

/** Maximum height (px) for the virtualized scroll container */
const SCROLL_CONTAINER_MAX_HEIGHT_PX = 320

/** Number of skeleton rows to display during loading */
const SKELETON_ROW_COUNT = 4

/** Height (px) for each skeleton row placeholder */
const SKELETON_ROW_HEIGHT_PX = 60

/** Delay (ms) before demo data "finishes loading" */
const DEMO_LOADING_DELAY_MS = 600

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RBACFinding {
  id: string
  cluster: string
  subject: string
  subjectKind: 'User' | 'Group' | 'ServiceAccount'
  risk: 'critical' | 'high' | 'medium' | 'low'
  description: string
  binding: string
}

type RiskLevel = RBACFinding['risk']

interface RiskStyle {
  bg: string
  text: string
}

// ---------------------------------------------------------------------------
// Risk-level styling map
// ---------------------------------------------------------------------------

const RISK_STYLES: Record<RiskLevel, RiskStyle> = {
  critical: { bg: 'bg-red-500/10', text: 'text-red-400' },
  high: { bg: 'bg-orange-500/10', text: 'text-orange-400' },
  medium: { bg: 'bg-yellow-500/10', text: 'text-yellow-400' },
  low: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
}

/** Ordered list of risk levels from most to least severe */
const RISK_LEVELS: readonly RiskLevel[] = ['critical', 'high', 'medium', 'low'] as const

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_FINDINGS: RBACFinding[] = [
  { id: '1', cluster: 'prod-us-east', subject: 'dev-team', subjectKind: 'Group', risk: 'critical', description: 'cluster-admin binding — full cluster access', binding: 'ClusterRoleBinding/dev-admin' },
  { id: '2', cluster: 'prod-us-east', subject: 'ci-bot', subjectKind: 'ServiceAccount', risk: 'high', description: 'Wildcard verb on secrets — can read all secrets', binding: 'ClusterRoleBinding/ci-secrets' },
  { id: '3', cluster: 'staging', subject: 'default', subjectKind: 'ServiceAccount', risk: 'high', description: 'Default SA has elevated privileges', binding: 'ClusterRoleBinding/default-elevated' },
  { id: '4', cluster: 'prod-eu-west', subject: 'monitoring', subjectKind: 'ServiceAccount', risk: 'medium', description: 'Wide list/watch on all namespaces', binding: 'ClusterRoleBinding/monitoring-wide' },
  { id: '5', cluster: 'prod-us-east', subject: 'backup-operator', subjectKind: 'ServiceAccount', risk: 'medium', description: 'PV and PVC access across namespaces', binding: 'ClusterRoleBinding/backup-pvs' },
  { id: '6', cluster: 'staging', subject: 'developer', subjectKind: 'User', risk: 'low', description: 'Edit role in staging namespace', binding: 'RoleBinding/dev-edit' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RBACExplorer() {
  // ---- Data fetching simulation (demo) ------------------------------------
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [findings, setFindings] = useState<RBACFinding[]>([])

  // Simulate an async fetch on mount (and on retry)
  const loadData = useCallback(() => {
    setIsLoading(true)
    setError(null)
    const timer = setTimeout(() => {
      setFindings(DEMO_FINDINGS)
      setIsLoading(false)
    }, DEMO_LOADING_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  // Initial load
  useState(() => {
    loadData()
  })

  // ---- Loading / error state reporting ------------------------------------
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    hasAnyData: (findings || []).length > 0,
    isDemoData: true,
    isFailed: !!error,
    errorMessage: error || undefined,
  })

  // ---- Local UI state -----------------------------------------------------
  const [riskFilter, setRiskFilter] = useState<RiskLevel | null>(null)
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(DEFAULT_PAGE_SIZE)

  // ---- Filtering ----------------------------------------------------------
  const filtered = useMemo(() => {
    let result = findings || []

    // Risk filter
    if (riskFilter) {
      result = result.filter(f => f.risk === riskFilter)
    }

    // Text search
    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter(f =>
        f.subject.toLowerCase().includes(query) ||
        f.description.toLowerCase().includes(query) ||
        f.binding.toLowerCase().includes(query) ||
        f.cluster.toLowerCase().includes(query) ||
        f.subjectKind.toLowerCase().includes(query),
      )
    }

    return result
  }, [findings, riskFilter, search])

  // ---- Risk counts (from unfiltered findings for the chips) ---------------
  const riskCounts = useMemo(() => {
    const counts: Record<RiskLevel, number> = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const f of (findings || [])) {
      counts[f.risk]++
    }
    return counts
  }, [findings])

  // ---- Pagination ---------------------------------------------------------
  const totalItems = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))
  const needsPagination = totalItems > itemsPerPage

  // Reset page when filters change
  useMemo(() => {
    setCurrentPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riskFilter, search])

  const safeCurrentPage = Math.min(currentPage, totalPages)

  const paginatedItems = useMemo(() => {
    const start = (safeCurrentPage - 1) * itemsPerPage
    return filtered.slice(start, start + itemsPerPage)
  }, [filtered, safeCurrentPage, itemsPerPage])

  // ---- Virtualization -----------------------------------------------------
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: paginatedItems.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => FINDING_ROW_HEIGHT_PX,
    overscan: VIRTUALIZER_OVERSCAN_COUNT,
  })

  // ---- Loading state (skeleton) -------------------------------------------
  if (showSkeleton) {
    return (
      <CardSkeleton
        type="list"
        rows={SKELETON_ROW_COUNT}
        showHeader
        showSearch
        rowHeight={SKELETON_ROW_HEIGHT_PX}
      />
    )
  }

  // ---- Error state with retry ---------------------------------------------
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2 p-4 min-h-card">
        <AlertTriangle className="w-6 h-6 text-destructive opacity-70" />
        <p className="text-destructive">Failed to load RBAC data</p>
        <p className="text-xs text-muted-foreground/70 text-center max-w-xs">{error}</p>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      </div>
    )
  }

  // ---- Empty state --------------------------------------------------------
  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">No RBAC findings</p>
        <p className="text-xs mt-1">Connect a cluster to analyze RBAC bindings</p>
      </div>
    )
  }

  // ---- Main render --------------------------------------------------------
  return (
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden">
      {/* Risk summary chips */}
      <div className="flex gap-1 flex-wrap mb-2">
        {RISK_LEVELS.map(risk => {
          const style = RISK_STYLES[risk]
          const count = riskCounts[risk]
          return (
            <button
              key={risk}
              onClick={() => setRiskFilter(riskFilter === risk ? null : risk)}
              className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                riskFilter === risk
                  ? `${style.bg} ${style.text} ring-1 ring-current`
                  : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {risk}: {count}
            </button>
          )
        })}
      </div>

      {/* Search */}
      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search subjects, bindings, clusters..."
        className="mb-2"
      />

      {/* Virtualized findings list */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        style={{ maxHeight: `${SCROLL_CONTAINER_MAX_HEIGHT_PX}px` }}
      >
        {paginatedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-4">
            <p className="text-sm text-muted-foreground">No findings match your filters</p>
          </div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map(virtualRow => {
              const finding = paginatedItems[virtualRow.index]
              if (!finding) return null
              const style = RISK_STYLES[finding.risk]
              return (
                <div
                  key={finding.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className={`px-2 py-1.5 mb-1 rounded-lg ${style.bg} border border-transparent hover:border-current/20 transition-colors`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${style.bg} ${style.text} font-medium shrink-0`}>
                          {finding.risk.toUpperCase()}
                        </span>
                        <span className="text-sm font-medium truncate">{finding.subject}</span>
                        <span className="text-xs text-muted-foreground shrink-0">({finding.subjectKind})</span>
                      </div>
                      <StatusBadge color="purple" className="shrink-0">{finding.cluster}</StatusBadge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{finding.description}</div>
                    <div className="text-xs text-muted-foreground/60 mt-0.5 truncate">{finding.binding}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={safeCurrentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={itemsPerPage}
        onPageChange={setCurrentPage}
        needsPagination={needsPagination}
      />
    </div>
  )
}
