import { useMemo } from 'react'
import { Zap, Server, Layers, RefreshCw, Cpu, AlertCircle, HardDrive, CircuitBoard, Settings } from 'lucide-react'
import { GPUNode, NVIDIAOperatorStatus } from '../../../hooks/useMCP'
import { BaseModal } from '../../../lib/modals'

interface GPUDetailModalProps {
  gpuNodes: GPUNode[]
  isLoading: boolean
  error: string | null
  onRefresh: () => void
  onClose: () => void
  operatorStatus?: NVIDIAOperatorStatus[]
}

interface GPUTypeInfo {
  type: string
  manufacturer: string
  totalGPUs: number
  allocatedGPUs: number
  availableGPUs: number
  nodeCount: number
  clusters: string[]
}

interface ClusterGPUInfo {
  cluster: string
  totalGPUs: number
  allocatedGPUs: number
  availableGPUs: number
  nodeCount: number
  gpuTypes: string[]
}

function extractManufacturer(gpuType: string): string {
  const lower = gpuType.toLowerCase()
  if (lower.includes('nvidia')) return 'NVIDIA'
  if (lower.includes('amd') || lower.includes('radeon')) return 'AMD'
  if (lower.includes('intel')) return 'Intel'
  return 'Unknown'
}

function getUtilizationColor(percentage: number): string {
  if (percentage >= 90) return 'text-red-400'
  if (percentage >= 70) return 'text-yellow-400'
  return 'text-green-400'
}

interface GPUDetailModalInternalProps extends GPUDetailModalProps {
  isOpen?: boolean
}

export function GPUDetailModal({ isOpen = true, gpuNodes, isLoading, error, onRefresh, onClose, operatorStatus }: GPUDetailModalInternalProps) {

  // Calculate GPU type breakdown
  const gpuTypeInfo = useMemo(() => {
    const typeMap = new Map<string, GPUTypeInfo>()

    gpuNodes.forEach(node => {
      const existing = typeMap.get(node.gpuType)
      if (existing) {
        existing.totalGPUs += node.gpuCount
        existing.allocatedGPUs += node.gpuAllocated
        existing.availableGPUs += (node.gpuCount - node.gpuAllocated)
        existing.nodeCount += 1
        if (!existing.clusters.includes(node.cluster)) {
          existing.clusters.push(node.cluster)
        }
      } else {
        typeMap.set(node.gpuType, {
          type: node.gpuType,
          manufacturer: extractManufacturer(node.gpuType),
          totalGPUs: node.gpuCount,
          allocatedGPUs: node.gpuAllocated,
          availableGPUs: node.gpuCount - node.gpuAllocated,
          nodeCount: 1,
          clusters: [node.cluster],
        })
      }
    })

    return Array.from(typeMap.values()).sort((a, b) => b.totalGPUs - a.totalGPUs)
  }, [gpuNodes])

  // Calculate cluster breakdown
  const clusterInfo = useMemo(() => {
    const clusterMap = new Map<string, ClusterGPUInfo>()

    gpuNodes.forEach(node => {
      const existing = clusterMap.get(node.cluster)
      if (existing) {
        existing.totalGPUs += node.gpuCount
        existing.allocatedGPUs += node.gpuAllocated
        existing.availableGPUs += (node.gpuCount - node.gpuAllocated)
        existing.nodeCount += 1
        if (!existing.gpuTypes.includes(node.gpuType)) {
          existing.gpuTypes.push(node.gpuType)
        }
      } else {
        clusterMap.set(node.cluster, {
          cluster: node.cluster,
          totalGPUs: node.gpuCount,
          allocatedGPUs: node.gpuAllocated,
          availableGPUs: node.gpuCount - node.gpuAllocated,
          nodeCount: 1,
          gpuTypes: [node.gpuType],
        })
      }
    })

    return Array.from(clusterMap.values()).sort((a, b) => b.totalGPUs - a.totalGPUs)
  }, [gpuNodes])

  // Calculate totals
  const totals = useMemo(() => {
    let total = 0
    let allocated = 0
    gpuNodes.forEach(node => {
      total += node.gpuCount
      allocated += node.gpuAllocated
    })
    return {
      total,
      allocated,
      available: total - allocated,
      utilizationPercent: total > 0 ? Math.round((allocated / total) * 100) : 0,
    }
  }, [gpuNodes])

  // Get manufacturer breakdown
  const manufacturerBreakdown = useMemo(() => {
    const mfgMap = new Map<string, number>()
    gpuTypeInfo.forEach(info => {
      const existing = mfgMap.get(info.manufacturer) || 0
      mfgMap.set(info.manufacturer, existing + info.totalGPUs)
    })
    return Array.from(mfgMap.entries()).sort((a, b) => b[1] - a[1])
  }, [gpuTypeInfo])

  // Get GPU specifications from nodes (memory, family, CUDA version)
  const gpuSpecs = useMemo(() => {
    const specs = {
      totalMemoryGB: 0,
      families: new Set<string>(),
      cudaDriverVersions: new Set<string>(),
      cudaRuntimeVersions: new Set<string>(),
      migCapableCount: 0,
    }

    gpuNodes.forEach(node => {
      if (node.gpuMemoryMB) {
        specs.totalMemoryGB += (node.gpuMemoryMB / 1024) * node.gpuCount
      }
      if (node.gpuFamily) {
        specs.families.add(node.gpuFamily)
      }
      if (node.cudaDriverVersion) {
        specs.cudaDriverVersions.add(node.cudaDriverVersion)
      }
      if (node.cudaRuntimeVersion) {
        specs.cudaRuntimeVersions.add(node.cudaRuntimeVersion)
      }
      if (node.migCapable) {
        specs.migCapableCount += node.gpuCount
      }
    })

    return {
      totalMemoryGB: Math.round(specs.totalMemoryGB),
      families: Array.from(specs.families),
      cudaDriverVersions: Array.from(specs.cudaDriverVersions),
      cudaRuntimeVersions: Array.from(specs.cudaRuntimeVersions),
      migCapableCount: specs.migCapableCount,
    }
  }, [gpuNodes])

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg">
      <BaseModal.Header
        title="GPU Resources"
        icon={Zap}
        onClose={onClose}
        showBack={false}
        extra={
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 disabled:opacity-50"
            title="Refresh GPU data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      <BaseModal.Content className="max-h-[60vh]">
        {/* Error state */}
        {error && (
          <div className="flex items-center gap-2 text-yellow-400 text-sm mb-4 p-3 bg-yellow-500/10 rounded-lg">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Content */}
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="glass p-4 rounded-lg text-center">
              <div className="text-3xl font-bold text-foreground">{totals.total}</div>
              <div className="text-xs text-muted-foreground">Total GPUs</div>
            </div>
            <div className="glass p-4 rounded-lg text-center">
              <div className={`text-3xl font-bold ${getUtilizationColor(totals.utilizationPercent)}`}>
                {totals.allocated}
              </div>
              <div className="text-xs text-muted-foreground">Allocated</div>
            </div>
            <div className="glass p-4 rounded-lg text-center">
              <div className="text-3xl font-bold text-green-400">{totals.available}</div>
              <div className="text-xs text-muted-foreground">Available</div>
            </div>
            <div className="glass p-4 rounded-lg text-center">
              <div className={`text-3xl font-bold ${getUtilizationColor(totals.utilizationPercent)}`}>
                {totals.utilizationPercent}%
              </div>
              <div className="text-xs text-muted-foreground">Utilization</div>
            </div>
          </div>

          {/* GPU Specifications */}
          {(gpuSpecs.totalMemoryGB > 0 || gpuSpecs.families.length > 0 || gpuSpecs.cudaDriverVersions.length > 0) && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <CircuitBoard className="w-4 h-4" />
                GPU Specifications
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {gpuSpecs.totalMemoryGB > 0 && (
                  <div className="glass p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <HardDrive className="w-3 h-3" />
                      Total VRAM
                    </div>
                    <div className="text-lg font-bold text-foreground">{gpuSpecs.totalMemoryGB} GB</div>
                  </div>
                )}
                {gpuSpecs.families.length > 0 && (
                  <div className="glass p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <Cpu className="w-3 h-3" />
                      Architecture
                    </div>
                    <div className="text-sm font-medium text-foreground capitalize">
                      {gpuSpecs.families.join(', ')}
                    </div>
                  </div>
                )}
                {gpuSpecs.cudaDriverVersions.length > 0 && (
                  <div className="glass p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <Settings className="w-3 h-3" />
                      CUDA Driver
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {gpuSpecs.cudaDriverVersions.join(', ')}
                    </div>
                  </div>
                )}
                {gpuSpecs.migCapableCount > 0 && (
                  <div className="glass p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <Layers className="w-3 h-3" />
                      MIG Capable
                    </div>
                    <div className="text-lg font-bold text-purple-400">{gpuSpecs.migCapableCount}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* NVIDIA Operator Status */}
          {operatorStatus && operatorStatus.length > 0 && operatorStatus.some(s => s.gpuOperator || s.networkOperator) && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Settings className="w-4 h-4" />
                NVIDIA Operators
              </h4>
              <div className="space-y-2">
                {operatorStatus.map(status => (
                  <div key={status.cluster} className="glass p-3 rounded-lg">
                    <div className="text-sm font-medium text-foreground mb-2">{status.cluster}</div>
                    <div className="flex flex-wrap gap-2">
                      {status.gpuOperator && (
                        <span className={`px-2 py-1 rounded text-xs ${
                          status.gpuOperator.ready
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          GPU Operator: {status.gpuOperator.state || (status.gpuOperator.ready ? 'Ready' : 'Not Ready')}
                          {status.gpuOperator.driverVersion && ` (${status.gpuOperator.driverVersion})`}
                        </span>
                      )}
                      {status.networkOperator && (
                        <span className={`px-2 py-1 rounded text-xs ${
                          status.networkOperator.ready
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          Network Operator: {status.networkOperator.state || (status.networkOperator.ready ? 'Ready' : 'Not Ready')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manufacturer Breakdown */}
          {manufacturerBreakdown.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                Manufacturers
              </h4>
              <div className="flex flex-wrap gap-2">
                {manufacturerBreakdown.map(([mfg, count]) => (
                  <span
                    key={mfg}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                      mfg === 'NVIDIA' ? 'bg-green-500/20 text-green-400' :
                      mfg === 'AMD' ? 'bg-red-500/20 text-red-400' :
                      mfg === 'Intel' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    {mfg}: {count} GPUs
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* GPU Types */}
          {gpuTypeInfo.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4" />
                GPU Types
              </h4>
              <div className="space-y-2">
                {gpuTypeInfo.map(info => {
                  const utilPercent = info.totalGPUs > 0 ? Math.round((info.allocatedGPUs / info.totalGPUs) * 100) : 0
                  return (
                    <div key={info.type} className="glass p-3 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-foreground">{info.type}</span>
                        <span className={`text-sm ${getUtilizationColor(utilPercent)}`}>
                          {info.allocatedGPUs}/{info.totalGPUs} ({utilPercent}%)
                        </span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            utilPercent >= 90 ? 'bg-red-400' :
                            utilPercent >= 70 ? 'bg-yellow-400' :
                            'bg-green-400'
                          }`}
                          style={{ width: `${utilPercent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                        <span>{info.nodeCount} node{info.nodeCount !== 1 ? 's' : ''}</span>
                        <span>{info.clusters.length} cluster{info.clusters.length !== 1 ? 's' : ''}: {info.clusters.join(', ')}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Per-Cluster Breakdown */}
          {clusterInfo.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Layers className="w-4 h-4" />
                By Cluster
              </h4>
              <div className="space-y-2">
                {clusterInfo.map(info => {
                  const utilPercent = info.totalGPUs > 0 ? Math.round((info.allocatedGPUs / info.totalGPUs) * 100) : 0
                  return (
                    <div key={info.cluster} className="glass p-3 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-foreground">{info.cluster}</span>
                        <span className={`text-sm ${getUtilizationColor(utilPercent)}`}>
                          {info.allocatedGPUs}/{info.totalGPUs} allocated
                        </span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            utilPercent >= 90 ? 'bg-red-400' :
                            utilPercent >= 70 ? 'bg-yellow-400' :
                            'bg-green-400'
                          }`}
                          style={{ width: `${utilPercent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                        <span>{info.nodeCount} GPU node{info.nodeCount !== 1 ? 's' : ''}</span>
                        <span>{info.gpuTypes.join(', ')}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Node Details */}
          {gpuNodes.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Server className="w-4 h-4" />
                GPU Nodes ({gpuNodes.length})
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Node</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Cluster</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">GPU Type</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Memory</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Used</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Available</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gpuNodes.map(node => {
                      const available = node.gpuCount - node.gpuAllocated
                      const utilPercent = node.gpuCount > 0 ? Math.round((node.gpuAllocated / node.gpuCount) * 100) : 0
                      const memoryGB = node.gpuMemoryMB ? Math.round(node.gpuMemoryMB / 1024) : null
                      return (
                        <tr key={`${node.cluster}-${node.name}`} className="border-b border-border/50 hover:bg-secondary/30">
                          <td className="py-2 px-3 font-mono text-xs text-foreground">
                            <div className="flex items-center gap-1">
                              {node.name}
                              {node.migCapable && (
                                <span className="px-1 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[10px]">MIG</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">{node.cluster}</td>
                          <td className="py-2 px-3 text-muted-foreground">
                            <div>
                              {node.gpuType}
                              {node.gpuFamily && (
                                <span className="text-xs text-muted-foreground/70 ml-1 capitalize">({node.gpuFamily})</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center text-muted-foreground">
                            {memoryGB ? `${memoryGB}GB` : '-'}
                          </td>
                          <td className={`py-2 px-3 text-center ${getUtilizationColor(utilPercent)}`}>
                            {node.gpuAllocated}
                          </td>
                          <td className="py-2 px-3 text-center text-green-400">{available}</td>
                          <td className="py-2 px-3 text-center text-foreground">{node.gpuCount}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty state */}
          {gpuNodes.length === 0 && !isLoading && (
            <div className="text-center py-8 text-muted-foreground">
              <Zap className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No GPU nodes detected across your clusters</p>
              <p className="text-sm mt-1">GPU nodes with nvidia.com/gpu resources will appear here</p>
            </div>
          )}

          {/* Loading state */}
          {isLoading && gpuNodes.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin" />
              <p>Loading GPU data...</p>
            </div>
          )}
        </div>
      </BaseModal.Content>
    </BaseModal>
  )
}
