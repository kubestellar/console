import { useMemo, useCallback, useRef, useState } from 'react'
import { ChevronRight, RefreshCw, Trash2, Terminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useClusters } from '../../hooks/useMCP'
import { useCachedPodIssues } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { useModal } from '../../hooks/useModal'
import { StatusIndicator } from '../charts/StatusIndicator'
import { ClusterBadge } from '../ui/ClusterBadge'
import { Skeleton } from '../ui/Skeleton'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'
import { TechnicalAcronym, STATUS_TOOLTIPS } from '../shared/TechnicalAcronym'
import { PortalTooltip } from '../cards/llmd/shared/PortalTooltip'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { useToast } from '../ui/Toast'
import { ConfirmDialog } from '../../lib/modals/ConfirmDialog'

/** Target pod metadata for the delete confirmation dialog */
interface PendingDeleteTarget {
  cluster: string
  namespace: string
  name: string
}

const PODS_CARDS_KEY = 'kubestellar-pods-cards'

// Default cards for the pods dashboard
const DEFAULT_POD_CARDS = getDefaultCards('pods')

export function Pods() {
  const { t } = useTranslation()
  // Use cached hooks for stale-while-revalidate pattern
  const { issues: podIssues, isLoading: podIssuesLoading, isRefreshing: podIssuesRefreshing, lastRefresh: podIssuesLastRefresh, refetch: refetchPodIssues } = useCachedPodIssues()
  const { deduplicatedClusters: clusters, isLoading: clustersLoading, refetch: refetchClusters } = useClusters()

  // Derive lastUpdated from cache timestamp
  const lastUpdated = podIssuesLastRefresh ? new Date(podIssuesLastRefresh) : null
  const handleRefresh = () => { refetchPodIssues(); refetchClusters() }
  const { drillToPod, drillToAllPods, drillToAllClusters } = useDrillDownActions()
  const { showToast } = useToast()

  // State for the custom delete-confirmation dialog
  const deleteConfirm = useModal()
  const [isDeleting, setIsDeleting] = useState(false)
  const pendingDeleteRef = useRef<PendingDeleteTarget | null>(null)

  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
    filterByCluster } = useGlobalFilters()

  // Combined loading/refreshing states
  const isLoading = podIssuesLoading || clustersLoading
  const isRefreshing = podIssuesRefreshing
  const isModeSwitching = useIsModeSwitching()
  // Show skeleton during mode switching for smooth transitions
  const showSkeletons = (podIssues.length === 0 && isLoading) || isModeSwitching

  // Handler for keyboard navigation on pod issue cards
  const handlePodIssueKeyDown = (e: React.KeyboardEvent, cluster: string | undefined, namespace: string, name: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault() // Prevent default for both Enter and Space to match button behavior
      if (cluster) {
        drillToPod(cluster, namespace, name)
      }
    }
  }

  const handleShowLogs = (e: React.MouseEvent, cluster: string, namespace: string, name: string) => {
    e.stopPropagation()
    drillToPod(cluster, namespace, name, { tab: 'logs' })
  }

  const handleRestartPod = async (e: React.MouseEvent, cluster: string, namespace: string, name: string) => {
    e.stopPropagation()
    try {
      showToast(t('pods.restarting', 'Restarting pod...'), 'info')
      await kubectlProxy.exec(['delete', 'pod', name, '-n', namespace], { context: cluster })
      showToast(t('pods.restartSuccess', 'Pod deletion triggered (it will restart if managed)'), 'success')
      refetchPodIssues()
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err)
      showToast(t('pods.restartErrorDetail', 'Failed to restart pod: {{detail}}', { detail }), 'error')
    }
  }

  /** Open the custom confirm dialog instead of window.confirm() */
  const handleDeletePod = (e: React.MouseEvent, cluster: string, namespace: string, name: string) => {
    e.stopPropagation()
    pendingDeleteRef.current = { cluster, namespace, name }
    deleteConfirm.open()
  }

  /** Execute the deletion after the user confirms via ConfirmDialog */
  const executeDeletePod = useCallback(async () => {
    const target = pendingDeleteRef.current
    if (!target) return
    setIsDeleting(true)
    try {
      showToast(t('pods.deleting', 'Deleting pod...'), 'info')
      await kubectlProxy.exec(['delete', 'pod', target.name, '-n', target.namespace], { context: target.cluster })
      showToast(t('pods.deleteSuccess', 'Pod deleted'), 'success')
      refetchPodIssues()
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err)
      showToast(t('pods.deleteErrorDetail', 'Failed to delete pod: {{detail}}', { detail }), 'error')
    } finally {
      setIsDeleting(false)
      deleteConfirm.close()
      pendingDeleteRef.current = null
    }
  }, [showToast, t, refetchPodIssues, deleteConfirm.close])

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
  }, [podIssues, customFilter, filterByCluster])

  // Calculate stats
  const stats = useMemo(() => {
    // Use filtered clusters matching the global selection for pod/cluster counts (#7349)
    const visibleClusters = clusters.filter(c =>
      isAllClustersSelected || globalSelectedClusters.includes(c.name)
    )
    const totalPods = visibleClusters.reduce((sum, c) => sum + (c.podCount || 0), 0)
    // Dedup issue rows by pod name to avoid under-counting healthy pods (#7348)
    const uniqueIssuePods = new Set(filteredPodIssues.map(p => `${p.cluster}/${p.namespace}/${p.name}`))
    const issueCount = filteredPodIssues.length
    const pendingCount = filteredPodIssues.filter(p => p.reason === 'Pending' || p.status === 'Pending').length
    const restartCount = filteredPodIssues.filter(p => (p.restarts || 0) > 5).length
    const clusterCount = visibleClusters.length

    return {
      totalPods,
      healthy: Math.max(0, totalPods - uniqueIssuePods.size),
      issues: issueCount,
      pending: pendingCount,
      restarts: restartCount,
      clusters: clusterCount
    }
  }, [clusters, filteredPodIssues, isAllClustersSelected, globalSelectedClusters])

  // Dashboard-specific stats value getter
  const getDashboardStatValue = (blockId: string): StatBlockValue => {
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
  }

  // Merged getter: dashboard-specific values first, then universal fallback
  const getStatValue = getDashboardStatValue

  return (
    <DashboardPage
      title="Pods"
      subtitle="Monitor pod health and issues across clusters"
      icon="Hexagon"
      rightExtra={<RotatingTip page="pods" />}
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
        description: 'Add cards to monitor pod health, issues, and resource usage across your clusters.'
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
          <div className="text-lg text-foreground">{t('pods.noPodIssues', 'No Pod Issues')}</div>
          <div className="text-sm text-muted-foreground">All pods are running healthy across your clusters</div>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground mb-4">Pod Issues ({filteredPodIssues.length})</h2>
          {filteredPodIssues.map((issue, i) => (
            <div
              key={i}
              onClick={() => issue.cluster && drillToPod(issue.cluster, issue.namespace, issue.name)}
              onKeyDown={(e) => handlePodIssueKeyDown(e, issue.cluster, issue.namespace, issue.name)}
              role="button"
              tabIndex={issue.cluster ? 0 : -1}
              aria-disabled={!issue.cluster || undefined}
              aria-label={`View pod issue: ${issue.name} in ${issue.namespace}${issue.cluster ? ` on ${issue.cluster.split('/').pop() || issue.cluster}` : ''}`}
              className={`glass p-4 rounded-lg transition-all border-l-4 ${issue.cluster ? 'cursor-pointer hover:scale-[1.01]' : 'cursor-default'
                } ${issue.reason === 'CrashLoopBackOff' || issue.reason === 'OOMKilled' ? 'border-l-red-500' :
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
                      <div className="text-xs text-muted-foreground">{t('pods.restarts', 'Restarts')}</div>
                    </div>
                  )}

                  <div className="flex items-center gap-1">
                    <PortalTooltip content={t('common.restart', 'Restart')}>
                      <button
                        onClick={(e) => issue.cluster && handleRestartPod(e, issue.cluster, issue.namespace, issue.name)}
                        className="p-1.5 hover:bg-white/10 rounded-md text-muted-foreground hover:text-blue-400 transition-colors"
                        aria-label="Restart pod"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </PortalTooltip>

                    <PortalTooltip content={t('common.logs', 'Logs')}>
                      <button
                        onClick={(e) => issue.cluster && handleShowLogs(e, issue.cluster, issue.namespace, issue.name)}
                        className="p-1.5 hover:bg-white/10 rounded-md text-muted-foreground hover:text-purple-400 transition-colors"
                        aria-label="View logs"
                      >
                        <Terminal className="w-4 h-4" />
                      </button>
                    </PortalTooltip>

                    <PortalTooltip content={t('common.delete', 'Delete')}>
                      <button
                        onClick={(e) => issue.cluster && handleDeletePod(e, issue.cluster, issue.namespace, issue.name)}
                        className="p-1.5 hover:bg-white/10 rounded-md text-muted-foreground hover:text-red-400 transition-colors"
                        aria-label="Delete pod"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </PortalTooltip>
                  </div>

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
            .map((cluster) => {
              const clusterStatus = cluster.reachable === false ? 'unreachable' : cluster.healthy ? 'healthy' : 'error'
              return (
                <div key={cluster.name} className="glass p-3 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <PortalTooltip content={STATUS_TOOLTIPS[clusterStatus]}>
                      <span>
                        <StatusIndicator
                          status={clusterStatus}
                          size="sm"
                        />
                      </span>
                    </PortalTooltip>
                    <span className="font-medium text-foreground text-sm truncate">
                      {cluster.context || cluster.name.split('/').pop()}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {cluster.reachable !== false ? (cluster.podCount ?? '-') : '-'} pods
                  </div>
                </div>
              )
            })}
        </div>
      </div>
      {/* Delete-confirmation dialog (replaces window.confirm) */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => { deleteConfirm.close(); pendingDeleteRef.current = null }}
        onConfirm={executeDeletePod}
        title={t('pods.confirmDeleteTitle', 'Delete Pod')}
        message={t('pods.confirmDeleteMessage', 'Are you sure you want to delete pod {{name}}? This action cannot be undone.', { name: pendingDeleteRef.current?.name ?? '' })}
        confirmLabel={t('common.delete', 'Delete')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="danger"
        isLoading={isDeleting}
      />
    </DashboardPage>
  )
}
