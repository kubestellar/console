import { useState } from 'react'
import { Activity, Box, Cpu, HardDrive, Network, AlertTriangle } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useCachedPodIssues, useCachedDeploymentIssues, useCachedGPUNodes } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { Skeleton } from '../ui/Skeleton'
import { RefreshIndicator } from '../ui/RefreshIndicator'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../hooks/useDemoMode'

interface ClusterFocusProps {
  config?: {
    cluster?: string
  }
}

export function ClusterFocus({ config }: ClusterFocusProps) {
  const { t } = useTranslation(['cards', 'common'])
  const selectedCluster = config?.cluster
  const { deduplicatedClusters: allClusters, isLoading: clustersLoading, isRefreshing: clustersRefreshing, isFailed, consecutiveFailures, lastRefresh: clustersLastRefreshDate } = useClusters()
  // #6271: useClusters returns Date|null; normalize to numeric epoch
  // so it merges cleanly with the numeric `lastRefresh` from useCache.
  const clustersLastRefresh: number | null = clustersLastRefreshDate instanceof Date
    ? clustersLastRefreshDate.getTime()
    : (typeof clustersLastRefreshDate === 'number' ? clustersLastRefreshDate : null)
  // #6217: destructure lastRefresh from each underlying hook so the card
  // can render a freshness indicator using the OLDEST timestamp (= the
  // staler half of the data the user is looking at).
  const { nodes: gpuNodes, isDemoFallback: gpuDemoFallback, isRefreshing: gpuRefreshing, lastRefresh: gpuLastRefresh } = useCachedGPUNodes()
  const { issues: podIssues, isDemoFallback: podsDemoFallback, isRefreshing: podsRefreshing, lastRefresh: podsLastRefresh } = useCachedPodIssues(selectedCluster)
  const { issues: deploymentIssues, isDemoFallback: deployDemoFallback, isRefreshing: deploymentsRefreshing, lastRefresh: deployLastRefresh } = useCachedDeploymentIssues(selectedCluster)
  const { drillToCluster, drillToPod, drillToDeployment } = useDrillDownActions()
  const [internalCluster, setInternalCluster] = useState<string>('')
  const { isDemoMode } = useDemoMode()

  // Report state to CardWrapper for refresh animation
  const hasData = allClusters.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: clustersLoading && !hasData,
    isRefreshing: clustersRefreshing || gpuRefreshing || podsRefreshing || deploymentsRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoMode || gpuDemoFallback || podsDemoFallback || deployDemoFallback,
    isFailed,
    consecutiveFailures })

  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter } = useGlobalFilters()

  // Apply global filters
  const clusters = (() => {
    let result = allClusters

    if (!isAllClustersSelected) {
      result = result.filter(c => globalSelectedClusters.includes(c.name))
    }

    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query)
      )
    }

    return result
  })()

  const clusterName = selectedCluster || internalCluster

  const cluster = clusters.find(c => c.name === clusterName)

  const clusterGPUs = gpuNodes
      .filter(n => n.cluster === clusterName || n.cluster.includes(clusterName))
      .reduce((sum, n) => sum + n.gpuCount, 0)

  const clusterPodIssues = podIssues.length
  const clusterDeploymentIssues = deploymentIssues.length

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
          <Skeleton variant="text" width={150} height={20} />
          <Skeleton variant="rounded" width={120} height={32} />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Skeleton variant="rounded" height={80} />
          <Skeleton variant="rounded" height={80} />
          <Skeleton variant="rounded" height={80} />
          <Skeleton variant="rounded" height={80} />
        </div>
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">{t('cards:clusterFocus.noClustersAvailable')}</p>
        <p className="text-xs mt-1">{t('cards:clusterFocus.addClustersToKubeconfig')}</p>
      </div>
    )
  }

  if (!clusterName) {
    return (
      <div className="h-full flex flex-col min-h-card overflow-hidden">
        <div className="flex items-center justify-end mb-4">
          <select
            value={internalCluster}
            onChange={(e) => setInternalCluster(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground max-w-full truncate"
          >
            <option value="">{t('cards:clusterFocus.selectCluster')}</option>
            {clusters.map(c => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          {t('cards:clusterFocus.selectClusterToView')}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-sm font-medium text-foreground truncate">{clusterName}</span>
          <div className={`w-2 h-2 rounded-full shrink-0 ${cluster?.healthy ? 'bg-green-400' : 'bg-red-400'}`} />
          {/* #6217: freshness indicator using the OLDEST of the 4 cache
              timestamps so users see the staler half of the data.
              #6244: include cluster cache timestamp — ClusterFocus reads
              health/metrics from useClusters(), so excluding it could
              misrepresent overall card freshness.
              #6273: hide the timestamp entirely in demo mode — useCache
              preserves lastRefresh from prior live sessions, which would
              show "Updated X ago" against demo data. */}
          <RefreshIndicator
            isRefreshing={clustersRefreshing || gpuRefreshing || podsRefreshing || deploymentsRefreshing}
            lastUpdated={(() => {
              if (isDemoMode || gpuDemoFallback || podsDemoFallback || deployDemoFallback) return null
              const ts = [clustersLastRefresh, gpuLastRefresh, podsLastRefresh, deployLastRefresh].filter((t): t is number => typeof t === 'number')
              return ts.length > 0 ? new Date(Math.min(...ts)) : null
            })()}
            size="sm"
            showLabel={true}
            staleThresholdMinutes={5}
          />
        </div>
        <div className="flex items-center gap-2">
          {!selectedCluster && (
            <select
              value={internalCluster}
              onChange={(e) => setInternalCluster(e.target.value)}
              className="px-2 py-1 rounded bg-secondary border border-border text-xs text-foreground max-w-[150px] truncate"
            >
              {clusters.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div
          className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors"
          onClick={() => cluster && drillToCluster(cluster.name, {
            healthy: cluster.healthy,
            nodeCount: cluster.nodeCount,
            podCount: cluster.podCount,
            cpuCores: cluster.cpuCores,
            server: cluster.server })}
        >
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-muted-foreground">{t('common:common.nodes')}</span>
          </div>
          <span className="text-xl font-bold text-foreground">{cluster?.nodeCount || 0}</span>
        </div>

        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-1">
            <Box className="w-4 h-4 text-green-400" />
            <span className="text-xs text-muted-foreground">{t('common:common.pods')}</span>
          </div>
          <span className="text-xl font-bold text-foreground">{cluster?.podCount || 0}</span>
        </div>

        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-muted-foreground">{t('common:common.gpus')}</span>
          </div>
          <span className="text-xl font-bold text-foreground">{clusterGPUs}</span>
        </div>

        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-1">
            <HardDrive className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-muted-foreground">{t('common:common.cpuCores')}</span>
          </div>
          <span className="text-xl font-bold text-foreground">{cluster?.cpuCores || 0}</span>
        </div>
      </div>

      {/* Issues Summary */}
      <div className="space-y-2">
        <div
          className="flex flex-wrap items-center justify-between gap-y-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors"
          onClick={() => {
            if (podIssues.length > 0) {
              const issue = podIssues[0]
              drillToPod(clusterName, issue.namespace, issue.name, {
                status: issue.status,
                reason: issue.reason,
                issues: issue.issues,
                restarts: issue.restarts })
            }
          }}
          title={podIssues.length > 0 ? t('cards:clusterFocus.clickToView', { name: podIssues[0].name }) : t('cards:clusterFocus.noPodIssues')}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm text-red-400">{t('cards:clusterFocus.podIssues')}</span>
          </div>
          <span className="text-sm font-medium text-red-400">{clusterPodIssues}</span>
        </div>

        <div
          className="flex flex-wrap items-center justify-between gap-y-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors"
          onClick={() => {
            if (deploymentIssues.length > 0) {
              const issue = deploymentIssues[0]
              drillToDeployment(clusterName, issue.namespace, issue.name, {
                replicas: issue.replicas,
                readyReplicas: issue.readyReplicas,
                reason: issue.reason,
                message: issue.message })
            }
          }}
          title={deploymentIssues.length > 0 ? t('cards:clusterFocus.clickToView', { name: deploymentIssues[0].name }) : t('cards:clusterFocus.noDeploymentIssues')}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm text-red-300">{t('cards:clusterFocus.deploymentIssues')}</span>
          </div>
          <span className="text-sm font-medium text-red-400">{clusterDeploymentIssues}</span>
        </div>
      </div>

      {/* Server info */}
      {cluster?.server && (
        <div className="mt-4 pt-3 border-t border-border/50 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
            <Network className="w-3 h-3 shrink-0" />
            <span className="truncate min-w-0">{cluster.server}</span>
          </div>
        </div>
      )}
    </div>
  )
}
