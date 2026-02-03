import { useMemo, useState } from 'react'
import { useClusters, useGPUNodes } from '../../../hooks/useMCP'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { Gauge } from '../../charts/Gauge'
import { Cpu, MemoryStick, Server, ChevronRight, GripVertical } from 'lucide-react'
import { StatusIndicator } from '../../charts/StatusIndicator'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ClusterInfo } from '../../../hooks/useMCP'

interface Props {
  data: Record<string, unknown>
}

// Format memory - show TB when >= 1000GB
function formatMemory(gb: number): string {
  if (gb >= 1000) {
    return `${(gb / 1024).toFixed(1)}T`
  }
  return `${Math.round(gb)}G`
}

// Compact sortable cluster row component
interface SortableClusterRowProps {
  cluster: ClusterInfo
  cpuPercent: number
  memoryPercent: number
  memoryGB: number
  gpuData: { total: number; allocated: number }
  gpuPercent: number
  tpuData: { total: number; allocated: number }
  onDrillDown: () => void
}

function SortableClusterRow({
  cluster,
  cpuPercent,
  memoryPercent,
  memoryGB,
  gpuData,
  gpuPercent,
  tpuData,
  onDrillDown,
}: SortableClusterRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cluster.name })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-2.5 rounded-lg bg-card/50 border border-border hover:bg-card hover:border-primary/50 transition-colors group cursor-pointer"
      onClick={onDrillDown}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="p-1 rounded hover:bg-secondary cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
        title="Drag to reorder"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* Health status - fixed width to match header */}
      {/* Show: unreachable (offline), healthy (green if we have nodes), error (no data) */}
      <div className="w-[90px] flex-shrink-0">
        <StatusIndicator status={
          cluster.reachable === false ? 'unreachable' :
          // If we have nodes, the cluster is working - show healthy
          (cluster.nodeCount && cluster.nodeCount > 0) ? 'healthy' :
          cluster.healthy ? 'healthy' : 'error'
        } />
      </div>

      {/* Cluster name */}
      <div className="w-[160px] flex-shrink-0">
        <div className="font-medium text-foreground text-sm truncate">{cluster.name.split('/').pop()}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {cluster.reachable !== false ? `${cluster.nodeCount ?? '-'} nodes • ${cluster.podCount ?? '-'} pods` : 'Offline'}
        </div>
      </div>

      {/* Resource gauges - fixed width columns matching header */}
      {/* CPU */}
      <div className="w-[130px] flex-shrink-0 flex items-center gap-2 justify-center">
        <Gauge
          value={Math.min(cpuPercent, 100)}
          max={100}
          size="xs"
          thresholds={{ warning: 70, critical: 90 }}
        />
        <div className="text-right">
          <div className={`text-xs font-medium ${cpuPercent > 100 ? 'text-red-400' : 'text-foreground'}`}>
            {cpuPercent}%
          </div>
          <div className="text-[10px] text-muted-foreground">{cluster.cpuCores || 0}</div>
        </div>
      </div>

      {/* Memory */}
      <div className="w-[130px] flex-shrink-0 flex items-center gap-2 justify-center">
        <Gauge
          value={Math.min(memoryPercent, 100)}
          max={100}
          size="xs"
          thresholds={{ warning: 75, critical: 90 }}
        />
        <div className="text-right">
          <div className={`text-xs font-medium ${memoryPercent > 100 ? 'text-red-400' : 'text-foreground'}`}>
            {memoryPercent}%
          </div>
          <div className="text-[10px] text-muted-foreground">{formatMemory(memoryGB)}</div>
        </div>
      </div>

      {/* GPU */}
      <div className="w-[110px] flex-shrink-0 flex items-center gap-2 justify-center">
        {gpuData.total > 0 ? (
          <>
            <Gauge
              value={Math.min(gpuPercent, 100)}
              max={100}
              size="xs"
              thresholds={{ warning: 80, critical: 95 }}
            />
            <div className="text-right">
              <div className={`text-xs font-medium ${gpuPercent > 100 ? 'text-red-400' : 'text-foreground'}`}>
                {gpuPercent}%
              </div>
              <div className="text-[10px] text-purple-400">{gpuData.allocated}/{gpuData.total}</div>
            </div>
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground/50">No GPU</span>
        )}
      </div>

      {/* TPU */}
      <div className="w-[110px] flex-shrink-0 flex items-center gap-2 justify-center">
        {tpuData.total > 0 ? (
          <>
            <Gauge
              value={tpuData.total > 0 ? Math.round((tpuData.allocated / tpuData.total) * 100) : 0}
              max={100}
              size="xs"
              thresholds={{ warning: 80, critical: 95 }}
            />
            <div className="text-right">
              <div className="text-xs font-medium text-foreground">
                {tpuData.total > 0 ? Math.round((tpuData.allocated / tpuData.total) * 100) : 0}%
              </div>
              <div className="text-[10px] text-cyan-400">{tpuData.allocated}/{tpuData.total}</div>
            </div>
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground/50">No TPU</span>
        )}
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </div>
  )
}

export function ResourcesDrillDown({ data: _data }: Props) {
  const { deduplicatedClusters: initialClusters, isLoading } = useClusters()
  const { nodes: gpuNodes } = useGPUNodes()
  const { drillToCluster } = useDrillDownActions()

  // Local state for cluster order (persists during session)
  const [clusterOrder, setClusterOrder] = useState<string[]>([])

  // Sorted clusters based on user's drag order, or alphabetically by default
  const clusters = useMemo(() => {
    if (clusterOrder.length === 0) {
      // Default: sort alphabetically by cluster name
      return [...initialClusters].sort((a, b) => a.name.localeCompare(b.name))
    }

    // Sort by stored order, putting unknown clusters at end (alphabetically)
    const orderMap = new Map(clusterOrder.map((name, i) => [name, i]))
    return [...initialClusters].sort((a, b) => {
      const aOrder = orderMap.get(a.name)
      const bOrder = orderMap.get(b.name)
      // Both have user-defined order
      if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder
      // Only a has order - a comes first
      if (aOrder !== undefined) return -1
      // Only b has order - b comes first
      if (bOrder !== undefined) return 1
      // Neither has order - sort alphabetically
      return a.name.localeCompare(b.name)
    })
  }, [initialClusters, clusterOrder])

  // Build a map of raw cluster names to deduplicated primary names
  const clusterNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    clusters.forEach(c => {
      map[c.name] = c.name // Primary maps to itself
      c.aliases?.forEach(alias => {
        map[alias] = c.name // Aliases map to primary
      })
    })
    return map
  }, [clusters])

  // Calculate per-cluster GPU data (mapping aliases to primary cluster names)
  // Also deduplicate GPU nodes by name to avoid counting same physical node twice
  const clusterGPUs = useMemo(() => {
    const map: Record<string, { total: number; allocated: number }> = {}
    const seenNodes = new Set<string>() // Track seen node names to avoid duplicates

    gpuNodes.forEach(node => {
      // Skip if we've already counted this physical node
      const nodeKey = node.name
      if (seenNodes.has(nodeKey)) return
      seenNodes.add(nodeKey)

      const rawCluster = node.cluster || 'unknown'
      // Map to deduplicated primary name if possible
      const cluster = clusterNameMap[rawCluster] || rawCluster
      if (!map[cluster]) {
        map[cluster] = { total: 0, allocated: 0 }
      }
      map[cluster].total += node.gpuCount
      map[cluster].allocated += node.gpuAllocated
    })
    return map
  }, [gpuNodes, clusterNameMap])

  // Calculate totals (using deduplicated GPU counts from clusterGPUs map)
  const totals = useMemo(() => {
    const totalCPUs = clusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0)
    const totalCPURequests = clusters.reduce((sum, c) => sum + (c.cpuRequestsCores || 0), 0)
    const totalNodes = clusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0)
    const totalPods = clusters.reduce((sum, c) => sum + (c.podCount || 0), 0)
    const totalMemoryGB = clusters.reduce((sum, c) => sum + (c.memoryGB || 0), 0)
    const totalMemoryRequestsGB = clusters.reduce((sum, c) => sum + (c.memoryRequestsGB || 0), 0)
    // Use aggregated GPU counts from clusterGPUs (already deduplicated)
    let totalGPUs = 0
    let allocatedGPUs = 0
    Object.values(clusterGPUs).forEach(gpu => {
      totalGPUs += gpu.total
      allocatedGPUs += gpu.allocated
    })

    return {
      cpus: totalCPUs,
      cpuRequests: totalCPURequests,
      nodes: totalNodes,
      pods: totalPods,
      memoryGB: totalMemoryGB,
      memoryRequestsGB: totalMemoryRequestsGB,
      gpus: totalGPUs,
      gpusAllocated: allocatedGPUs,
    }
  }, [clusters, clusterGPUs])

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = clusters.findIndex(c => c.name === active.id)
      const newIndex = clusters.findIndex(c => c.name === over.id)
      const newOrder = arrayMove(clusters.map(c => c.name), oldIndex, newIndex)
      setClusterOrder(newOrder)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats - more compact */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="p-3 rounded-lg bg-card/50 border border-border">
          <div className="flex items-center gap-2 mb-1">
            <Server className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs text-muted-foreground">Clusters</span>
          </div>
          <div className="text-xl font-bold text-foreground">{clusters.length}</div>
        </div>

        <div className="p-3 rounded-lg bg-card/50 border border-border">
          <div className="flex items-center gap-2 mb-1">
            <Server className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs text-muted-foreground">Nodes</span>
          </div>
          <div className="text-xl font-bold text-foreground">{totals.nodes}</div>
        </div>

        <div className="p-3 rounded-lg bg-card/50 border border-border">
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs text-muted-foreground">CPU Capacity</span>
          </div>
          <div className="text-xl font-bold text-foreground">{totals.cpus.toLocaleString()} cores</div>
        </div>

        <div className="p-3 rounded-lg bg-card/50 border border-border">
          <div className="flex items-center gap-2 mb-1">
            <MemoryStick className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-xs text-muted-foreground">Memory Capacity</span>
          </div>
          <div className="text-xl font-bold text-foreground">
            {totals.memoryGB >= 1000
              ? `${(totals.memoryGB / 1024).toFixed(1)} TB`
              : `${Math.round(totals.memoryGB)} GB`}
          </div>
        </div>

        {totals.gpus > 0 && (
          <div className="p-3 rounded-lg bg-card/50 border border-border">
            <div className="flex items-center gap-2 mb-1">
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-xs text-muted-foreground">GPU Allocated</span>
            </div>
            <div className="text-xl font-bold text-foreground">
              <span className="text-purple-400">{totals.gpusAllocated}</span>
              <span className="text-muted-foreground">/{totals.gpus}</span>
            </div>
          </div>
        )}

        {/* TPU - placeholder for future */}
        <div className="p-3 rounded-lg bg-card/50 border border-border">
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs text-muted-foreground">TPU Allocated</span>
          </div>
          <div className="text-xl font-bold text-foreground">
            <span className="text-cyan-400">0</span>
            <span className="text-muted-foreground">/0</span>
          </div>
        </div>
      </div>

      {/* Cluster List - compact draggable rows */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2">
          Clusters ({clusters.length})
        </h3>

        {/* Column headers - matching data row structure exactly */}
        <div className="flex items-center gap-3 px-2.5 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
          <div className="p-1 flex-shrink-0"><div className="w-4 h-4" /></div> {/* Drag handle spacer */}
          <div className="w-[90px] flex-shrink-0" /> {/* Health + label spacer (icon w-4 + gap-2 + ~60px label) */}
          <div className="w-[160px] flex-shrink-0">Cluster</div>
          <div className="w-[130px] flex-shrink-0 text-center">
            <Cpu className="w-3 h-3 text-blue-400 inline mr-1" />
            <span>CPU</span>
          </div>
          <div className="w-[130px] flex-shrink-0 text-center">
            <MemoryStick className="w-3 h-3 text-yellow-400 inline mr-1" />
            <span>Memory</span>
          </div>
          <div className="w-[110px] flex-shrink-0 text-center">
            <Cpu className="w-3 h-3 text-purple-400 inline mr-1" />
            <span>GPU</span>
          </div>
          <div className="w-[110px] flex-shrink-0 text-center">
            <Cpu className="w-3 h-3 text-cyan-400 inline mr-1" />
            <span>TPU</span>
          </div>
          <div className="w-4 flex-shrink-0" /> {/* ChevronRight spacer */}
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={clusters.map(c => c.name)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1.5">
              {clusters.map((cluster) => {
                // Prefer actual usage from metrics-server, fall back to requests if unavailable
                const hasMetrics = cluster.metricsAvailable && cluster.cpuUsageCores !== undefined

                // CPU: use actual usage when available, otherwise use requests
                const cpuUsed = hasMetrics ? cluster.cpuUsageCores : cluster.cpuRequestsCores
                const rawCpuPercent = cluster.cpuCores && cpuUsed
                  ? Math.round((cpuUsed / cluster.cpuCores) * 100)
                  : 0
                const cpuPercent = Math.min(rawCpuPercent, 100)

                // Memory: use actual usage when available, otherwise use requests
                const memoryGB = cluster.memoryGB || 0
                const memUsed = hasMetrics ? cluster.memoryUsageGB : cluster.memoryRequestsGB
                const rawMemoryPercent = cluster.memoryGB && memUsed
                  ? Math.round((memUsed / cluster.memoryGB) * 100)
                  : 0
                const memoryPercent = Math.min(rawMemoryPercent, 100)

                const gpuData = clusterGPUs[cluster.name] || { total: 0, allocated: 0 }
                // Cap at 100% - allocated should never exceed total (data issue if it does)
                const rawGpuPercent = gpuData.total > 0 ? Math.round((gpuData.allocated / gpuData.total) * 100) : 0
                const gpuPercent = Math.min(rawGpuPercent, 100)

                // TPU data - placeholder for now
                const tpuData = { total: 0, allocated: 0 }

                return (
                  <SortableClusterRow
                    key={cluster.name}
                    cluster={cluster}
                    cpuPercent={cpuPercent}
                    memoryPercent={memoryPercent}
                    memoryGB={memoryGB}
                    gpuData={gpuData}
                    gpuPercent={gpuPercent}
                    tpuData={tpuData}
                    onDrillDown={() => drillToCluster(cluster.name, {
                      healthy: cluster.healthy,
                      nodeCount: cluster.nodeCount,
                      podCount: cluster.podCount,
                      cpuCores: cluster.cpuCores,
                    })}
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
