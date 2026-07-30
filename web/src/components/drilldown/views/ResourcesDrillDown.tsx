import { useMemo } from 'react'
import { ChevronLeft } from 'lucide-react'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useTranslation } from 'react-i18next'
import { useClusters, useGPUNodes } from '../../../hooks/useMCP'
import { useDrillDown, useDrillDownActions } from '../../../hooks/useDrillDown'
import {
  ResourcesClusterListHeader,
  ResourcesSummary,
  SortableClusterRow,
  type AcceleratorInfo
} from './ResourcesDrillDown.parts'
import { useResourcesDrillDown } from './useResourcesDrillDown'

interface Props {
  data: Record<string, unknown>
}

const ACCELERATOR_TYPES = [
  { key: 'GPU', label: 'GPU', color: 'text-purple-400' },
  { key: 'TPU', label: 'TPU', color: 'text-green-400' },
  { key: 'AIU', label: 'AIU', color: 'text-cyan-400' },
  { key: 'XPU', label: 'XPU', color: 'text-orange-400' }
] as const

export function ResourcesDrillDown({ data: _data }: Props) {
  const { t } = useTranslation()
  const { deduplicatedClusters: initialClusters, isLoading } = useClusters()
  const { nodes: gpuNodes } = useGPUNodes()
  const { drillToCluster } = useDrillDownActions()
  const { state, pop } = useDrillDown()
  const { clusters, clusterNameMap, sensors, handleDragEnd } =
    useResourcesDrillDown(initialClusters)

  const clusterAccelerators = useMemo(() => {
    const map: Record<
      string,
      Record<string, { total: number; allocated: number }>
    > = {}
    const seenNodes = new Set<string>()

    ;(gpuNodes || []).forEach((node) => {
      if (seenNodes.has(node.name)) return
      seenNodes.add(node.name)

      const rawCluster = node.cluster || 'unknown'
      const cluster = clusterNameMap[rawCluster] || rawCluster
      const acceleratorType = node.acceleratorType || 'GPU'

      if (!map[cluster]) map[cluster] = {}
      if (!map[cluster][acceleratorType]) {
        map[cluster][acceleratorType] = { total: 0, allocated: 0 }
      }
      map[cluster][acceleratorType].total += node.gpuCount
      map[cluster][acceleratorType].allocated += node.gpuAllocated
    })
    return map
  }, [clusterNameMap, gpuNodes])

  const activeAccelerators = useMemo(() => {
    const globalTotals: Record<string, { total: number; allocated: number }> =
      {}
    Object.values(clusterAccelerators).forEach((acceleratorMap) => {
      Object.entries(acceleratorMap).forEach(([type, accelerator]) => {
        if (!globalTotals[type]) globalTotals[type] = { total: 0, allocated: 0 }
        globalTotals[type].total += accelerator.total
        globalTotals[type].allocated += accelerator.allocated
      })
    })
    return ACCELERATOR_TYPES.filter(
      (type) => globalTotals[type.key]?.total > 0
    ).map((type) => ({ ...type, globalData: globalTotals[type.key] }))
  }, [clusterAccelerators])

  const totals = useMemo(() => {
    const totalCPUs = (clusters || []).reduce(
      (sum, cluster) => sum + (cluster.cpuCores || 0),
      0
    )
    const totalCPURequests = (clusters || []).reduce(
      (sum, cluster) => sum + (cluster.cpuRequestsCores || 0),
      0
    )
    const totalNodes = (clusters || []).reduce(
      (sum, cluster) => sum + (cluster.nodeCount || 0),
      0
    )
    const totalPods = (clusters || []).reduce(
      (sum, cluster) => sum + (cluster.podCount || 0),
      0
    )
    const totalMemoryGB = (clusters || []).reduce(
      (sum, cluster) => sum + (cluster.memoryGB || 0),
      0
    )
    const totalMemoryRequestsGB = (clusters || []).reduce(
      (sum, cluster) => sum + (cluster.memoryRequestsGB || 0),
      0
    )

    return {
      cpus: totalCPUs,
      cpuRequests: totalCPURequests,
      cpuPercent:
        totalCPUs > 0 ? Math.round((totalCPURequests / totalCPUs) * 100) : 0,
      nodes: totalNodes,
      pods: totalPods,
      memoryGB: totalMemoryGB,
      memoryRequestsGB: totalMemoryRequestsGB,
      memoryPercent:
        totalMemoryGB > 0
          ? Math.round((totalMemoryRequestsGB / totalMemoryGB) * 100)
          : 0
    }
  }, [clusters])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {state.stack.length > 1 && (
        <button
          type="button"
          onClick={pop}
          className="flex items-center gap-2 hover:bg-secondary/50 border border-transparent hover:border-border px-3 py-1.5 rounded-lg transition-all text-muted-foreground hover:text-foreground"
          aria-label={t('drilldown.goBack')}
          title={t('drilldown.goBack')}
        >
          <ChevronLeft className="w-4 h-4" />
          <span>{t('common.back')}</span>
        </button>
      )}

      <ResourcesSummary
        clustersCount={(clusters || []).length}
        totals={totals}
        accelerators={activeAccelerators}
      />

      <div>
        <ResourcesClusterListHeader
          clustersCount={(clusters || []).length}
          accelerators={activeAccelerators}
        />
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={(clusters || []).map((cluster) => cluster.name)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1.5">
              {(clusters || []).map((cluster) => {
                const hasMetrics =
                  cluster.metricsAvailable &&
                  cluster.cpuUsageCores !== undefined
                const cpuUsed = hasMetrics
                  ? cluster.cpuUsageCores
                  : cluster.cpuRequestsCores
                const rawCpuPercent =
                  cluster.cpuCores && cpuUsed
                    ? Math.round((cpuUsed / cluster.cpuCores) * 100)
                    : 0
                const memoryGB = cluster.memoryGB || 0
                const memoryUsed = hasMetrics
                  ? cluster.memoryUsageGB
                  : cluster.memoryRequestsGB
                const rawMemoryPercent =
                  cluster.memoryGB && memoryUsed
                    ? Math.round((memoryUsed / cluster.memoryGB) * 100)
                    : 0
                const clusterAcceleratorMap =
                  clusterAccelerators[cluster.name] || {}
                const rowAccelerators: AcceleratorInfo[] = (
                  activeAccelerators || []
                ).map((accelerator) => ({
                  key: accelerator.key,
                  label: accelerator.label,
                  color: accelerator.color,
                  data: clusterAcceleratorMap[accelerator.key] || {
                    total: 0,
                    allocated: 0
                  }
                }))

                return (
                  <SortableClusterRow
                    key={cluster.name}
                    cluster={cluster}
                    cpuPercent={Math.min(rawCpuPercent, 100)}
                    memoryPercent={Math.min(rawMemoryPercent, 100)}
                    memoryGB={memoryGB}
                    accelerators={rowAccelerators}
                    onDrillDown={() =>
                      drillToCluster(cluster.name, {
                        healthy: cluster.healthy,
                        nodeCount: cluster.nodeCount,
                        podCount: cluster.podCount,
                        cpuCores: cluster.cpuCores,
                        memoryGB: cluster.memoryGB,
                        cpuRequestsCores: cluster.cpuRequestsCores,
                        cpuUsageCores: cluster.cpuUsageCores,
                        memoryRequestsGB: cluster.memoryRequestsGB,
                        memoryUsageGB: cluster.memoryUsageGB,
                        storageGB: cluster.storageGB,
                        metricsAvailable: cluster.metricsAvailable,
                        origin: 'resources'
                      })
                    }
                  />
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  )
}
