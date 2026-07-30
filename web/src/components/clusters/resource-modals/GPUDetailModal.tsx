import { useState } from 'react'
import { HardDrive, ChevronDown, ChevronRight } from 'lucide-react'
import { BaseModal } from '../../../lib/modals'
import { Gauge } from '../../charts/Gauge'
import { useTranslation } from 'react-i18next'
import { ResourceModalProps, Skeleton } from './shared'

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
  onClose }: GPUDetailModalProps) {
  const { t } = useTranslation()
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set())

  // Group by GPU type
  const gpuByType = (() => {
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
  })()

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
            <div className="text-muted-foreground">No GPUs available in this cluster</div>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-lg bg-card/50 border border-border">
                <div className="text-sm text-muted-foreground mb-1">{t('common.totalGpus')}</div>
                <div className="text-3xl font-bold text-foreground">{totalGPUs}</div>
              </div>
              <div className="p-4 rounded-lg bg-card/50 border border-border">
                <div className="text-sm text-muted-foreground mb-1">{t('common.allocated')}</div>
                <div className="text-3xl font-bold text-yellow-400">{allocatedGPUs}</div>
              </div>
              <div className="p-4 rounded-lg bg-card/50 border border-border">
                <div className="text-sm text-muted-foreground mb-1">{t('common.available')}</div>
                <div className="text-3xl font-bold text-green-400">{totalGPUs - allocatedGPUs}</div>
              </div>
            </div>

            {/* Utilization */}
            <div className="mb-6 p-4 rounded-lg bg-card/50 border border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-foreground">{t('common.gpuAllocation')}</span>
                <span className={`text-sm ${utilizationPercent > 80 ? 'text-red-400' : utilizationPercent > 60 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {utilizationPercent}% allocated
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Gauge value={allocatedGPUs} max={totalGPUs} size="lg" label="Allocated" unit="" />
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">{t('common.gpuTypes')}</div>
                  <div className="text-xl font-bold text-foreground">{Object.keys(gpuByType).length}</div>
                  <div className="text-sm text-muted-foreground mt-2">{t('common.nodesWithGpu')}</div>
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
