import { AlertTriangle, ChevronRight, Layers, Server } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import type { DrillDownViewType } from '../../../../hooks/useDrillDown'
import type { ClusterErrorEntry, SummaryItem, ViewConfig } from './types'
import { ClusterErrorList } from './ClusterErrorList'
import { getStatusBadge } from './helpers'

interface MultiClusterItemsPanelProps {
  filteredItems: SummaryItem[]
  viewType: DrillDownViewType
  config: ViewConfig
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  cachedNodesLength: number
  expectedNodeCountFromClusters: number
  expectedPodCountFromClusters: number
  nodesIsLoading: boolean
  nodesIsFailed: boolean
  nodeClusterErrors: ClusterErrorEntry[]
  podClusterErrors: ClusterErrorEntry[]
  onItemClick: (item: SummaryItem) => void
}

export function MultiClusterItemsPanel({
  filteredItems,
  viewType,
  config,
  Icon,
  cachedNodesLength,
  expectedNodeCountFromClusters,
  expectedPodCountFromClusters,
  nodesIsLoading,
  nodesIsFailed,
  nodeClusterErrors,
  podClusterErrors,
  onItemClick,
}: MultiClusterItemsPanelProps) {
  return (
    <div className="space-y-2">
      {filteredItems.length === 0 ? (
        viewType === 'all-nodes' && nodesIsLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading node details…</div>
        ) : viewType === 'all-nodes' && cachedNodesLength === 0 && expectedNodeCountFromClusters > 0 ? (
          <div className="glass rounded-lg p-6 text-sm space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">
                  Cluster summary reports {expectedNodeCountFromClusters} node
                  {expectedNodeCountFromClusters === 1 ? '' : 's'}, but the detailed list is empty.
                </div>
                {nodeClusterErrors.length > 0 ? (
                  <ClusterErrorList
                    errors={nodeClusterErrors}
                    authLabel="RBAC denied (list-nodes)"
                    titlePrefix="The nodes endpoint returned an error for"
                  />
                ) : (
                  <div className="text-muted-foreground mt-1">
                    {nodesIsFailed
                      ? 'The node list endpoint is currently unreachable.'
                      : "This usually means the current user lacks list-nodes RBAC on one or more clusters, so the detail view can't enumerate nodes even though the per-cluster summary includes their count."}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : viewType === 'all-pods' && expectedPodCountFromClusters > 0 ? (
          <div className="glass rounded-lg p-6 text-sm space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">
                  Cluster summary reports {expectedPodCountFromClusters} pod
                  {expectedPodCountFromClusters === 1 ? '' : 's'}, but the detailed list is empty.
                </div>
                {podClusterErrors.length > 0 ? (
                  <ClusterErrorList
                    errors={podClusterErrors}
                    authLabel="RBAC denied (list-pods)"
                    titlePrefix="The pods endpoint returned an error for"
                  />
                ) : (
                  <div className="text-muted-foreground mt-1">
                    This usually means the current user lacks list-pods RBAC on one or more clusters, or the pods endpoint is temporarily unreachable — the per-cluster summary includes the count but the detail view can&apos;t enumerate individual pods.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">No items found</div>
        )
      ) : (
        filteredItems.slice(0, 100).map((item, idx) => {
          const name =
            (item[config.nameKey] as string) ||
            (item.name as string) ||
            'Unknown'
          const cluster = (item.cluster as string) || ''
          const namespace = item.namespace as string
          const status = config.getStatus(item)
          const statusBadge = getStatusBadge(status)
          const StatusIcon = statusBadge.icon

          return (
            <button
              key={`${cluster}-${namespace}-${name}-${idx}`}
              onClick={() => onItemClick(item)}
              className="w-full flex items-center justify-between p-3 glass rounded-lg hover:bg-card/70 transition-colors text-left group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-2 rounded-lg ${config.bgColor}`}>
                  <Icon className={`w-4 h-4 ${config.color}`} />
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate">{name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    {cluster && (
                      <span className="flex items-center gap-1">
                        <Server className="w-3 h-3" />
                        {cluster.split('/').pop()}
                      </span>
                    )}
                    {namespace && (
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {namespace}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-full text-xs flex items-center gap-1 ${statusBadge.bg} ${statusBadge.color}`}>
                  <StatusIcon className="w-3 h-3" />
                  {status}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          )
        })
      )}
      {filteredItems.length > 100 && (
        <div className="text-center py-4 text-muted-foreground text-sm">
          Showing 100 of {filteredItems.length} items. Use filters to narrow down.
        </div>
      )}
    </div>
  )
}
