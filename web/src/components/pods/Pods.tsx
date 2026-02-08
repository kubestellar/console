import { useCallback, useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useCachedPodIssues } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { StatusIndicator } from '../charts/StatusIndicator'
import { ClusterBadge } from '../ui/ClusterBadge'
import { Skeleton } from '../ui/Skeleton'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { TechnicalAcronym, STATUS_TOOLTIPS } from '../shared/TechnicalAcronym'
import { PortalTooltip } from '../cards/llmd/shared/PortalTooltip'

const PODS_CARDS_KEY = 'kubestellar-pods-cards'

// Default cards for the pods dashboard
const DEFAULT_POD_CARDS = getDefaultCards('pods')

export function Pods() {
  // Use cached hooks for stale-while-revalidate pattern
  const { issues: podIssues, isLoading: podIssuesLoading, isRefreshing: podIssuesRefreshing, lastRefresh: podIssuesLastRefresh, refetch: refetchPodIssues } = useCachedPodIssues()
  const { clusters, isLoading: clustersLoading, refetch: refetchClusters } = useClusters()

  // Derive lastUpdated from cache timestamp
  const lastUpdated = podIssuesLastRefresh ? new Date(podIssuesLastRefresh) : null
  const handleRefresh = useCallback(() => { refetchPodIssues(); refetchClusters() }, [refetchPodIssues, refetchClusters])
  const { drillToPod, drillToAllPods, drillToAllClusters } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
    filterByCluster,
  } = useGlobalFilters()

  // Combined loading/refreshing states
  const isLoading = podIssuesLoading || clustersLoading
  const isRefreshing = podIssuesRefreshing
  const isModeSwitching = useIsModeSwitching()
  // Show skeleton during mode switching for smooth transitions
  const showSkeletons = (podIssues.length === 0 && isLoading) || isModeSwitching

  // Filter pod issues by global cluster selection
  const filteredPodIssues = useMemo(() => {
    // Apply cluster filtering using the built-in helper
    let filtered = filterByCluster(podIssues)

    // Apply custom text filtering
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      filtered = filtered.filter(issue =>
        issue.name.toLowerCase().includes(query) ||
        issue.namespace.toLowerCase().includes(query) ||
        (issue.cluster && issue.cluster.toLowerCase().includes(query)) ||
        (issue.reason && issue.reason.toLowerCase().includes(query))
      )
    }

    return filtered
  }, [podIssues, filterByCluster, customFilter])

  // Calculate stats
  const stats = useMemo(() => {
    const totalPods = clusters.reduce((sum, c) => sum + (c.podCount || 0), 0)
    const issueCount = filteredPodIssues.length
    const pendingCount = filteredPodIssues.filter(p => p.reason === 'Pending' || p.status === 'Pending').length
    const restartCount = filteredPodIssues.filter(p => (p.restarts || 0) > 5).length
    const clusterCount = isAllClustersSelected ? clusters.length : globalSelectedClusters.length

    return {
      totalPods,
      healthy: Math.max(0, totalPods - issueCount),
      issues: issueCount,
      pending: pendingCount,
      restarts: restartCount,
      clusters: clusterCount,
    }
  }, [clusters, filteredPodIssues, isAllClustersSelected, globalSelectedClusters])

  // Dashboard-specific stats value getter
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'total_pods':
        return { value: stats.totalPods, sublabel: 'total pods', onClick: () => drillToAllPods(), isClickable: stats.totalPods > 0 }
      case 'healthy':
        return { value: stats.healthy, sublabel: 'healthy pods', onClick: () => drillToAllPods('healthy'), isClickable: stats.healthy > 0 }
      case 'issues':
        return { value: stats.issues, sublabel: 'pod issues', onClick: () => drillToAllPods('issues'), isClickable: stats.issues > 0 }
      case 'pending':
        return { value: stats.pending, sublabel: 'pending pods', onClick: () => drillToAllPods('pending'), isClickable: stats.pending > 0 }
      case 'restarts':
        return { value: stats.restarts, sublabel: 'high restart pods', onClick: () => drillToAllPods('restarts'), isClickable: stats.restarts > 0 }
      case 'clusters':
        return { value: stats.clusters, sublabel: 'clusters', onClick: () => drillToAllClusters(), isClickable: stats.clusters > 0 }
      default:
        return { value: '-', sublabel: '' }
    }
  }, [stats, drillToAllPods, drillToAllClusters])

  // Merged getter: dashboard-specific values first, then universal fallback
  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  return (
    <DashboardPage
      title="Pods"
      subtitle="Monitor pod health and issues across clusters"
      icon="Box"
      storageKey={PODS_CARDS_KEY}
      defaultCards={DEFAULT_POD_CARDS}
      statsType="pods"
      getStatValue={getStatValue}
      onRefresh={handleRefresh}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      lastUpdated={lastUpdated}
      hasData={stats.totalPods > 0}
      emptyState={{
        title: 'Pods Dashboard',
        description: 'Add cards to monitor pod health, issues, and resource usage across your clusters.',
      }}
    >
      {/* Pod Issues List */}
      {showSkeletons ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="glass p-4 rounded-lg border-l-4 border-l-gray-500/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Skeleton variant="circular" width={24} height={24} />
                  <div>
                    <Skeleton variant="text" width={150} height={20} className="mb-1" />
                    <Skeleton variant="rounded" width={80} height={18} />
                  </div>
                </div>
                <Skeleton variant="text" width={100} height={20} />
              </div>
            </div>
          ))}
        </div>
      ) : filteredPodIssues.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🎉</div>
          <p className="text-lg text-foreground">No Pod Issues</p>
          <p className="text-sm text-muted-foreground">All pods are running healthy across your clusters</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground mb-4">Pod Issues ({filteredPodIssues.length})</h2>
          {filteredPodIssues.map((issue, i) => (
            <div
              key={i}
              onClick={() => issue.cluster && drillToPod(issue.cluster, issue.namespace, issue.name)}
              className={`glass p-4 rounded-lg cursor-pointer transition-all hover:scale-[1.01] border-l-4 ${
                issue.reason === 'CrashLoopBackOff' || issue.reason === 'OOMKilled' ? 'border-l-red-500' :
                issue.reason === 'Pending' || issue.reason === 'ContainerCreating' ? 'border-l-yellow-500' :
                'border-l-orange-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {(() => {
                    const status = issue.reason === 'CrashLoopBackOff' || issue.reason === 'OOMKilled' ? 'error' : 'warning';
                    return (
                      <PortalTooltip content={STATUS_TOOLTIPS[status]}>
                        <span>
                          <StatusIndicator
                            status={status}
                            size="lg"
                          />
                        </span>
                      </PortalTooltip>
                    );
                  })()}
                  <div>
                    <h3 className="font-semibold text-foreground">{issue.name}</h3>
                    <div className="flex items-center gap-2">
                      <ClusterBadge cluster={issue.cluster?.split('/').pop() || 'unknown'} size="sm" />
                      <span className="text-xs text-muted-foreground">{issue.namespace}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-sm font-medium text-orange-400">
                      {issue.reason === 'CrashLoopBackOff' || issue.reason === 'OOMKilled' ? (
                        <TechnicalAcronym term={issue.reason}>{issue.reason}</TechnicalAcronym>
                      ) : (
                        issue.reason || 'Unknown'
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{issue.status || 'Unknown status'}</div>
                  </div>
                  {(issue.restarts || 0) > 0 && (
                    <div className="text-center">
                      <div className="text-lg font-bold text-red-400">{issue.restarts}</div>
                      <div className="text-xs text-muted-foreground">Restarts</div>
                    </div>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Clusters Summary */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">Clusters Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {clusters
            .filter(cluster => isAllClustersSelected || globalSelectedClusters.includes(cluster.name))
            .map((cluster) => (
            <div key={cluster.name} className="glass p-3 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <StatusIndicator
                  status={cluster.reachable === false ? 'unreachable' : cluster.healthy ? 'healthy' : 'error'}
                  size="sm"
                />
                <span className="font-medium text-foreground text-sm truncate">
                  {cluster.context || cluster.name.split('/').pop()}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {cluster.reachable !== false ? (cluster.podCount ?? '-') : '-'} pods
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardPage>
  )
}
