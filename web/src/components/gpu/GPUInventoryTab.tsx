import { useTranslation } from 'react-i18next'
import {
  Loader2,
  Server,
  AlertTriangle,
} from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { cn } from '../../lib/cn'
import type { GPUNode } from '../../hooks/mcp/types'
import type { GPUClusterInfo } from './ReservationFormModal'
import {
  UTILIZATION_HIGH_THRESHOLD,
  UTILIZATION_MEDIUM_THRESHOLD,
} from './gpu-constants'
import { useGPUTaintFilter, GPUTaintFilterControl } from '../cards/GPUTaintFilter'
import { useRef } from 'react'
import { useModal } from '../../hooks/useModal'

export interface GPUInventoryTabProps {
  gpuClusters: GPUClusterInfo[]
  nodes: GPUNode[]
  nodesLoading: boolean
  effectiveDemoMode: boolean
}

export function GPUInventoryTab({
  gpuClusters,
  nodes,
  nodesLoading,
  effectiveDemoMode,
}: GPUInventoryTabProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { distinctTaints, toleratedKeys, toggle, clear, isVisible, hiddenGPUCount } = useGPUTaintFilter(nodes)
  const { isOpen: isFilterOpen, setIsOpen: setIsFilterOpen } = useModal()
  const filterRef = useRef<HTMLDivElement>(null)

  return (
    <div className="space-y-4">
      {/* Search and Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-secondary/20 p-2 rounded-lg border border-border/50">
        <div className="flex items-center gap-3">
          <GPUTaintFilterControl
            distinctTaints={distinctTaints}
            toleratedKeys={toleratedKeys}
            onToggle={toggle}
            onClear={clear}
            isOpen={isFilterOpen}
            setIsOpen={setIsFilterOpen}
            containerRef={filterRef}
          />
          {hiddenGPUCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400 animate-in fade-in slide-in-from-left-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{t('gpuReservations.inventory.hiddenGpus', '{{count}} GPUs hidden', { count: hiddenGPUCount })}</span>
            </div>
          )}
        </div>
        <div className="text-xs text-muted-foreground italic">
          {t('gpuReservations.inventory.showingTaintAware', 'Showing available capacity based on tolerated taints')}
        </div>
      </div>

      {nodesLoading && gpuClusters.length === 0 && (
        <div className="glass p-8 rounded-lg text-center">
          <Loader2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground animate-spin" />
          <div className="text-muted-foreground">{t('gpuReservations.inventory.loading', 'Loading GPU inventory...')}</div>
        </div>
      )}
      {gpuClusters.length === 0 && !nodesLoading && (
        <div className={'glass p-8 rounded-lg text-center'}>
          <Server className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <div className="text-muted-foreground">{t('gpuReservations.inventory.noGpuNodes')}</div>
        </div>
      )}
      {gpuClusters.map(cluster => {
        const clusterNodes = nodes.filter(n => n.cluster === cluster.name).filter(isVisible)
        if (clusterNodes.length === 0) return null

        return (
          <div key={cluster.name} className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <ClusterBadge cluster={cluster.name} size="sm" />
                <div className="text-sm text-muted-foreground truncate">
                  {(cluster.gpuTypes || []).join(', ')}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="text-foreground font-medium">{t('gpuReservations.inventory.total', { count: clusterNodes.reduce((sum, n) => sum + n.gpuCount, 0) })}</span>
                <span className="text-green-400">{t('gpuReservations.inventory.available', { count: clusterNodes.reduce((sum, n) => sum + (n.gpuCount - n.gpuAllocated), 0) })}</span>
                <span className="text-yellow-400">{t('gpuReservations.inventory.allocated', { count: clusterNodes.reduce((sum, n) => sum + n.gpuAllocated, 0) })}</span>
              </div>
            </div>

            {/* Node rows */}
            <div className="space-y-2">
              {clusterNodes.map(node => {
                const nodePercent = node.gpuCount > 0 ? (node.gpuAllocated / node.gpuCount) * 100 : 0
                return (
                  <div key={node.name} className="flex flex-col gap-2 p-2 rounded bg-secondary/30">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{node.name}</div>
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-muted-foreground">{node.gpuType}</div>
                          {node.taints && node.taints.length > 0 && (
                            <div className="flex gap-1">
                              {node.taints.map((t, idx) => (
                                <span key={idx} className="px-1 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-500 font-mono" title={`${t.key}=${t.value || ''}:${t.effect}`}>
                                  {t.key.split('/').pop()}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-foreground">{node.gpuAllocated}/{node.gpuCount}</span>
                        <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                          <div className={cn(
                            'h-full rounded-full',
                            nodePercent > UTILIZATION_HIGH_THRESHOLD ? 'bg-red-500' :
                              nodePercent > UTILIZATION_MEDIUM_THRESHOLD ? 'bg-yellow-500' : 'bg-green-500'
                          )} style={{ width: `${nodePercent}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
