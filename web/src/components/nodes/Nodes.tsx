import { useCallback, useRef, useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import { useClusters, useGPUNodes } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { useTranslation } from 'react-i18next'

const NODES_CARDS_KEY = 'kubestellar-nodes-cards'

// Default cards for the nodes dashboard
const DEFAULT_NODES_CARDS = getDefaultCards('nodes')

export function Nodes() {
  const { t } = useTranslation(['cards', 'common'])
  const { clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch, error: clustersError } = useClusters()
  const { nodes: gpuNodes } = useGPUNodes()
  const error = clustersError

  const { drillToAllNodes, drillToAllGPU, drillToAllPods, drillToAllClusters } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Filter clusters based on global selection
  const filteredClusters = clusters.filter(c =>
    isAllClustersSelected || globalSelectedClusters.includes(c.name)
  )
  const reachableClusters = filteredClusters.filter(c => c.reachable !== false)

  // Calculate stats
  const totalNodes = reachableClusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0)
  const totalCPU = reachableClusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0)
  const totalMemoryGB = reachableClusters.reduce((sum, c) => sum + (c.memoryGB || 0), 0)
  const totalPods = reachableClusters.reduce((sum, c) => sum + (c.podCount || 0), 0)
  const totalGPUs = gpuNodes
    .filter(node => isAllClustersSelected || globalSelectedClusters.includes(node.cluster.split('/')[0]))
    .reduce((sum, node) => sum + node.gpuCount, 0)

  // Calculate utilization
  const currentCpuUtil = (() => {
    const requestedCPU = reachableClusters.reduce((sum, c) => sum + (c.cpuRequestsCores || 0), 0)
    return totalCPU > 0 ? Math.round((requestedCPU / totalCPU) * 100) : 0
  })()
  const currentMemoryUtil = (() => {
    const requestedMemory = reachableClusters.reduce((sum, c) => sum + (c.memoryRequestsGB || 0), 0)
    return totalMemoryGB > 0 ? Math.round((requestedMemory / totalMemoryGB) * 100) : 0
  })()

  // Cache utilization values to prevent showing 0 during refresh
  const cachedCpuUtil = useRef(currentCpuUtil)
  const cachedMemoryUtil = useRef(currentMemoryUtil)
  useEffect(() => {
    if (currentCpuUtil > 0) cachedCpuUtil.current = currentCpuUtil
    if (currentMemoryUtil > 0) cachedMemoryUtil.current = currentMemoryUtil
  }, [currentCpuUtil, currentMemoryUtil])
  const cpuUtilization = currentCpuUtil > 0 ? currentCpuUtil : cachedCpuUtil.current
  const memoryUtilization = currentMemoryUtil > 0 ? currentMemoryUtil : cachedMemoryUtil.current

  // Stats value getter
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'nodes':
        return { value: totalNodes, sublabel: t('common:nodes.totalNodes'), onClick: () => drillToAllNodes(), isClickable: totalNodes > 0 }
      case 'cpus':
        return { value: totalCPU, sublabel: t('common:nodes.cpuCores'), onClick: () => drillToAllNodes(), isClickable: totalCPU > 0 }
      case 'memory':
        return { value: `${totalMemoryGB.toFixed(0)} GB`, sublabel: t('common:common.memory'), onClick: () => drillToAllNodes(), isClickable: totalMemoryGB > 0 }
      case 'gpus':
        return { value: totalGPUs, sublabel: t('common:common.gpus'), onClick: () => drillToAllGPU(), isClickable: totalGPUs > 0 }
      case 'tpus':
        return { value: 0, sublabel: t('common:nodes.tpus'), isClickable: false }
      case 'pods':
        return { value: totalPods, sublabel: t('common:common.pods'), onClick: () => drillToAllPods(), isClickable: totalPods > 0 }
      case 'cpu_util':
        return { value: `${cpuUtilization}%`, sublabel: t('common:common.utilization'), onClick: () => drillToAllNodes(), isClickable: cpuUtilization > 0 }
      case 'memory_util':
        return { value: `${memoryUtilization}%`, sublabel: t('common:common.utilization'), onClick: () => drillToAllNodes(), isClickable: memoryUtilization > 0 }
      case 'clusters':
        return { value: reachableClusters.length, sublabel: t('common:common.clusters'), onClick: () => drillToAllClusters(), isClickable: reachableClusters.length > 0 }
      case 'healthy':
        return { value: totalNodes, sublabel: t('common:nodes.totalNodes'), onClick: () => drillToAllNodes(), isClickable: totalNodes > 0 }
      default:
        return { value: 0 }
    }
  }, [reachableClusters, totalNodes, totalCPU, totalMemoryGB, totalPods, totalGPUs, cpuUtilization, memoryUtilization, drillToAllNodes, drillToAllGPU, drillToAllPods, drillToAllClusters, t])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  return (
    <DashboardPage
      title={t('common:nodes.title')}
      subtitle={t('common:nodes.subtitle')}
      icon="Server"
      storageKey={NODES_CARDS_KEY}
      defaultCards={DEFAULT_NODES_CARDS}
      statsType="compute"
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={isLoading}
      isRefreshing={dataRefreshing}
      lastUpdated={lastUpdated}
      hasData={totalNodes > 0}
      emptyState={{
        title: t('common:nodes.dashboardTitle'),
        description: t('common:nodes.emptyDescription'),
      }}
    >
      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">{t('common:nodes.errorLoadingData')}</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}
    </DashboardPage>
  )
}
