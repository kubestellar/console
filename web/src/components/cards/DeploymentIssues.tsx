import { useMemo } from 'react'
import { AlertTriangle, AlertCircle, Clock, Scale, CheckCircle } from 'lucide-react'
import type { TFunction } from 'i18next'
import { useCachedDeploymentIssues } from '../../hooks/useCachedData'
import type { DeploymentIssue } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { ClusterBadge } from '../ui/ClusterBadge'
import { LimitedAccessWarning } from '../ui/LimitedAccessWarning'
import { useCardLoadingState } from './CardDataContext'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import {
  useCardData, commonComparators,
  CardSkeleton, CardEmptyState, CardSearchInput,
  CardControlsRow, CardListItem, CardPaginationFooter,
  CardAIActions,
} from '../../lib/cards'
import { useTranslation } from 'react-i18next'

type SortByOption = 'status' | 'name' | 'cluster'
type SortTranslationKey = 'common:common.status' | 'common:common.name' | 'common:common.cluster'

const SORT_OPTIONS_KEYS: ReadonlyArray<{ value: SortByOption; labelKey: SortTranslationKey }> = [
  { value: 'status' as const, labelKey: 'common:common.status' },
  { value: 'name' as const, labelKey: 'common:common.name' },
  { value: 'cluster' as const, labelKey: 'common:common.cluster' },
]

interface DeploymentIssuesProps {
  config?: Record<string, unknown>
}

const getIssueIcon = (status: string, t: TFunction<readonly ['cards', 'common']>): { icon: typeof AlertCircle; tooltip: string } => {
  if (status.includes('Unavailable')) return { icon: AlertCircle, tooltip: t('deploymentIssues.tooltipUnavailable') }
  if (status.includes('Progressing')) return { icon: Clock, tooltip: t('deploymentIssues.tooltipProgressing') }
  if (status.includes('ReplicaFailure')) return { icon: Scale, tooltip: t('deploymentIssues.tooltipReplicaFailure') }
  return { icon: AlertTriangle, tooltip: t('deploymentIssues.tooltipGeneric') }
}

function DeploymentIssuesInternal({ config }: DeploymentIssuesProps) {
  const { t } = useTranslation(['cards', 'common'])
  const SORT_OPTIONS = useMemo(() =>
    SORT_OPTIONS_KEYS.map(opt => ({ value: opt.value, label: String(t(opt.labelKey)) })),
    [t]
  )
  const clusterConfig = config?.cluster as string | undefined
  const namespaceConfig = config?.namespace as string | undefined
  const {
    issues: rawIssues,
    isLoading: hookLoading,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    error
  } = useCachedDeploymentIssues(clusterConfig, namespaceConfig)

  const { drillToDeployment } = useDrillDownActions()

  // Report loading state to CardWrapper for skeleton/refresh behavior
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: hookLoading,
    isDemoData: isDemoFallback,
    hasAnyData: rawIssues.length > 0,
    isFailed,
    consecutiveFailures,
  })

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: issues,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: localSearch,
      setSearch: setLocalSearch,
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters: availableClustersForFilter,
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
  } = useCardData<DeploymentIssue, SortByOption>(rawIssues, {
    filter: {
      searchFields: ['name', 'namespace', 'cluster', 'reason', 'message'],
      clusterField: 'cluster',
      storageKey: 'deployment-issues',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: {
        status: (a, b) => (a.reason || '').localeCompare(b.reason || ''),
        name: commonComparators.string('name'),
        cluster: (a, b) => (a.cluster || '').localeCompare(b.cluster || ''),
      },
    },
    defaultLimit: 5,
  })

  const handleDeploymentClick = (issue: DeploymentIssue) => {
    if (!issue.cluster) {
      // Can't drill down without a cluster
      return
    }
    drillToDeployment(issue.cluster, issue.namespace, issue.name, {
      replicas: issue.replicas,
      readyReplicas: issue.readyReplicas,
      reason: issue.reason,
      message: issue.message,
    })
  }

  if (showSkeleton) {
    return <CardSkeleton type="list" rows={3} showHeader rowHeight={100} />
  }

  if (issues.length === 0 && rawIssues.length === 0) {
    return (
      <CardEmptyState
        icon={CheckCircle}
        title={t('deploymentIssues.allHealthy')}
        message={t('deploymentIssues.noIssuesDetected')}
        variant="success"
      />
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">{t('deploymentIssues.noIssues')}</p>
        <p className="text-xs mt-1">{t('deploymentIssues.allHealthy')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400" title={t('deploymentIssues.issuesTitle', { count: rawIssues.length })}>
            {t('deploymentIssues.nIssues', { count: rawIssues.length })}
          </span>
        </div>
        <CardControlsRow
          clusterIndicator={{
            selectedCount: localClusterFilter.length,
            totalCount: availableClustersForFilter.length,
          }}
          clusterFilter={{
            availableClusters: availableClustersForFilter,
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

      {/* Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder={t('common:common.searchIssues')}
        className="mb-3"
      />

      {/* Issues list */}
      <div className="flex-1 space-y-3 overflow-y-auto min-h-card-content">
        {issues.map((issue, idx) => {
          const { icon: Icon, tooltip: iconTooltip } = getIssueIcon(issue.reason || '', t)

          return (
            <CardListItem
              key={`${issue.name}-${idx}`}
              onClick={() => handleDeploymentClick(issue)}
              bgClass="bg-red-500/10"
              borderClass="border-red-500/20"
              title={t('deploymentIssues.clickToView', { name: issue.name })}
            >
              <div className="flex items-start gap-3 group">
                <div className="p-2 rounded-lg bg-red-500/20 flex-shrink-0" title={iconTooltip}>
                  <Icon className="w-4 h-4 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <ClusterBadge cluster={issue.cluster || 'unknown'} />
                    <span className="text-xs text-muted-foreground" title={`Namespace: ${issue.namespace}`}>{issue.namespace}</span>
                  </div>
                  <p className="text-sm font-medium text-foreground truncate" title={issue.name}>{issue.name}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400" title={`Issue: ${issue.reason || 'Unknown'}`}>
                      {issue.reason || 'Issue'}
                    </span>
                    <span className="text-xs text-muted-foreground" title={t('deploymentIssues.replicasReady', { ready: issue.readyReplicas, total: issue.replicas })}>
                      {issue.readyReplicas}/{issue.replicas} {t('common:common.ready')}
                    </span>
                  </div>
                  {issue.message && (
                    <p className="text-xs text-muted-foreground mt-1 truncate" title={issue.message}>
                      {issue.message}
                    </p>
                  )}
                </div>
                {/* AI Diagnose, Repair & Ask actions */}
                <CardAIActions
                  resource={{
                    kind: 'Deployment',
                    name: issue.name,
                    namespace: issue.namespace,
                    cluster: issue.cluster || 'default',
                    status: issue.reason || 'Issue',
                  }}
                  issues={[{ name: issue.reason || 'Unknown', message: issue.message || 'Deployment issue' }]}
                  additionalContext={{ replicas: issue.replicas, readyReplicas: issue.readyReplicas }}
                />
              </div>
            </CardListItem>
          )
        })}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 5}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />

      <LimitedAccessWarning hasError={!!error} className="mt-2" />
    </div>
  )
}

export function DeploymentIssues(props: DeploymentIssuesProps) {
  return (
    <DynamicCardErrorBoundary cardId="DeploymentIssues">
      <DeploymentIssuesInternal {...props} />
    </DynamicCardErrorBoundary>
  )
}
