import { useState } from 'react'
import { Cpu, Server, ChevronDown, ChevronRight } from 'lucide-react'
import { BaseModal } from '../../../lib/modals'
import { Gauge } from '../../charts/Gauge'
import { useTranslation } from 'react-i18next'
import { ResourceModalProps, Skeleton } from './shared'

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
  onClose }: CPUDetailModalProps) {
  const { t } = useTranslation()
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
                <div className="text-sm text-muted-foreground mb-1">{t('common.totalCapacity')}</div>
                <div className="text-3xl font-bold text-foreground">{totalCores}</div>
                <div className="text-xs text-muted-foreground">cores</div>
              </div>
              <div className="p-4 rounded-lg bg-card/50 border border-border">
                <div className="text-sm text-muted-foreground mb-1">{t('common.allocatable')}</div>
                <div className="text-3xl font-bold text-foreground">{allocatableCores}</div>
                <div className="text-xs text-muted-foreground">cores</div>
              </div>
            </div>

            {/* Utilization */}
            <div className="mb-6 p-4 rounded-lg bg-card/50 border border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-foreground">{t('common.cpuAllocation')}</span>
                <span className={`text-sm ${utilizationPercent > 80 ? 'text-red-400' : utilizationPercent > 60 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {utilizationPercent}% requested
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Gauge value={requestedCores} max={allocatableCores} size="lg" label="Requested" />
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">{t('common.requested')}</div>
                  <div className="text-xl font-bold text-foreground">{requestedCores.toFixed(1)}</div>
                  {limitCores > 0 && (
                    <>
                      <div className="text-sm text-muted-foreground mt-2">{t('common.limits')}</div>
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
                              <div className="text-muted-foreground">{t('common.capacity')}</div>
                              <div className="font-medium">{node.cpuCapacity} cores</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">{t('common.requested')}</div>
                              <div className="font-medium">{(node.cpuRequested || 0).toFixed(1)} cores</div>
                            </div>
                            {node.cpuUsed !== undefined && (
                              <div>
                                <div className="text-muted-foreground">{t('common.usage')}</div>
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
