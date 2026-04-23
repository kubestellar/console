import { CheckCircle, AlertTriangle, AlertCircle, XCircle, RefreshCw, ArrowUpCircle, ChevronRight } from 'lucide-react'
import { useClusters, Operator } from '../../hooks/useMCP'
import { useCachedOperators } from '../../hooks/useCachedData'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { ClusterBadge } from '../ui/ClusterBadge'
import { StatusBadge } from '../ui/StatusBadge'
import { Skeleton } from '../ui/Skeleton'
import { useCardLoadingState } from './CardDataContext'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { useCardData, useCardFilters, commonComparators, type SortDirection } from '../../lib/cards/cardHooks'
import {
  CardSearchInput,
  CardControlsRow,
  CardPaginationFooter,
  CardAIActions } from '../../lib/cards/CardComponents'
import { useTranslation } from 'react-i18next'

interface OperatorStatusProps {
  config?: {
    cluster?: string
  }
}

type SortByOption = 'status' | 'name' | 'namespace' | 'version'
type SortTranslationKey = 'common:common.status' | 'common:common.name' | 'common:common.namespace' | 'cards:operatorStatus.version'

const SORT_OPTIONS_KEYS: ReadonlyArray<{ value: SortByOption; labelKey: SortTranslationKey }> = [
  { value: 'status' as const, labelKey: 'common:common.status' },
  { value: 'name' as const, labelKey: 'common:common.name' },
  { value: 'namespace' as const, labelKey: 'common:common.namespace' },
  { value: 'version' as const, labelKey: 'cards:operatorStatus.version' },
]

const STATUS_ORDER: Record<string, number> = { Failed: 0, Installing: 1, Upgrading: 2, Succeeded: 3 }

const OPERATOR_SORT_COMPARATORS = {
  status: (a: Operator, b: Operator) => (STATUS_ORDER[a.status] ?? 5) - (STATUS_ORDER[b.status] ?? 5),
  name: commonComparators.string<Operator>('name'),
  namespace: commonComparators.string<Operator>('namespace'),
  version: commonComparators.string<Operator>('version') }

// Shared filter config for counting and display
const FILTER_CONFIG = {
  searchFields: ['name', 'namespace', 'version'] as (keyof Operator)[],
  clusterField: 'cluster' as keyof Operator,
  statusField: 'status' as keyof Operator,
  storageKey: 'operator-status' }

function OperatorStatusInternal({ config: _config }: OperatorStatusProps) {
  const { t } = useTranslation(['cards', 'common'])
  const SORT_OPTIONS = SORT_OPTIONS_KEYS.map(opt => ({ value: opt.value, label: String(t(opt.labelKey)) }))
  const { isLoading: clustersLoading } = useClusters()
  const { drillToOperator } = useDrillDownActions()

  // Fetch operators - pass undefined to get all clusters
  const { operators: rawOperators, isLoading: operatorsLoading, isRefreshing, consecutiveFailures, isFailed, isDemoFallback: isDemoData, refetch } = useCachedOperators(undefined)

  // Report card data state
  const hasData = rawOperators.length > 0
  const { showSkeleton, showEmptyState, loadingTimedOut } = useCardLoadingState({
    isLoading: (clustersLoading || operatorsLoading) && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isFailed,
    consecutiveFailures,
    isDemoData })

  // Use useCardFilters for status counts (globally filtered, before local search/pagination)
  const { filtered: globalFilteredOperators } = useCardFilters(rawOperators, FILTER_CONFIG)

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: operators,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: searchQuery,
      setSearch: setSearchQuery,
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters,
      showClusterFilter,
      setShowClusterFilter,
      clusterFilterRef },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection },
    containerRef,
    containerStyle } = useCardData<Operator, SortByOption>(rawOperators, {
    filter: {
      searchFields: ['name', 'namespace', 'version'] as (keyof Operator)[],
      clusterField: 'cluster',
      statusField: 'status',
      storageKey: 'operator-status' },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc' as SortDirection,
      comparators: OPERATOR_SORT_COMPARATORS },
    defaultLimit: 5 })

  const getStatusIcon = (status: Operator['status']) => {
    switch (status) {
      case 'Succeeded': return CheckCircle
      case 'Failed': return XCircle
      case 'Installing': return RefreshCw
      case 'Upgrading': return ArrowUpCircle
      default: return AlertTriangle
    }
  }

  const STATUS_ICON_CLASS: Record<string, string> = {
    green: 'text-green-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    orange: 'text-orange-400' }

  const STATUS_BADGE_CLASS: Record<string, string> = {
    green: 'bg-green-500/20 text-green-400',
    red: 'bg-red-500/20 text-red-400',
    blue: 'bg-blue-500/20 text-blue-400',
    purple: 'bg-purple-500/20 text-purple-400',
    orange: 'bg-orange-500/20 text-orange-400' }

  const getStatusColor = (status: Operator['status']) => {
    switch (status) {
      case 'Succeeded': return 'green'
      case 'Failed': return 'red'
      case 'Installing': return 'blue'
      case 'Upgrading': return 'purple'
      default: return 'orange'
    }
  }

  // Status counts from globally filtered data (before local search/pagination)
  const statusCounts = {
    succeeded: globalFilteredOperators.filter(o => o.status === 'Succeeded').length,
    failed: globalFilteredOperators.filter(o => o.status === 'Failed').length,
    other: globalFilteredOperators.filter(o => !['Succeeded', 'Failed'].includes(o.status)).length }

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
          <Skeleton variant="text" width={130} height={20} />
          <Skeleton variant="rounded" width={120} height={32} />
        </div>
        <div className="space-y-2">
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
        </div>
      </div>
    )
  }

  if (showEmptyState) {
    // When fetching failed or timed out, show error state instead of misleading "No operators"
    if (isFailed || loadingTimedOut) {
      return (
        <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-3">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <p className="text-sm">{t('operatorStatus.errorLoading', 'Unable to load operators')}</p>
          <p className="text-xs">{t('operatorStatus.errorLoadingHint', 'Failed after {{count}} attempts', { count: consecutiveFailures })}</p>
          <button
            onClick={() => refetch()}
            disabled={isRefreshing}
            className="mt-1 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            {t('common:common.retry', 'Retry')}
          </button>
        </div>
      )
    }
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">{t('operatorStatus.noOperators')}</p>
        <p className="text-xs mt-1">{t('operatorStatus.noOperatorsHint')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Controls row */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
        <div className="flex items-center gap-2">
          {totalItems > 0 && (
            <StatusBadge color="purple">
              {t('operatorStatus.nOperators', { count: totalItems })}
            </StatusBadge>
          )}
        </div>
        <CardControlsRow
          clusterIndicator={localClusterFilter.length > 0 ? {
            selectedCount: localClusterFilter.length,
            totalCount: availableClusters.length } : undefined}
          clusterFilter={{
            availableClusters,
            selectedClusters: localClusterFilter,
            onToggle: toggleClusterFilter,
            onClear: clearClusterFilter,
            isOpen: showClusterFilter,
            setIsOpen: setShowClusterFilter,
            containerRef: clusterFilterRef,
            minClusters: 1 }}
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => setSortBy(v as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection }}
        />
      </div>

      {availableClusters.length > 0 && (
        <>
          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4">
            {localClusterFilter.length === 1 ? (
              <ClusterBadge cluster={localClusterFilter[0]} />
            ) : localClusterFilter.length > 1 ? (
              <StatusBadge color="purple" size="md" rounded="full">
                {t('operatorStatus.nClustersSelected', { count: localClusterFilter.length })}
              </StatusBadge>
            ) : (
              <StatusBadge color="purple" size="md" rounded="full">
                {t('operatorStatus.allClusters', { count: availableClusters.length })}
              </StatusBadge>
            )}
          </div>

          {/* Local Search */}
          <CardSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t('operatorStatus.searchOperators')}
            className="mb-4"
          />

          {/* Summary */}
          <div className="flex gap-2 mb-4">
            <div className="flex-1 p-2 rounded-lg bg-green-500/10 text-center">
              <span className="text-lg font-bold text-green-400">{statusCounts.succeeded}</span>
              <p className="text-xs text-muted-foreground">{t('common:common.running')}</p>
            </div>
            <div className="flex-1 p-2 rounded-lg bg-red-500/10 text-center">
              <span className="text-lg font-bold text-red-400">{statusCounts.failed}</span>
              <p className="text-xs text-muted-foreground">{t('common:common.failed')}</p>
            </div>
            <div className="flex-1 p-2 rounded-lg bg-blue-500/10 text-center">
              <span className="text-lg font-bold text-blue-400">{statusCounts.other}</span>
              <p className="text-xs text-muted-foreground">{t('operatorStatus.other')}</p>
            </div>
          </div>

          {/* Operators list */}
          <div ref={containerRef} className="flex-1 space-y-2 overflow-y-auto" style={containerStyle} role="list">
            {operators.map((op, idx) => {
              const StatusIcon = getStatusIcon(op.status)
              const color = getStatusColor(op.status)
              const activate = () => {
                if (op.cluster) {
                  drillToOperator(op.cluster, op.namespace, op.name, {
                    status: op.status,
                    version: op.version,
                    upgradeAvailable: op.upgradeAvailable })
                }
              }
              // Issue 8883: roving-tabindex keyboard nav for the operators list.
              const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
                const list = e.currentTarget.parentElement
                const items = list ? Array.from(list.querySelectorAll<HTMLDivElement>('[data-keynav-item="operator"]')) : []
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  activate()
                } else if (e.key === 'ArrowDown' && idx < operators.length - 1) {
                  e.preventDefault()
                  items[idx + 1]?.focus()
                } else if (e.key === 'ArrowUp' && idx > 0) {
                  e.preventDefault()
                  items[idx - 1]?.focus()
                } else if (e.key === 'Home') {
                  e.preventDefault()
                  items[0]?.focus()
                } else if (e.key === 'End') {
                  e.preventDefault()
                  items[items.length - 1]?.focus()
                }
              }

              return (
                <div
                  key={`${op.cluster || 'unknown'}-${op.namespace}-${op.name}`}
                  data-keynav-item="operator"
                  role="button"
                  aria-label={t('common:actions.viewOperatorAria', { name: op.name })}
                  tabIndex={0}
                  onClick={activate}
                  onKeyDown={handleKeyDown}
                  className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group focus:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  <div className="flex flex-wrap items-center justify-between gap-y-2">
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`w-4 h-4 ${STATUS_ICON_CLASS[color]} ${op.status === 'Installing' ? 'animate-spin' : ''}`} />
                      {op.cluster && (
                        <ClusterBadge cluster={op.cluster} size="sm" />
                      )}
                      <span className="text-sm text-foreground group-hover:text-purple-400">{op.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {op.status !== 'Succeeded' && (
                        <CardAIActions
                          resource={{ kind: 'Operator', name: op.name, namespace: op.namespace, cluster: op.cluster, status: op.status }}
                          issues={[{ name: `Operator ${op.status}`, message: `Operator is in ${op.status} state${op.upgradeAvailable ? `, upgrade available: ${op.upgradeAvailable}` : ''}` }]}
                        />
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_BADGE_CLASS[color]}`}>
                        {op.status}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-1 ml-6 text-xs text-muted-foreground">
                    <span>{op.namespace}</span>
                    <span>{op.version}</span>
                    {op.upgradeAvailable && (
                      <span className="flex items-center gap-1 text-cyan-400">
                        <ArrowUpCircle className="w-3 h-3" />
                        {op.upgradeAvailable}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          <CardPaginationFooter
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
            onPageChange={goToPage}
            needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
          />

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            {t('operatorStatus.footer', { count: totalItems, scope: localClusterFilter.length === 1 ? localClusterFilter[0] : t('operatorStatus.nClustersScope', { count: availableClusters.length }) })}
          </div>
        </>
      )}
    </div>
  )
}

export function OperatorStatus(props: OperatorStatusProps) {
  return (
    <DynamicCardErrorBoundary cardId="OperatorStatus">
      <OperatorStatusInternal {...props} />
    </DynamicCardErrorBoundary>
  )
}
