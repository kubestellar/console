import { memo, type CSSProperties, type RefObject } from 'react'

// Split helper component; parent card owns useCardLoadingState.
import {
  AlertTriangle, CheckCircle, ExternalLink, XCircle, Info,
  ChevronRight, RefreshCw, Plus, WifiOff, Loader2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { StatusBadge } from '../ui/StatusBadge'
import { RefreshIndicator } from '../ui/RefreshIndicator'
import type { GatekeeperStatus, OPAClusterItem, Policy } from './opa'
import type { SortByOption } from './OPAPolicies.types'
import { SORT_OPTIONS } from './OPAPolicies.types'
import type { ClusterWithHealth } from '../../lib/cards/cardFilters'

interface OPAPoliciesTableProps {
  // Summary stats
  installedCount: number
  activePolicies: number
  totalViolations: number
  // Refresh state
  isRefreshing: boolean
  lastRefresh: number | null
  // Scroll container
  containerRef: RefObject<HTMLDivElement | null>
  containerStyle: CSSProperties | undefined
  // Paginated cluster data
  paginatedClusters: OPAClusterItem[]
  totalItems: number
  currentPage: number
  totalPages: number
  itemsPerPage: number | 'unlimited'
  goToPage: (page: number) => void
  needsPagination: boolean
  setItemsPerPage: (v: number | 'unlimited') => void
  // Gatekeeper statuses keyed by cluster name
  statuses: Record<string, GatekeeperStatus>
  // Search
  search: string
  setSearch: (v: string) => void
  // Cluster filter
  availableClusters: ClusterWithHealth[]
  localClusterFilter: string[]
  toggleClusterFilter: (c: string) => void
  clearClusterFilter: () => void
  showClusterFilter: boolean
  setShowClusterFilter: (v: boolean) => void
  clusterFilterRef: RefObject<HTMLDivElement | null>
  // Sort controls
  sorting: {
    sortBy: SortByOption
    setSortBy: (v: SortByOption) => void
    sortDirection: 'asc' | 'desc'
    setSortDirection: (v: 'asc' | 'desc') => void
  }
  // Callbacks
  onShowViolations: (clusterName: string) => void
  onInstallOPA: (clusterName: string) => void
  onPolicyClick: (policy: Policy) => void
  onCreatePolicy: () => void
}

export const OPAPoliciesTable = memo(function OPAPoliciesTable({
  installedCount, activePolicies, totalViolations,
  isRefreshing, lastRefresh,
  containerRef, containerStyle,
  paginatedClusters, totalItems, currentPage, totalPages,
  itemsPerPage, goToPage, needsPagination, setItemsPerPage,
  statuses,
  search, setSearch,
  availableClusters, localClusterFilter, toggleClusterFilter,
  clearClusterFilter, showClusterFilter, setShowClusterFilter, clusterFilterRef,
  sorting,
  onShowViolations, onInstallOPA, onPolicyClick, onCreatePolicy,
}: OPAPoliciesTableProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <div className="flex items-center gap-2">
          {installedCount > 0 && (
            <StatusBadge color="green" size="xs">
              {installedCount} cluster{installedCount !== 1 ? 's' : ''}
            </StatusBadge>
          )}
          <RefreshIndicator
            isRefreshing={isRefreshing}
            lastUpdated={lastRefresh ? new Date(lastRefresh) : null}
            size="sm"
            showLabel={true}
          />
        </div>
        <CardControlsRow
          clusterFilter={{
            availableClusters,
            selectedClusters: localClusterFilter,
            onToggle: toggleClusterFilter,
            onClear: clearClusterFilter,
            isOpen: showClusterFilter,
            setIsOpen: setShowClusterFilter,
            containerRef: clusterFilterRef,
          }}
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy: sorting.sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => sorting.setSortBy(v as SortByOption),
            sortDirection: sorting.sortDirection,
            onSortDirectionChange: sorting.setSortDirection,
          }}
          extra={
            <>
              <button
                onClick={onCreatePolicy}
                className="p-1 hover:bg-purple-500/10 rounded transition-colors text-muted-foreground hover:text-purple-400"
                title={t('cards:opaPolicies.createOPAPolicy')}
              >
                <Plus className="w-4 h-4" />
              </button>
              <a
                href="https://open-policy-agent.github.io/gatekeeper/website/docs/"
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-purple-400"
                title={t('cards:opaPolicies.documentation')}
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </>
          }
        />
      </div>

      {/* Search */}
      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('common:common.searchClusters')}
        className="mb-2 flex-none"
      />

      {/* Summary stats */}
      {installedCount > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <p className="text-2xs text-orange-400">Policies Active</p>
            <p className="text-lg font-bold text-foreground">{activePolicies}</p>
          </div>
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-2xs text-red-400">Violations</p>
            <p className="text-lg font-bold text-foreground">{totalViolations}</p>
          </div>
        </div>
      )}

      {/* Cluster list — p-1 -m-1 gives room for focus rings without clipping */}
      <div ref={containerRef} className="flex-1 overflow-y-auto space-y-2 p-1 -m-1" style={containerStyle}>
        {paginatedClusters.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No clusters available
          </div>
        ) : (
          paginatedClusters.map(cluster => {
            const isOffline = cluster.reachable === false
            const status = statuses[cluster.name]
            // Show full spinner only when no status at all (initial load).
            // Phase 1 sets installed=true, loading=true (Phase 2 pending) — show installed immediately.
            const isInitialLoading = !isOffline && !status
            const isLoadingDetails = !isOffline && status?.installed && status?.loading

            return (
              <button
                key={cluster.name}
                onClick={() => status?.installed && !isOffline && onShowViolations(cluster.name)}
                disabled={isOffline || isInitialLoading}
                className={`w-full text-left p-2.5 rounded-lg bg-secondary/30 transition-colors ${
                  !isOffline && status?.installed && !isInitialLoading
                    ? 'hover:bg-secondary/50 cursor-pointer group'
                    : ''
                } ${isOffline ? 'opacity-50' : ''}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-y-2 mb-1">
                  <span className={`text-sm font-medium text-foreground ${!isOffline && status?.installed ? 'group-hover:text-purple-400' : ''}`}>
                    {cluster.name}
                  </span>
                  <div className="flex items-center gap-1">
                    {isOffline ? (
                      <WifiOff className="w-3.5 h-3.5 text-muted-foreground/40" />
                    ) : isInitialLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
                    ) : status?.installed ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </>
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {isOffline ? (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground/50">
                    <WifiOff className="w-3 h-3" />
                    <span>{t('messages.offline')}</span>
                  </div>
                ) : isInitialLoading ? (
                  <p className="text-xs text-muted-foreground">{t('messages.checking')}</p>
                ) : status?.installed ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-3 text-xs">
                      {isLoadingDetails ? (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Loading policies...
                        </span>
                      ) : (
                        <>
                          <span className="text-muted-foreground">
                            {status.policyCount ?? 0} {status.policyCount === 1 ? 'policy' : 'policies'}
                          </span>
                          {(status.violationCount ?? 0) > 0 && (
                            <span className="flex items-center gap-1 text-yellow-400">
                              <AlertTriangle className="w-3 h-3" />
                              {status.violationCount} {status.violationCount === 1 ? 'violation' : 'violations'}
                            </span>
                          )}
                          {((): Array<'warn' | 'enforce' | 'dryrun' | 'deny'> => {
                            if (status.modes?.length) return status.modes
                            if (status.mode) return [status.mode]
                            return []
                          })().map((mode, idx) => (
                            <span key={idx} className={`px-1.5 py-0.5 rounded text-2xs ${
                              mode === 'enforce' ? 'bg-red-500/20 text-red-400' :
                              mode === 'warn' ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-blue-500/20 text-blue-400'
                            }`}>
                              {mode}
                            </span>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                ) : status?.error ? (
                  <div className="flex items-center gap-1 text-xs text-yellow-400/70">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{status.error}</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-y-2">
                    <span className="text-xs text-muted-foreground">Not installed</span>
                    <span
                      onClick={(e) => { e.stopPropagation(); onInstallOPA(cluster.name) }}
                      className="text-xs text-purple-400 hover:text-purple-300 cursor-pointer"
                    >
                      Install with an AI Mission →
                    </span>
                  </div>
                )}
              </button>
            )
          })
        )}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={itemsPerPage === 'unlimited' ? totalItems : itemsPerPage}
        onPageChange={goToPage}
        needsPagination={needsPagination}
      />

      {/* Active policies preview — first cluster that has policies */}
      {installedCount > 0 && (() => {
        const clusterWithPolicies = Object.values(statuses).find(
          s => s.installed && s.policies && s.policies.length > 0
        )
        const policies = clusterWithPolicies?.policies || []
        if (policies.length === 0) return null
        return (
          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-2xs text-muted-foreground font-medium mb-2 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Active Policies
            </p>
            <div className="space-y-1">
              {policies.slice(0, 4).map(policy => (
                <button
                  key={policy.name}
                  onClick={() => onPolicyClick(policy)}
                  className="w-full flex flex-wrap items-center justify-between gap-y-2 text-xs p-1.5 -mx-1.5 rounded hover:bg-secondary/50 transition-colors group"
                >
                  <span className="text-foreground truncate group-hover:text-purple-400">{policy.name}</span>
                  <div className="flex items-center gap-2">
                    {policy.violations > 0 && (
                      <span className="text-yellow-400">{policy.violations.toLocaleString()}</span>
                    )}
                    <span className={`px-1 py-0.5 rounded text-[9px] ${
                      policy.mode === 'enforce' || policy.mode === 'deny' ? 'bg-red-500/20 text-red-400' :
                      policy.mode === 'warn' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {policy.mode}
                    </span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Footer links */}
      <div className="flex items-center justify-center gap-3 pt-2 mt-2 border-t border-border/50 text-2xs">
        <button
          onClick={onCreatePolicy}
          className="text-purple-400 hover:text-purple-300 transition-colors"
        >
          Create Policy
        </button>
        <span className="text-muted-foreground/30">•</span>
        <a
          href="https://open-policy-agent.github.io/gatekeeper/website/docs/install"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-purple-400 transition-colors"
        >
          Install Guide
        </a>
        <span className="text-muted-foreground/30">•</span>
        <a
          href="https://open-policy-agent.github.io/gatekeeper-library/website/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-purple-400 transition-colors"
        >
          Policy Library
        </a>
      </div>
    </div>
  )
})
