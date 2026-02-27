import { useMemo } from 'react'
import { CheckCircle, AlertTriangle, XCircle, RefreshCw, ArrowUpCircle, ChevronRight } from 'lucide-react'
import { useClusters, useOperators, Operator } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useDemoMode } from '../../hooks/useDemoMode'
import { ClusterBadge } from '../ui/ClusterBadge'
import { Skeleton } from '../ui/Skeleton'
import { useCardLoadingState } from './CardDataContext'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import {
  useCardData,
  useCardFilters,
  commonComparators,
  type SortDirection,
} from '../../lib/cards'
import {
  CardSearchInput,
  CardControlsRow,
  CardPaginationFooter,
  CardAIActions,
} from '../../lib/cards/CardComponents'
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
  version: commonComparators.string<Operator>('version'),
}

// Shared filter config for counting and display
const FILTER_CONFIG = {
  searchFields: ['name', 'namespace', 'version'] as (keyof Operator)[],
  clusterField: 'cluster' as keyof Operator,
  statusField: 'status' as keyof Operator,
  storageKey: 'operator-status',
}

function OperatorStatusInternal({ config: _config }: OperatorStatusProps) {
  const { t } = useTranslation(['cards', 'common'])
  const SORT_OPTIONS = useMemo(() =>
    SORT_OPTIONS_KEYS.map(opt => ({ value: opt.value, label: String(t(opt.labelKey)) })),
    [t]
  )
  const { isLoading: clustersLoading } = useClusters()
  const { drillToOperator } = useDrillDownActions()
  const { isDemoMode: demoMode } = useDemoMode()

  // Fetch operators - pass undefined to get all clusters
  const { operators: rawOperators, isLoading: operatorsLoading, consecutiveFailures, isFailed } = useOperators(undefined)

  // Report card data state
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: clustersLoading || operatorsLoading,
    hasAnyData: rawOperators.length > 0,
    isFailed,
    consecutiveFailures,
    isDemoData: demoMode,
  })

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
      clusterFilterRef,
    },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection,
    },
  } = useCardData<Operator, SortByOption>(rawOperators, {
    filter: {
      searchFields: ['name', 'namespace', 'version'] as (keyof Operator)[],
      clusterField: 'cluster',
      statusField: 'status',
      storageKey: 'operator-status',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc' as SortDirection,
      comparators: OPERATOR_SORT_COMPARATORS,
    },
    defaultLimit: 5,
  })

  const getStatusIcon = (status: Operator['status']) => {
    switch (status) {
      case 'Succeeded': return CheckCircle
      case 'Failed': return XCircle
      case 'Installing': return RefreshCw
      case 'Upgrading': return ArrowUpCircle
      default: return AlertTriangle
    }
  }

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
  const statusCounts = useMemo(() => ({
    succeeded: globalFilteredOperators.filter(o => o.status === 'Succeeded').length,
    failed: globalFilteredOperators.filter(o => o.status === 'Failed').length,
    other: globalFilteredOperators.filter(o => !['Succeeded', 'Failed'].includes(o.status)).length,
  }), [globalFilteredOperators])

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {totalItems > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
              {t('operatorStatus.nOperators', { count: totalItems })}
            </span>
          )}
        </div>
        <CardControlsRow
          clusterIndicator={localClusterFilter.length > 0 ? {
            selectedCount: localClusterFilter.length,
            totalCount: availableClusters.length,
          } : undefined}
          clusterFilter={{
            availableClusters,
            selectedClusters: localClusterFilter,
            onToggle: toggleClusterFilter,
            onClear: clearClusterFilter,
            isOpen: showClusterFilter,
            setIsOpen: setShowClusterFilter,
            containerRef: clusterFilterRef,
            minClusters: 1,
          }}
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => setSortBy(v as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection,
          }}
        />
      </div>

      {availableClusters.length > 0 && (
        <>
          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4">
            {localClusterFilter.length === 1 ? (
              <ClusterBadge cluster={localClusterFilter[0]} />
            ) : localClusterFilter.length > 1 ? (
              <span className="text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-400">
                {t('operatorStatus.nClustersSelected', { count: localClusterFilter.length })}
              </span>
            ) : (
              <span className="text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-400">
                {t('operatorStatus.allClusters', { count: availableClusters.length })}
              </span>
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
          <div className="flex-1 space-y-2 overflow-y-auto">
            {operators.map((op) => {
              const StatusIcon = getStatusIcon(op.status)
              const color = getStatusColor(op.status)

              return (
                <div
                  key={`${op.cluster || 'unknown'}-${op.namespace}-${op.name}`}
                  onClick={() => op.cluster && drillToOperator(op.cluster, op.namespace, op.name, {
                    status: op.status,
                    version: op.version,
                    upgradeAvailable: op.upgradeAvailable,
                  })}
                  className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`w-4 h-4 text-${color}-400 ${op.status === 'Installing' ? 'animate-spin' : ''}`} />
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
                      <span className={`text-xs px-1.5 py-0.5 rounded bg-${color}-500/20 text-${color}-400`}>
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
