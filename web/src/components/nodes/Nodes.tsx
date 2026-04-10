import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { useClusters, useGPUNodes } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { formatMemoryStat } from '../../lib/formatStats'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'
import { useTranslation } from 'react-i18next'

const NODES_CARDS_KEY = 'kubestellar-nodes-cards'

// Default cards for the nodes dashboard
const DEFAULT_NODES_CARDS = getDefaultCards('nodes')

export function Nodes() {
  const { t } = useTranslation(['cards', 'common'])
  const { deduplicatedClusters: clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch, error: clustersError } = useClusters()
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

  // Cache utilization values to avoid showing a transient 0 during refresh, but
  // still propagate a genuine 0 once real data has been seen at least once
  // (issue #6107). Previously the fallback used `value > 0 ? value : cached`
  // which caused a node whose utilization legitimately dropped to 0 to keep
  // displaying the previous non-zero value forever.
  //
  // We only treat a value as "real" when there is at least one reachable
  // cluster that has actually reported capacity (totalCPU / totalMemoryGB > 0).
  // Until then, any 0 we see is a placeholder, not a measurement.
  const hasCpuCapacity = totalCPU > 0
  const hasMemoryCapacity = totalMemoryGB > 0
  const [cachedCpuUtil, setCachedCpuUtil] = useState<number | null>(null)
  const [cachedMemoryUtil, setCachedMemoryUtil] = useState<number | null>(null)
  // This effect intentionally calls setState to snapshot the last real value.
  // react-hooks/set-state-in-effect flags this as a cascading-render pattern,
  // but in this case the effect only fires when the capacity guards flip,
  // so the cascade is bounded and the pattern is the simplest one compatible
  // with the react-hooks/refs rule (which forbids reading `.current` during
  // render).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (hasCpuCapacity) setCachedCpuUtil(currentCpuUtil)
    if (hasMemoryCapacity) setCachedMemoryUtil(currentMemoryUtil)
  }, [currentCpuUtil, currentMemoryUtil, hasCpuCapacity, hasMemoryCapacity])
  /* eslint-enable react-hooks/set-state-in-effect */
  const cpuUtilization = hasCpuCapacity ? currentCpuUtil : (cachedCpuUtil ?? 0)
  const memoryUtilization = hasMemoryCapacity ? currentMemoryUtil : (cachedMemoryUtil ?? 0)

  // Stats value getter
  const getDashboardStatValue = (blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'nodes':
        return { value: totalNodes, sublabel: t('common:nodes.totalNodes'), onClick: () => drillToAllNodes(), isClickable: totalNodes > 0 }
      case 'cpus':
        return { value: totalCPU, sublabel: t('common:nodes.cpuCores'), onClick: () => drillToAllNodes(), isClickable: totalCPU > 0 }
      case 'memory':
        return { value: formatMemoryStat(totalMemoryGB), sublabel: t('common:common.memory'), onClick: () => drillToAllNodes(), isClickable: totalMemoryGB > 0 }
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
  }

  const getStatValue = (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId)

  return (
    <DashboardPage
      title={t('common:nodes.title')}
      subtitle={t('common:nodes.subtitle')}
      icon="Server"
      rightExtra={<RotatingTip page="nodes" />}
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
        description: t('common:nodes.emptyDescription') }}
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
