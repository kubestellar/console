import { Zap, Server, Layers, Cpu, HardDrive, CircuitBoard, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { GPUNode, NVIDIAOperatorStatus } from '../../../hooks/useMCP'
import { StatusBadge } from '../../ui/StatusBadge'
import { wrapAbbreviations } from '../../shared/TechnicalAcronym'
import { GPU_UTIL_HIGH, GPU_UTIL_WARN, type GPUTypeInfo, type ClusterGPUInfo, getUtilizationColor } from './GPUDetailModal.utils'

interface GPUSpecsInfo {
  totalMemoryGB: number
  families: string[]
  cudaDriverVersions: string[]
  cudaRuntimeVersions: string[]
  migCapableCount: number
}

interface GPUSummaryStatsProps {
  total: number
  allocated: number
  available: number
  utilizationPercent: number
}

export function GPUSummaryStats({ total, allocated, available, utilizationPercent }: GPUSummaryStatsProps) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-4 gap-4">
      <div className="glass p-4 rounded-lg text-center">
        <div className="text-3xl font-bold text-foreground">{total}</div>
        <div className="text-xs text-muted-foreground">{t('common.totalGpus')}</div>
      </div>
      <div className="glass p-4 rounded-lg text-center">
        <div className={`text-3xl font-bold ${getUtilizationColor(utilizationPercent)}`}>{allocated}</div>
        <div className="text-xs text-muted-foreground">{t('common.allocated')}</div>
      </div>
      <div className="glass p-4 rounded-lg text-center">
        <div className="text-3xl font-bold text-green-400">{available}</div>
        <div className="text-xs text-muted-foreground">{t('common.available')}</div>
      </div>
      <div className="glass p-4 rounded-lg text-center">
        <div className={`text-3xl font-bold ${getUtilizationColor(utilizationPercent)}`}>{utilizationPercent}%</div>
        <div className="text-xs text-muted-foreground">{t('common.utilization')}</div>
      </div>
    </div>
  )
}

export function DriverInfoPanel({ specs, operatorStatus, manufacturerBreakdown }: {
  specs: GPUSpecsInfo
  operatorStatus?: NVIDIAOperatorStatus[]
  manufacturerBreakdown: [string, number][]
}) {
  return (
    <>
      {(specs.totalMemoryGB > 0 || specs.families.length > 0 || specs.cudaDriverVersions.length > 0) && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <CircuitBoard className="w-4 h-4" />
            GPU Specifications
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {specs.totalMemoryGB > 0 && (
              <div className="glass p-3 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <HardDrive className="w-3 h-3" />
                  {wrapAbbreviations('Total VRAM')}
                </div>
                <div className="text-lg font-bold text-foreground">{specs.totalMemoryGB} GB</div>
              </div>
            )}
            {specs.families.length > 0 && (
              <div className="glass p-3 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Cpu className="w-3 h-3" />
                  Architecture
                </div>
                <div className="text-sm font-medium text-foreground capitalize">
                  {(specs.families || []).join(', ')}
                </div>
              </div>
            )}
            {specs.cudaDriverVersions.length > 0 && (
              <div className="glass p-3 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Settings className="w-3 h-3" />
                  {wrapAbbreviations('CUDA Driver')}
                </div>
                <div className="text-sm font-medium text-foreground">
                  {(specs.cudaDriverVersions || []).join(', ')}
                </div>
              </div>
            )}
            {specs.migCapableCount > 0 && (
              <div className="glass p-3 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Layers className="w-3 h-3" />
                  {wrapAbbreviations('MIG Capable')}
                </div>
                <div className="text-lg font-bold text-purple-400">{specs.migCapableCount}</div>
              </div>
            )}
          </div>
        </div>
      )}

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
                    <span className={`px-2 py-1 rounded text-xs ${status.gpuOperator.ready ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      GPU Operator: {status.gpuOperator.state || (status.gpuOperator.ready ? 'Ready' : 'Not Ready')}
                      {status.gpuOperator.driverVersion && ` (${status.gpuOperator.driverVersion})`}
                    </span>
                  )}
                  {status.networkOperator && (
                    <span className={`px-2 py-1 rounded text-xs ${status.networkOperator.ready ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      Network Operator: {status.networkOperator.state || (status.networkOperator.ready ? 'Ready' : 'Not Ready')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                  'bg-gray-500/20 text-muted-foreground dark:bg-gray-400/20'
                }`}
              >
                {mfg}: {count} GPUs
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

export function GPUMetricsChart({ gpuTypeInfo }: { gpuTypeInfo: GPUTypeInfo[] }) {
  if (gpuTypeInfo.length === 0) return null
  return (
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
                  className={`h-full transition-all ${utilPercent >= GPU_UTIL_HIGH ? 'bg-red-400' : utilPercent >= GPU_UTIL_WARN ? 'bg-yellow-400' : 'bg-green-400'}`}
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
  )
}

export function ClusterBreakdownPanel({ clusterInfo }: { clusterInfo: ClusterGPUInfo[] }) {
  if (clusterInfo.length === 0) return null
  return (
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
                  className={`h-full transition-all ${utilPercent >= GPU_UTIL_HIGH ? 'bg-red-400' : utilPercent >= GPU_UTIL_WARN ? 'bg-yellow-400' : 'bg-green-400'}`}
                  style={{ width: `${utilPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                <span>{info.nodeCount} GPU node{info.nodeCount !== 1 ? 's' : ''}</span>
                <span>{(info.gpuTypes || []).join(', ')}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ProcessTable({ gpuNodes }: { gpuNodes: GPUNode[] }) {
  const { t } = useTranslation()
  if (gpuNodes.length === 0) return null
  return (
    <div>
      <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
        <Server className="w-4 h-4" />
        GPU Nodes ({gpuNodes.length})
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">{t('common.node')}</th>
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">{t('common.cluster')}</th>
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">GPU Type</th>
              <th className="text-center py-2 px-3 text-muted-foreground font-medium">{t('common.memory')}</th>
              <th className="text-center py-2 px-3 text-muted-foreground font-medium">{t('common.used')}</th>
              <th className="text-center py-2 px-3 text-muted-foreground font-medium">{t('common.available')}</th>
              <th className="text-center py-2 px-3 text-muted-foreground font-medium">{t('common.total')}</th>
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
                      {node.migCapable && <StatusBadge color="purple" size="xs">MIG</StatusBadge>}
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
                  <td className="py-2 px-3 text-center text-muted-foreground">{memoryGB ? `${memoryGB}GB` : '-'}</td>
                  <td className={`py-2 px-3 text-center ${getUtilizationColor(utilPercent)}`}>{node.gpuAllocated}</td>
                  <td className="py-2 px-3 text-center text-green-400">{available}</td>
                  <td className="py-2 px-3 text-center text-foreground">{node.gpuCount}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
