import { useTranslation } from 'react-i18next'
import {
  Loader2,
  Server,
} from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { cn } from '../../lib/cn'
import type { GPUNode } from '../../hooks/mcp/types'
import type { GPUClusterInfo } from './ReservationFormModal'
import {
  UTILIZATION_HIGH_THRESHOLD,
  UTILIZATION_MEDIUM_THRESHOLD,
} from './gpu-constants'

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

  return (
    <div className="space-y-6">
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
        const clusterNodes = nodes.filter(n => n.cluster === cluster.name)
        return (
          <div key={cluster.name} className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <ClusterBadge cluster={cluster.name} size="sm" />
                <div className="text-sm text-muted-foreground">
                  {(cluster.gpuTypes || []).join(', ')}
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-foreground font-medium">{t('gpuReservations.inventory.total', { count: cluster.totalGPUs })}</span>
                <span className="text-green-400">{t('gpuReservations.inventory.available', { count: cluster.availableGPUs })}</span>
                <span className="text-yellow-400">{t('gpuReservations.inventory.allocated', { count: cluster.allocatedGPUs })}</span>
              </div>
            </div>

            {/* Cluster utilization bar */}
            <div className="mb-4">
              <div className="h-3 bg-secondary rounded-full overflow-hidden">
                <div className={cn(
                  'h-full rounded-full transition-all',
                  (cluster.allocatedGPUs / cluster.totalGPUs * 100) > UTILIZATION_HIGH_THRESHOLD ? 'bg-red-500' :
                  (cluster.allocatedGPUs / cluster.totalGPUs * 100) > UTILIZATION_MEDIUM_THRESHOLD ? 'bg-yellow-500' : 'bg-green-500'
                )} style={{ width: `${(cluster.allocatedGPUs / cluster.totalGPUs) * 100}%` }} />
              </div>
            </div>

            {/* Node rows */}
            <div className="space-y-2">
              {clusterNodes.map(node => {
                const nodePercent = node.gpuCount > 0 ? (node.gpuAllocated / node.gpuCount) * 100 : 0
                return (
                  <div key={node.name} className="flex items-center gap-4 p-2 rounded bg-secondary/30">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{node.name}</div>
                      <div className="text-xs text-muted-foreground">{node.gpuType}</div>
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
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
