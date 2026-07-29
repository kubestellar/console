import { useState } from 'react'
import { MemoryStick, Server, ChevronDown, ChevronRight } from 'lucide-react'
import { BaseModal } from '../../../lib/modals'
import { Gauge } from '../../charts/Gauge'
import { useTranslation } from 'react-i18next'
import { ResourceModalProps, Skeleton, formatMemory } from './shared'

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

export function MemoryDetailModal({
  clusterName,
  totalMemoryGB,
  allocatableMemoryGB,
  requestedMemoryGB = 0,
  limitMemoryGB = 0,
  nodes = [],
  isLoading,
  onClose }: MemoryDetailModalProps) {
  const { t } = useTranslation()
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
                <div className="text-sm text-muted-foreground mb-1">{t('common.totalCapacity')}</div>
                <div className="text-3xl font-bold text-foreground">{formatMemory(totalMemoryGB)}</div>
              </div>
              <div className="p-4 rounded-lg bg-card/50 border border-border">
                <div className="text-sm text-muted-foreground mb-1">{t('common.allocatable')}</div>
                <div className="text-3xl font-bold text-foreground">{formatMemory(allocatableMemoryGB)}</div>
              </div>
            </div>

            {/* Utilization */}
            <div className="mb-6 p-4 rounded-lg bg-card/50 border border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-foreground">{t('common.memoryAllocation')}</span>
                <span className={`text-sm ${utilizationPercent > 80 ? 'text-red-400' : utilizationPercent > 60 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {utilizationPercent}% requested
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Gauge value={requestedMemoryGB} max={allocatableMemoryGB} size="lg" label="Requested" />
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">{t('common.requested')}</div>
                  <div className="text-xl font-bold text-foreground">{formatMemory(requestedMemoryGB)}</div>
                  {limitMemoryGB > 0 && (
                    <>
                      <div className="text-sm text-muted-foreground mt-2">{t('common.limits')}</div>
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
                              <div className="text-muted-foreground">{t('common.capacity')}</div>
                              <div className="font-medium">{formatMemory(node.memoryCapacityGB)}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">{t('common.requested')}</div>
                              <div className="font-medium">{formatMemory(node.memoryRequestedGB || 0)}</div>
                            </div>
                            {node.memoryUsedGB !== undefined && (
                              <div>
                                <div className="text-muted-foreground">{t('common.usage')}</div>
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
