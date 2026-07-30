import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { ClusterCardCompact } from './ClusterCardCompact'
import { ClusterDragReorder, SortableClusterItem } from './ClusterDragReorder'
import { ClusterCardFull } from './ClusterCardFull'
import { CLUSTER_GRID_CLASSES } from './ClusterGrid.constants'
import type { ClusterGridProps } from './ClusterGrid.types'
import { ClusterCardList } from './ClusterCardList'

export type { ClusterLayoutMode } from './ClusterGrid.types'

export const ClusterGrid = memo(function ClusterGrid({
  clusters,
  gpuByCluster,
  isConnected,
  permissionsLoading,
  isClusterAdmin,
  onSelectCluster,
  onRenameCluster,
  onRefreshCluster,
  onRemoveCluster,
  onReorder,
  layoutMode = 'grid',
}: ClusterGridProps) {
  const { t } = useTranslation()
  const safeClusters = clusters || []

  if (safeClusters.length === 0) {
    return (
      <div className="text-center py-12 mb-6">
        <div className="text-muted-foreground">{t('cluster.noClustersMatchFilter')}</div>
      </div>
    )
  }

  return (
    <ClusterDragReorder clusters={safeClusters} layoutMode={layoutMode} onReorder={onReorder}>
      <div className={`${CLUSTER_GRID_CLASSES[layoutMode]} mb-6 pt-1`}>
        {safeClusters.map((cluster) => {
          const clusterKey = cluster.name.split('/')[0]
          const gpuInfo = gpuByCluster[clusterKey] || gpuByCluster[cluster.name]
          const clusterIsAdmin = isClusterAdmin(cluster.name)
          const removeHandler = onRemoveCluster ? () => onRemoveCluster(cluster.name) : undefined

          return (
            <SortableClusterItem key={cluster.name} id={cluster.name} onReorder={onReorder}>
              {(dragHandle) => {
                if (layoutMode === 'list') {
                  return (
                    <ClusterCardList
                      cluster={cluster}
                      gpuInfo={gpuInfo}
                      isConnected={isConnected}
                      permissionsLoading={permissionsLoading}
                      isClusterAdmin={clusterIsAdmin}
                      onSelectCluster={() => onSelectCluster(cluster.name)}
                      onRefreshCluster={onRefreshCluster ? () => onRefreshCluster(cluster.name) : undefined}
                      onRemoveCluster={removeHandler}
                      dragHandle={dragHandle}
                    />
                  )
                }

                if (layoutMode === 'compact') {
                  return (
                    <ClusterCardCompact
                      cluster={cluster}
                      gpuInfo={gpuInfo}
                      isConnected={isConnected}
                      onSelectCluster={() => onSelectCluster(cluster.name)}
                      onRemoveCluster={removeHandler}
                      dragHandle={dragHandle}
                    />
                  )
                }

                return (
                  <ClusterCardFull
                    cluster={cluster}
                    gpuInfo={gpuInfo}
                    isConnected={isConnected}
                    permissionsLoading={permissionsLoading}
                    isClusterAdmin={clusterIsAdmin}
                    onSelectCluster={() => onSelectCluster(cluster.name)}
                    onRenameCluster={() => onRenameCluster(cluster.name)}
                    onRefreshCluster={onRefreshCluster ? () => onRefreshCluster(cluster.name) : undefined}
                    onRemoveCluster={removeHandler}
                    dragHandle={dragHandle}
                  />
                )
              }}
            </SortableClusterItem>
          )
        })}
      </div>
    </ClusterDragReorder>
  )
})
