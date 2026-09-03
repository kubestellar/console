import { useMemo, useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { useModal } from '../../hooks/useModal'
import { useToast } from '../ui/Toast'
import { useBackendHealth } from '../../hooks/useBackendHealth'
import { kubectlProxy } from '../../lib/kubectlProxy'
import type { PodIssue } from '../../hooks/mcp/types.workloads'
import { isPendingPhasePodIssue } from './podPhaseClassification'
import type { ClusterInfo } from '../../hooks/mcp/types'
import type { StatBlockValue } from '../ui/StatsOverview'

/** Target pod metadata for the delete confirmation dialog */
export interface PendingDeleteTarget {
  cluster: string
  namespace: string
  name: string
}

export interface PodsStats {
  totalPods: number
  healthy: number
  issues: number
  pending: number
  crashloop: number
  restarts: number
  clusters: number
}

export interface UsePodsViewParams {
  podIssues: PodIssue[] | undefined
  isLoading: boolean
  clusters: ClusterInfo[] | undefined
  refetchPodIssues: () => void | Promise<void>
  refetchClusters: () => void | Promise<void>
  podIssuesLastRefresh: number | null
}

export interface UsePodsViewResult {
  filteredPodIssues: PodIssue[]
  stats: PodsStats
  showSkeletons: boolean
  lastUpdated: Date | null
  handleRefresh: () => void
  backendActionUnavailable: boolean
  backendUnavailableMessage: string
  backendStaleStatusMessage: string
  deleteConfirm: { isOpen: boolean; open: () => void; close: () => void }
  isDeleting: boolean
  pendingDeleteRef: React.MutableRefObject<PendingDeleteTarget | null>
  executeDeletePod: () => Promise<void>
  handlePodIssueKeyDown: (
    e: React.KeyboardEvent,
    cluster: string | undefined,
    namespace: string,
    name: string,
    issueData?: Record<string, unknown>,
  ) => void
  handleShowLogs: (e: React.MouseEvent, cluster: string, namespace: string, name: string) => void
  handleRestartPod: (e: React.MouseEvent, cluster: string, namespace: string, name: string) => Promise<void>
  handleDeletePod: (e: React.MouseEvent, cluster: string, namespace: string, name: string) => void
  drillToPod: (cluster: string, namespace: string, pod: string, podData?: Record<string, unknown>) => void
  drillToAllPods: (filter?: string, filterData?: Record<string, unknown>) => void
  drillToAllClusters: (filter?: string, filterData?: Record<string, unknown>) => void
  getDashboardStatValue: (blockId: string) => StatBlockValue
  globalSelectedClusters: string[]
  isAllClustersSelected: boolean
}

export function usePodsView({
  podIssues,
  isLoading,
  clusters,
  refetchPodIssues,
  refetchClusters,
  podIssuesLastRefresh,
}: UsePodsViewParams): UsePodsViewResult {
  const { t } = useTranslation()
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
    filterByCluster,
  } = useGlobalFilters()
  const isModeSwitching = useIsModeSwitching()
  const deleteConfirm = useModal()
  const [isDeleting, setIsDeleting] = useState(false)
  const pendingDeleteRef = useRef<PendingDeleteTarget | null>(null)
  const { showToast } = useToast()
  const { status: backendStatus, inCluster } = useBackendHealth()
  const { drillToPod, drillToAllPods, drillToAllClusters } = useDrillDownActions()

  const backendActionUnavailable = inCluster && backendStatus === 'disconnected'
  const backendUnavailableMessage = t(
    'pods.backendUnavailable',
    'Backend unavailable — pod actions are disabled until the connection returns.',
  )
  const backendStaleStatusMessage = t(
    'pods.backendStatusStale',
    'Pod status is showing the last successful backend snapshot until the connection returns.',
  )

  const lastUpdated = podIssuesLastRefresh ? new Date(podIssuesLastRefresh) : null
  const handleRefresh = () => { refetchPodIssues(); refetchClusters() }
  const showSkeletons = ((podIssues || []).length === 0 && isLoading) || isModeSwitching

  const handlePodIssueKeyDown = (
    e: React.KeyboardEvent,
    cluster: string | undefined,
    namespace: string,
    name: string,
    issueData?: Record<string, unknown>,
  ) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (cluster) {
        drillToPod(cluster, namespace, name, issueData)
      }
    }
  }

  const handleShowLogs = (e: React.MouseEvent, cluster: string, namespace: string, name: string) => {
    e.stopPropagation()
    drillToPod(cluster, namespace, name, { tab: 'logs' })
  }

  const handleRestartPod = async (
    e: React.MouseEvent,
    cluster: string,
    namespace: string,
    name: string,
  ) => {
    e.stopPropagation()
    if (backendActionUnavailable) {
      showToast(backendUnavailableMessage, 'error')
      return
    }
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

  const handleDeletePod = (e: React.MouseEvent, cluster: string, namespace: string, name: string) => {
    e.stopPropagation()
    if (backendActionUnavailable) {
      showToast(backendUnavailableMessage, 'error')
      return
    }
    pendingDeleteRef.current = { cluster, namespace, name }
    deleteConfirm.open()
  }

  const executeDeletePod = useCallback(async () => {
    const target = pendingDeleteRef.current
    if (!target) return
    if (backendActionUnavailable) {
      showToast(backendUnavailableMessage, 'error')
      deleteConfirm.close()
      pendingDeleteRef.current = null
      return
    }
    setIsDeleting(true)
    try {
      showToast(t('pods.deleting', 'Deleting pod...'), 'info')
      await kubectlProxy.exec(
        ['delete', 'pod', target.name, '-n', target.namespace],
        { context: target.cluster },
      )
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
  }, [backendActionUnavailable, backendUnavailableMessage, showToast, t, refetchPodIssues, deleteConfirm])

  const filteredPodIssues = useMemo(() => {
    let filtered = filterByCluster(podIssues || [])
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

  const stats = useMemo((): PodsStats => {
    // Use filtered clusters matching the global selection for pod/cluster counts (#7349)
    const visibleClusters = (clusters || []).filter(c =>
      isAllClustersSelected || globalSelectedClusters.includes(c.name)
    )
    const totalPods = visibleClusters.reduce((sum, c) => sum + (c.podCount || 0), 0)
    // Dedup issue rows by pod name to avoid under-counting healthy pods (#7348)
    const uniqueIssuePods = new Set(filteredPodIssues.map(p => `${p.cluster}/${p.namespace}/${p.name}`))
    const issueCount = filteredPodIssues.length
    const pendingCount = filteredPodIssues.filter(isPendingPhasePodIssue).length
    const crashLoopCount = filteredPodIssues.filter(p =>
      /crashloop|crash loop/i.test([p.reason, p.status].filter(Boolean).join(' '))
    ).length
    const restartCount = filteredPodIssues.filter(p => (p.restarts || 0) > 5).length
    const clusterCount = visibleClusters.length
    return {
      totalPods,
      healthy: Math.max(0, totalPods - uniqueIssuePods.size),
      issues: issueCount,
      pending: pendingCount,
      crashloop: crashLoopCount,
      restarts: restartCount,
      clusters: clusterCount,
    }
  }, [clusters, filteredPodIssues, isAllClustersSelected, globalSelectedClusters])

  const getDashboardStatValue = (blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'total_pods':
        return {
          value: stats.totalPods,
          sublabel: 'total pods',
          onClick: () => drillToAllPods(),
          isClickable: stats.totalPods > 0,
          groundtruthFields: {
            'pods-total': stats.totalPods,
            'pods-running': stats.healthy,
            'pods-pending': stats.pending,
            'pods-crashloop': stats.crashloop,
          },
        }
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

  return {
    filteredPodIssues,
    stats,
    showSkeletons,
    lastUpdated,
    handleRefresh,
    backendActionUnavailable,
    backendUnavailableMessage,
    backendStaleStatusMessage,
    deleteConfirm,
    isDeleting,
    pendingDeleteRef,
    executeDeletePod,
    handlePodIssueKeyDown,
    handleShowLogs,
    handleRestartPod,
    handleDeletePod,
    drillToPod,
    drillToAllPods,
    drillToAllClusters,
    getDashboardStatValue,
    globalSelectedClusters,
    isAllClustersSelected,
  }
}
