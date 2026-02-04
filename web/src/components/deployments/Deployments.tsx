import { useCallback, useRef, useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useCachedDeployments, useCachedDeploymentIssues, useCachedPodIssues } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards'
import { getDefaultCards } from '../../config/dashboards'

const DEPLOYMENTS_CARDS_KEY = 'kubestellar-deployments-cards'

// Default cards for the deployments dashboard
const DEFAULT_DEPLOYMENTS_CARDS = getDefaultCards('deployments')

export function Deployments() {
  // Use cached hooks for stale-while-revalidate pattern
  const { deployments, isLoading, isRefreshing: dataRefreshing, lastRefresh, refetch, error: deploymentsError } = useCachedDeployments()
  const { issues: deploymentIssues, refetch: refetchIssues, error: deploymentIssuesError } = useCachedDeploymentIssues()
  const { issues: podIssues, error: podIssuesError } = useCachedPodIssues()
  const { error: clustersError } = useClusters()
  const error = deploymentsError || deploymentIssuesError || podIssuesError || clustersError

  // Derive lastUpdated from cache timestamp
  const lastUpdated = lastRefresh ? new Date(lastRefresh) : null
  const { drillToAllDeployments, drillToAllPods } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()

  const handleRefresh = useCallback(() => {
    refetch()
    refetchIssues()
  }, [refetch, refetchIssues])

  // Filter deployments based on global selection
  const filteredDeployments = deployments.filter(d =>
    isAllClustersSelected || (d.cluster && globalSelectedClusters.includes(d.cluster))
  )

  // Calculate current stats
  const currentTotalDeployments = filteredDeployments.length
  const currentHealthyDeployments = filteredDeployments.filter(d => d.readyReplicas === d.replicas && d.replicas > 0).length
  const currentIssueCount = deploymentIssues.length

  // Cache stats to prevent showing 0 during refresh
  const cachedStats = useRef({ total: 0, healthy: 0, issues: 0 })
  useEffect(() => {
    if (currentTotalDeployments > 0) {
      cachedStats.current = {
        total: currentTotalDeployments,
        healthy: currentHealthyDeployments,
        issues: currentIssueCount,
      }
    }
  }, [currentTotalDeployments, currentHealthyDeployments, currentIssueCount])

  // Use cached values if current values are 0 (during refresh)
  const totalDeployments = currentTotalDeployments > 0 ? currentTotalDeployments : cachedStats.current.total
  const healthyDeployments = currentTotalDeployments > 0 ? currentHealthyDeployments : cachedStats.current.healthy
  const issueCount = currentTotalDeployments > 0 ? currentIssueCount : cachedStats.current.issues

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'namespaces':
        return { value: totalDeployments, sublabel: 'total deployments', onClick: () => drillToAllDeployments(), isClickable: totalDeployments > 0 }
      case 'healthy':
        return { value: healthyDeployments, sublabel: 'healthy', onClick: () => drillToAllDeployments('healthy'), isClickable: healthyDeployments > 0 }
      case 'warning':
        return { value: Math.max(0, totalDeployments - healthyDeployments - issueCount), sublabel: 'degraded', onClick: () => drillToAllDeployments('degraded'), isClickable: totalDeployments - healthyDeployments - issueCount > 0 }
      case 'critical':
        return { value: issueCount, sublabel: 'with issues', onClick: () => drillToAllDeployments('issues'), isClickable: issueCount > 0 }
      case 'deployments':
        return { value: totalDeployments, sublabel: 'deployments', onClick: () => drillToAllDeployments(), isClickable: totalDeployments > 0 }
      case 'pod_issues':
        return { value: podIssues.length, sublabel: 'pod issues', onClick: () => drillToAllPods('issues'), isClickable: podIssues.length > 0 }
      case 'deployment_issues':
        return { value: issueCount, sublabel: 'deploy issues', onClick: () => drillToAllDeployments('issues'), isClickable: issueCount > 0 }
      default:
        return { value: 0 }
    }
  }, [totalDeployments, healthyDeployments, issueCount, podIssues, drillToAllDeployments, drillToAllPods])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  return (
    <DashboardPage
      title="Deployments"
      subtitle="Monitor deployment health and rollout status"
      icon="Rocket"
      storageKey={DEPLOYMENTS_CARDS_KEY}
      defaultCards={DEFAULT_DEPLOYMENTS_CARDS}
      statsType="workloads"
      getStatValue={getStatValue}
      onRefresh={handleRefresh}
      isLoading={isLoading}
      isRefreshing={dataRefreshing}
      lastUpdated={lastUpdated}
      hasData={deployments.length > 0}
      emptyState={{
        title: 'Deployments Dashboard',
        description: 'Add cards to monitor deployment health, rollout progress, and issues across your clusters.',
      }}
    >
      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">Error loading deployment data</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}
    </DashboardPage>
  )
}
