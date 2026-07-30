import { useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, CheckCircle } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useCachedDeployments, useCachedDeploymentIssues, useCachedPodIssues } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards, deploymentsDashboardConfig } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'
import { migrateStorageKey } from '../../lib/dashboards/migrateStorageKey'
import { PageErrorBoundary } from '../PageErrorBoundary'

/** Storage key sourced from central dashboard config to prevent mismatches */
const DEPLOYMENTS_CARDS_KEY = deploymentsDashboardConfig.storageKey ?? 'deployments-dashboard-cards'

/** Old key used before the config was centralized — migrate saved layouts */
const LEGACY_DEPLOYMENTS_CARDS_KEY = 'kubestellar-deployments-cards'
migrateStorageKey(LEGACY_DEPLOYMENTS_CARDS_KEY, DEPLOYMENTS_CARDS_KEY)

// Default cards for the deployments dashboard
const DEFAULT_DEPLOYMENTS_CARDS = getDefaultCards('deployments')

function DeploymentsContent() {
  const { t } = useTranslation()
  // Use cached hooks for stale-while-revalidate pattern
  const { deployments, isLoading, isRefreshing: dataRefreshing, lastRefresh, refetch, error: deploymentsError } = useCachedDeployments()
  const { issues: deploymentIssues, refetch: refetchIssues, error: deploymentIssuesError } = useCachedDeploymentIssues()
  const { issues: podIssues, error: podIssuesError } = useCachedPodIssues()
  const { error: clustersError } = useClusters()
  const error = deploymentsError || deploymentIssuesError || podIssuesError || clustersError

  // Derive lastUpdated from cache timestamp
  const lastUpdated = lastRefresh ? new Date(lastRefresh) : null
  const { drillToAllDeployments, drillToAllPods } = useDrillDownActions()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()

  const handleRefresh = () => {
    refetch()
    refetchIssues()
  }

  // Filter deployments based on global selection
  const filteredDeployments = (deployments || []).filter(d =>
    isAllClustersSelected || (d.cluster && globalSelectedClusters.includes(d.cluster))
  )

  // #5954 — Deployment and pod issues must be filtered by the same cluster
  // selection so that per-cluster stats are consistent. Previously only
  // `filteredDeployments` was filtered while issue counts remained global,
  // producing misleading dashboards when a single cluster was selected.
  const filteredDeploymentIssues = (deploymentIssues || []).filter(i =>
    isAllClustersSelected || (i.cluster && globalSelectedClusters.includes(i.cluster))
  )
  const filteredPodIssues = (podIssues || []).filter(i =>
    isAllClustersSelected || (i.cluster && globalSelectedClusters.includes(i.cluster))
  )

  // Calculate current stats
  const currentTotalDeployments = filteredDeployments.length
  const currentHealthyDeployments = filteredDeployments.filter(d => d.readyReplicas === d.replicas && d.replicas > 0).length
  const currentIssueCount = filteredDeploymentIssues.length

  // Cache stats to prevent showing 0 during refresh
  const cachedStats = useRef({ total: 0, healthy: 0, issues: 0 })
  useEffect(() => {
    if (currentTotalDeployments > 0) {
      cachedStats.current = {
        total: currentTotalDeployments,
        healthy: currentHealthyDeployments,
        issues: currentIssueCount }
    }
  }, [currentTotalDeployments, currentHealthyDeployments, currentIssueCount])

  // Use cached values if current values are 0 (during refresh)
  const totalDeployments = currentTotalDeployments > 0 ? currentTotalDeployments : cachedStats.current.total
  const healthyDeployments = currentTotalDeployments > 0 ? currentHealthyDeployments : cachedStats.current.healthy
  const issueCount = currentTotalDeployments > 0 ? currentIssueCount : cachedStats.current.issues
  const routeState: 'loaded' | 'partial' | 'unavailable' | 'empty' = error && totalDeployments === 0
    ? 'unavailable'
    : isLoading && totalDeployments === 0
      ? 'partial'
      : totalDeployments === 0
        ? 'empty'
        : 'loaded'

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = (blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'namespaces':
        return {
          value: totalDeployments,
          sublabel: 'total deployments',
          onClick: () => drillToAllDeployments(),
          isClickable: totalDeployments > 0,
          groundtruthFields: {
            'deployments-total': totalDeployments,
            'deployments-available': healthyDeployments,
          },
        }
      case 'healthy':
        return { value: healthyDeployments, sublabel: 'healthy', onClick: () => drillToAllDeployments('healthy'), isClickable: healthyDeployments > 0 }
      case 'warning':
        return { value: Math.max(0, totalDeployments - healthyDeployments - issueCount), sublabel: 'degraded', onClick: () => drillToAllDeployments('degraded'), isClickable: totalDeployments - healthyDeployments - issueCount > 0 }
      case 'critical':
        return { value: issueCount, sublabel: 'with issues', onClick: () => drillToAllDeployments('issues'), isClickable: issueCount > 0 }
      case 'deployments':
        return {
          value: totalDeployments,
          sublabel: 'deployments',
          onClick: () => drillToAllDeployments(),
          isClickable: totalDeployments > 0,
          groundtruthFields: {
            'deployments-total': totalDeployments,
            'deployments-available': healthyDeployments,
          },
        }
      case 'pod_issues':
        return { value: filteredPodIssues.length, sublabel: 'pod issues', onClick: () => drillToAllPods('issues'), isClickable: filteredPodIssues.length > 0 }
      case 'deployment_issues':
        return { value: issueCount, sublabel: 'deploy issues', onClick: () => drillToAllDeployments('issues'), isClickable: issueCount > 0 }
      default:
        return { value: 0 }
    }
  }

  const getStatValue = getDashboardStatValue

  // #15906 — Build a deployment-specific health badge from the same issueCount
  // used by the stats cards. Previously the default DashboardHealthIndicator
  // counted pod issues via usePodIssues (global, unfiltered), causing the badge
  // to show "2 critical issues" while the stats cards correctly showed 0.
  const deploymentHealthBadge = useMemo(() => {
    if (issueCount > 0) {
      return (
        <span
          className="inline-flex items-center gap-1 rounded border font-medium px-1.5 py-0.5 text-2xs bg-red-500/10 text-red-400 border-red-500/30"
          title={`${issueCount} deployment${issueCount > 1 ? 's' : ''} with issues`}
          aria-label={`Deployment health: ${issueCount} critical issue${issueCount > 1 ? 's' : ''}`}
        >
          <AlertCircle className="w-3 h-3" />
          <span>{issueCount} critical issue{issueCount > 1 ? 's' : ''}</span>
        </span>
      )
    }
    return (
      <span
        className="inline-flex items-center gap-1 rounded border font-medium px-1.5 py-0.5 text-2xs bg-green-500/10 text-green-400 border-green-500/30"
        title="All deployments healthy"
        aria-label="Deployment health: all healthy"
      >
        <CheckCircle className="w-3 h-3" />
        <span>{t('deployments.allHealthy')}</span>
      </span>
    )
  }, [issueCount])

  return (
    <DashboardPage
      title="Deployments"
      subtitle="Monitor deployment health and rollout status"
      icon="Layers"
      afterTitle={deploymentHealthBadge}
      rightExtra={<RotatingTip page="deployments" />}
      storageKey={DEPLOYMENTS_CARDS_KEY}
      defaultCards={DEFAULT_DEPLOYMENTS_CARDS}
      statsType="deployments"
      getStatValue={getStatValue}
      onRefresh={handleRefresh}
      isLoading={isLoading}
      isRefreshing={dataRefreshing}
      lastUpdated={lastUpdated}
      hasData={deployments.length > 0}
      routeState={routeState}
      emptyState={{
        title: 'Deployments Dashboard',
        description: 'Add cards to monitor deployment health, rollout progress, and issues across your clusters.' }}
    >
      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">{t('deployments.errorLoading', 'Error loading deployment data')}</p>
            <p className="text-xs text-muted-foreground mt-1">{String(error)}</p>
          </div>
        </div>
      )}
    </DashboardPage>
  )
}

export function Deployments() {
  return (
    <PageErrorBoundary>
      <DeploymentsContent />
    </PageErrorBoundary>
  )
}
