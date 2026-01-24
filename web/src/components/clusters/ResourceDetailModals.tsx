import { useState, useMemo } from 'react'
import { Cpu, MemoryStick, Database, HardDrive, Server, ChevronDown, ChevronRight } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { Gauge } from '../charts/Gauge'

interface ResourceModalProps {
  clusterName: string
  onClose: () => void
}

// Skeleton loader component
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-muted/30 rounded animate-pulse ${className}`} />
}

// ==================== CPU Detail Modal ====================

interface CPUDetailModalProps extends ResourceModalProps {
  totalCores: number
  allocatableCores: number
  requestedCores?: number
  limitCores?: number
  nodes?: Array<{
    name: string
    cpuCapacity: number
    cpuAllocatable: number
    cpuRequested?: number
    cpuUsed?: number
  }>
  isLoading?: boolean
}

export function CPUDetailModal({
  clusterName,
  totalCores,
  allocatableCores,
  requestedCores = 0,
  limitCores = 0,
  nodes = [],
  isLoading,
  onClose,
}: CPUDetailModalProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  const utilizationPercent = allocatableCores > 0 ? Math.round((requestedCores / allocatableCores) * 100) : 0

  return (
    <BaseModal isOpen={true} onClose={onClose} size="md">
      <BaseModal.Header
        title="CPU Resources"
        description={clusterName}
        icon={Cpu}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[70vh]">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-32" />
            <Skeleton className="h-48" />
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-4 rounded-lg bg-card/50 border border-border">
                <div className="text-sm text-muted-foreground mb-1">Total Capacity</div>
                <div className="text-3xl font-bold text-foreground">{totalCores}</div>
                <div className="text-xs text-muted-foreground">cores</div>
              </div>
              <div className="p-4 rounded-lg bg-card/50 border border-border">
                <div className="text-sm text-muted-foreground mb-1">Allocatable</div>
                <div className="text-3xl font-bold text-foreground">{allocatableCores}</div>
                <div className="text-xs text-muted-foreground">cores</div>
              </div>
            </div>

            {/* Utilization */}
            <div className="mb-6 p-4 rounded-lg bg-card/50 border border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-foreground">CPU Allocation</span>
                <span className={`text-sm ${utilizationPercent > 80 ? 'text-red-400' : utilizationPercent > 60 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {utilizationPercent}% requested
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Gauge value={requestedCores} max={allocatableCores} size="lg" label="Requested" />
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Requested</div>
                  <div className="text-xl font-bold text-foreground">{requestedCores.toFixed(1)}</div>
                  {limitCores > 0 && (
                    <>
                      <div className="text-sm text-muted-foreground mt-2">Limits</div>
                      <div className="text-lg font-medium text-foreground">{limitCores.toFixed(1)}</div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Nodes breakdown */}
            {nodes.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Server className="w-4 h-4" />
                  CPU by Node ({nodes.length})
                </h3>
                <div className="space-y-2">
                  {nodes.map(node => {
                    const isExpanded = expandedNodes.has(node.name)
                    const nodePercent = node.cpuAllocatable > 0
                      ? Math.round(((node.cpuRequested || 0) / node.cpuAllocatable) * 100)
                      : 0
                    return (
                      <div key={node.name} className="rounded-lg bg-card/50 border border-border overflow-hidden">
                        <button
                          onClick={() => setExpandedNodes(prev => {
                            const next = new Set(prev)
                            if (next.has(node.name)) next.delete(node.name)
                            else next.add(node.name)
                            return next
                          })}
                          className="w-full p-3 flex items-center justify-between hover:bg-card/30 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                            <span className="font-mono text-sm text-foreground">{node.name}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className={`text-xs px-2 py-0.5 rounded ${nodePercent > 80 ? 'bg-red-500/20 text-red-400' : nodePercent > 60 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
                              {nodePercent}%
                            </span>
                            <span className="text-sm text-muted-foreground">{node.cpuAllocatable} cores</span>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-3 grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <div className="text-muted-foreground">Capacity</div>
                              <div className="font-medium">{node.cpuCapacity} cores</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Requested</div>
                              <div className="font-medium">{(node.cpuRequested || 0).toFixed(1)} cores</div>
                            </div>
                            {node.cpuUsed !== undefined && (
                              <div>
                                <div className="text-muted-foreground">Usage</div>
                                <div className="font-medium">{node.cpuUsed.toFixed(1)} cores</div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </BaseModal.Content>
    </BaseModal>
  )
}

// ==================== Memory Detail Modal ====================

interface MemoryDetailModalProps extends ResourceModalProps {
  totalMemoryGB: number
  allocatableMemoryGB: number
  requestedMemoryGB?: number
  limitMemoryGB?: number
  nodes?: Array<{
    name: string
    memoryCapacityGB: number
    memoryAllocatableGB: number
    memoryRequestedGB?: number
    memoryUsedGB?: number
  }>
  isLoading?: boolean
}

function formatMemory(gb: number): string {
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`
  return `${Math.round(gb)} GB`
}

export function MemoryDetailModal({
  clusterName,
  totalMemoryGB,
  allocatableMemoryGB,
  requestedMemoryGB = 0,
  limitMemoryGB = 0,
  nodes = [],
  isLoading,
  onClose,
}: MemoryDetailModalProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  const utilizationPercent = allocatableMemoryGB > 0 ? Math.round((requestedMemoryGB / allocatableMemoryGB) * 100) : 0

  return (
    <BaseModal isOpen={true} onClose={onClose} size="md">
      <BaseModal.Header
        title="Memory Resources"
        description={clusterName}
        icon={MemoryStick}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[70vh]">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-32" />
            <Skeleton className="h-48" />
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-4 rounded-lg bg-card/50 border border-border">
                <div className="text-sm text-muted-foreground mb-1">Total Capacity</div>
                <div className="text-3xl font-bold text-foreground">{formatMemory(totalMemoryGB)}</div>
              </div>
              <div className="p-4 rounded-lg bg-card/50 border border-border">
                <div className="text-sm text-muted-foreground mb-1">Allocatable</div>
                <div className="text-3xl font-bold text-foreground">{formatMemory(allocatableMemoryGB)}</div>
              </div>
            </div>

            {/* Utilization */}
            <div className="mb-6 p-4 rounded-lg bg-card/50 border border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-foreground">Memory Allocation</span>
                <span className={`text-sm ${utilizationPercent > 80 ? 'text-red-400' : utilizationPercent > 60 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {utilizationPercent}% requested
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Gauge value={requestedMemoryGB} max={allocatableMemoryGB} size="lg" label="Requested" />
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Requested</div>
                  <div className="text-xl font-bold text-foreground">{formatMemory(requestedMemoryGB)}</div>
                  {limitMemoryGB > 0 && (
                    <>
                      <div className="text-sm text-muted-foreground mt-2">Limits</div>
                      <div className="text-lg font-medium text-foreground">{formatMemory(limitMemoryGB)}</div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Nodes breakdown */}
            {nodes.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Server className="w-4 h-4" />
                  Memory by Node ({nodes.length})
                </h3>
                <div className="space-y-2">
                  {nodes.map(node => {
                    const isExpanded = expandedNodes.has(node.name)
                    const nodePercent = node.memoryAllocatableGB > 0
                      ? Math.round(((node.memoryRequestedGB || 0) / node.memoryAllocatableGB) * 100)
                      : 0
                    return (
                      <div key={node.name} className="rounded-lg bg-card/50 border border-border overflow-hidden">
                        <button
                          onClick={() => setExpandedNodes(prev => {
                            const next = new Set(prev)
                            if (next.has(node.name)) next.delete(node.name)
                            else next.add(node.name)
                            return next
                          })}
                          className="w-full p-3 flex items-center justify-between hover:bg-card/30 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                            <span className="font-mono text-sm text-foreground">{node.name}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className={`text-xs px-2 py-0.5 rounded ${nodePercent > 80 ? 'bg-red-500/20 text-red-400' : nodePercent > 60 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
                              {nodePercent}%
                            </span>
                            <span className="text-sm text-muted-foreground">{formatMemory(node.memoryAllocatableGB)}</span>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-3 grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <div className="text-muted-foreground">Capacity</div>
                              <div className="font-medium">{formatMemory(node.memoryCapacityGB)}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Requested</div>
                              <div className="font-medium">{formatMemory(node.memoryRequestedGB || 0)}</div>
                            </div>
                            {node.memoryUsedGB !== undefined && (
                              <div>
                                <div className="text-muted-foreground">Usage</div>
                                <div className="font-medium">{formatMemory(node.memoryUsedGB)}</div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </BaseModal.Content>
    </BaseModal>
  )
}

// ==================== Storage Detail Modal ====================

interface StorageDetailModalProps extends ResourceModalProps {
  totalStorageGB: number
  allocatableStorageGB: number
  usedStorageGB?: number
  pvcs?: Array<{
    name: string
    namespace: string
    storageClass: string
    capacityGB: number
    usedGB?: number
    status: string
  }>
  nodes?: Array<{
    name: string
    ephemeralStorageGB: number
    ephemeralUsedGB?: number
  }>
  isLoading?: boolean
}

export function StorageDetailModal({
  clusterName,
  totalStorageGB,
  allocatableStorageGB,
  usedStorageGB = 0,
  pvcs = [],
  nodes = [],
  isLoading,
  onClose,
}: StorageDetailModalProps) {
  const [showPVCs, setShowPVCs] = useState(true)
  const [showNodes, setShowNodes] = useState(false)

  const utilizationPercent = allocatableStorageGB > 0 ? Math.round((usedStorageGB / allocatableStorageGB) * 100) : 0

  return (
    <BaseModal isOpen={true} onClose={onClose} size="lg">
      <BaseModal.Header
        title="Storage Resources"
        description={clusterName}
        icon={Database}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[70vh]">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-32" />
            <Skeleton className="h-48" />
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-4 rounded-lg bg-card/50 border border-border">
                <div className="text-sm text-muted-foreground mb-1">Ephemeral Storage</div>
                <div className="text-3xl font-bold text-foreground">{formatMemory(totalStorageGB)}</div>
              </div>
              <div className="p-4 rounded-lg bg-card/50 border border-border">
                <div className="text-sm text-muted-foreground mb-1">Allocatable</div>
                <div className="text-3xl font-bold text-foreground">{formatMemory(allocatableStorageGB)}</div>
              </div>
            </div>

            {/* Utilization */}
            <div className="mb-6 p-4 rounded-lg bg-card/50 border border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-foreground">Storage Utilization</span>
                <span className={`text-sm ${utilizationPercent > 80 ? 'text-red-400' : utilizationPercent > 60 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {utilizationPercent}% used
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Gauge value={usedStorageGB} max={allocatableStorageGB} size="lg" label="Used" />
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Used</div>
                  <div className="text-xl font-bold text-foreground">{formatMemory(usedStorageGB)}</div>
                  <div className="text-sm text-muted-foreground mt-2">Available</div>
                  <div className="text-lg font-medium text-foreground">{formatMemory(allocatableStorageGB - usedStorageGB)}</div>
                </div>
              </div>
            </div>

            {/* Tab buttons */}
            <div className="flex gap-2 mb-4">
              {pvcs.length > 0 && (
                <button
                  onClick={() => { setShowPVCs(true); setShowNodes(false) }}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${showPVCs ? 'bg-purple-500/20 text-purple-400' : 'text-muted-foreground hover:bg-secondary'}`}
                >
                  PVCs ({pvcs.length})
                </button>
              )}
              {nodes.length > 0 && (
                <button
                  onClick={() => { setShowPVCs(false); setShowNodes(true) }}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${showNodes ? 'bg-purple-500/20 text-purple-400' : 'text-muted-foreground hover:bg-secondary'}`}
                >
                  Nodes ({nodes.length})
                </button>
              )}
            </div>

            {/* PVCs list */}
            {showPVCs && pvcs.length > 0 && (
              <div className="space-y-2">
                {pvcs.map((pvc, i) => (
                  <div key={i} className="p-3 rounded-lg bg-card/50 border border-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono text-sm text-foreground">{pvc.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">({pvc.namespace})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${pvc.status === 'Bound' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                          {pvc.status}
                        </span>
                        <span className="text-sm text-muted-foreground">{formatMemory(pvc.capacityGB)}</span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Storage Class: {pvc.storageClass}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Nodes ephemeral storage */}
            {showNodes && nodes.length > 0 && (
              <div className="space-y-2">
                {nodes.map((node, i) => {
                  const nodePercent = node.ephemeralStorageGB > 0
                    ? Math.round(((node.ephemeralUsedGB || 0) / node.ephemeralStorageGB) * 100)
                    : 0
                  return (
                    <div key={i} className="p-3 rounded-lg bg-card/50 border border-border">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm text-foreground">{node.name}</span>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs px-2 py-0.5 rounded ${nodePercent > 80 ? 'bg-red-500/20 text-red-400' : nodePercent > 60 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
                            {nodePercent}%
                          </span>
                          <span className="text-sm text-muted-foreground">{formatMemory(node.ephemeralStorageGB)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </BaseModal.Content>
    </BaseModal>
  )
}

// ==================== GPU Detail Modal ====================

interface GPUDetailModalProps extends ResourceModalProps {
  gpuNodes: Array<{
    name: string
    gpuType: string
    gpuCount: number
    gpuAllocated: number
    gpuMemoryGB?: number
    gpuUtilization?: number
  }>
  isLoading?: boolean
}

export function GPUDetailModal({
  clusterName,
  gpuNodes,
  isLoading,
  onClose,
}: GPUDetailModalProps) {
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set())

  // Group by GPU type
  const gpuByType = useMemo(() => {
    const map: Record<string, { total: number; allocated: number; nodes: typeof gpuNodes }> = {}
    gpuNodes.forEach(node => {
      const type = node.gpuType || 'Unknown'
      if (!map[type]) {
        map[type] = { total: 0, allocated: 0, nodes: [] }
      }
      map[type].total += node.gpuCount
      map[type].allocated += node.gpuAllocated
      map[type].nodes.push(node)
    })
    return map
  }, [gpuNodes])

  const totalGPUs = gpuNodes.reduce((sum, n) => sum + n.gpuCount, 0)
  const allocatedGPUs = gpuNodes.reduce((sum, n) => sum + n.gpuAllocated, 0)
  const utilizationPercent = totalGPUs > 0 ? Math.round((allocatedGPUs / totalGPUs) * 100) : 0

  return (
    <BaseModal isOpen={true} onClose={onClose} size="lg">
      <BaseModal.Header
        title="GPU Resources"
        description={clusterName}
        icon={HardDrive}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[70vh]">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-32" />
            <Skeleton className="h-48" />
          </div>
        ) : gpuNodes.length === 0 ? (
          <div className="text-center py-12">
            <HardDrive className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-muted-foreground">No GPUs available in this cluster</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-lg bg-card/50 border border-border">
                <div className="text-sm text-muted-foreground mb-1">Total GPUs</div>
                <div className="text-3xl font-bold text-foreground">{totalGPUs}</div>
              </div>
              <div className="p-4 rounded-lg bg-card/50 border border-border">
                <div className="text-sm text-muted-foreground mb-1">Allocated</div>
                <div className="text-3xl font-bold text-yellow-400">{allocatedGPUs}</div>
              </div>
              <div className="p-4 rounded-lg bg-card/50 border border-border">
                <div className="text-sm text-muted-foreground mb-1">Available</div>
                <div className="text-3xl font-bold text-green-400">{totalGPUs - allocatedGPUs}</div>
              </div>
            </div>

            {/* Utilization */}
            <div className="mb-6 p-4 rounded-lg bg-card/50 border border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-foreground">GPU Allocation</span>
                <span className={`text-sm ${utilizationPercent > 80 ? 'text-red-400' : utilizationPercent > 60 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {utilizationPercent}% allocated
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Gauge value={allocatedGPUs} max={totalGPUs} size="lg" label="Allocated" unit="" />
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">GPU Types</div>
                  <div className="text-xl font-bold text-foreground">{Object.keys(gpuByType).length}</div>
                  <div className="text-sm text-muted-foreground mt-2">Nodes with GPU</div>
                  <div className="text-lg font-medium text-foreground">{gpuNodes.length}</div>
                </div>
              </div>
            </div>

            {/* GPU by type */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">GPUs by Type</h3>
              <div className="space-y-3">
                {Object.entries(gpuByType).map(([type, info]) => {
                  const isExpanded = expandedTypes.has(type)
                  return (
                    <div key={type} className="rounded-lg bg-card/50 border border-border overflow-hidden">
                      <button
                        onClick={() => setExpandedTypes(prev => {
                          const next = new Set(prev)
                          if (next.has(type)) next.delete(type)
                          else next.add(type)
                          return next
                        })}
                        className="w-full p-3 flex items-center justify-between hover:bg-card/30 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          <span className="font-medium text-foreground">{type}</span>
                          <span className="text-xs text-muted-foreground">({info.nodes.length} node{info.nodes.length !== 1 ? 's' : ''})</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="w-20">
                            <Gauge value={info.allocated} max={info.total} size="sm" unit="" />
                          </div>
                          <span className="text-sm text-muted-foreground w-16 text-right">{info.allocated}/{info.total}</span>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-border/30 divide-y divide-border/20">
                          {info.nodes.map((node, i) => (
                            <div key={i} className="p-3 flex items-center justify-between">
                              <span className="font-mono text-sm text-foreground">{node.name}</span>
                              <div className="flex items-center gap-4">
                                {node.gpuUtilization !== undefined && (
                                  <span className="text-xs text-muted-foreground">{node.gpuUtilization}% util</span>
                                )}
                                {node.gpuMemoryGB !== undefined && (
                                  <span className="text-xs text-muted-foreground">{node.gpuMemoryGB} GB mem</span>
                                )}
                                <div className="w-16">
                                  <Gauge value={node.gpuAllocated} max={node.gpuCount} size="sm" unit="" />
                                </div>
                                <span className="text-xs text-muted-foreground w-10 text-right">{node.gpuAllocated}/{node.gpuCount}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </BaseModal.Content>
    </BaseModal>
  )
}
