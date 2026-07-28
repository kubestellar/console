import { AlertTriangle, ChevronDown, ChevronRight, Scissors, Server } from 'lucide-react'
import type { ClusterInfo } from '../../hooks/mcp/types'
import type { ClusterGroup } from '../../hooks/useGlobalFilters'
import { refreshSingleCluster } from '../../hooks/useMCP'
import { FilterTabs, ClusterGrid, type ClusterLayoutMode } from './components'
import { EmptyClusterState } from './EmptyClusterState'
import { ClusterCardSkeleton } from '../ui/ClusterCardSkeleton'
import { ClusterGroupsSection } from './ClusterGroupsSection'
import type { ClusterStats, GPUByCluster } from './useClusterStats'
import type { ClusterFilterValue, ClusterSortBy } from './useClusterPageState'
import { STORAGE_KEY_CLUSTER_LAYOUT } from '../../lib/constants'
import { safeSetItem } from '../../lib/utils/localStorage'

export interface ClusterInfoSectionProps {
  clusters: ClusterInfo[]
  filteredClusters: ClusterInfo[]
  stats: ClusterStats
  clusterGroundtruthFields: Record<string, number>
  isLoading: boolean
  showSkeletonContent: boolean
  showClusterGrid: boolean
  onToggleClusterGrid: () => void
  filter: ClusterFilterValue
  onFilterChange: (filter: ClusterFilterValue) => void
  sortBy: ClusterSortBy
  onSortByChange: (sortBy: ClusterSortBy) => void
  sortAsc: boolean
  onSortAscChange: (asc: boolean) => void
  layoutMode: ClusterLayoutMode
  onLayoutModeChange: (mode: ClusterLayoutMode) => void
  gpuByCluster: GPUByCluster
  isConnected: boolean
  isDegraded: boolean
  inClusterMode: boolean
  permissionsLoading: boolean
  isClusterAdmin: boolean
  onAddCluster: () => void
  onCreateClusterWithAI: () => void
  onPruneStaleContexts: () => void
  onSelectCluster: (name: string) => void
  onRenameCluster: (name: string) => void
  onRemoveCluster: (name: string) => void
  onReorder: (newOrder: string[]) => void
  clusterGroups: ClusterGroup[]
  addClusterGroup: (group: { name: string; clusters: string[] }) => void
  deleteClusterGroup: (id: string) => void
  selectClusterGroup: (id: string) => void
}

/**
 * Renders the Clusters page "beforeCards" content: the stale-kubeconfig
 * banner, the collapsible Cluster Info Cards section (filter tabs + grid),
 * and the Cluster Groups section. Extracted from Clusters.tsx (#21617).
 */
export function ClusterInfoSection({
  clusters,
  filteredClusters,
  stats,
  clusterGroundtruthFields,
  isLoading,
  showSkeletonContent,
  showClusterGrid,
  onToggleClusterGrid,
  filter,
  onFilterChange,
  sortBy,
  onSortByChange,
  sortAsc,
  onSortAscChange,
  layoutMode,
  onLayoutModeChange,
  gpuByCluster,
  isConnected,
  isDegraded,
  inClusterMode,
  permissionsLoading,
  isClusterAdmin,
  onAddCluster,
  onCreateClusterWithAI,
  onPruneStaleContexts,
  onSelectCluster,
  onRenameCluster,
  onRemoveCluster,
  onReorder,
  clusterGroups,
  addClusterGroup,
  deleteClusterGroup,
  selectClusterGroup,
}: ClusterInfoSectionProps) {
  return (
    <>
      {Object.entries(clusterGroundtruthFields).map(([field, value]) => (
        <span key={field} className="sr-only" data-groundtruth-field={field}>
          {value}
        </span>
      ))}

      {/* Stale Kubeconfig Contexts Banner */}
      {stats.staleContexts > 0 && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-lg border bg-yellow-500/10 border-yellow-500/20 text-yellow-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="text-sm flex-1">
            {stats.staleContexts} kubeconfig context{stats.staleContexts > 1 ? 's' : ''} never connected — these may be deleted clusters.
          </span>
          <button
            onClick={onPruneStaleContexts}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/20 text-yellow-300 text-xs font-medium hover:bg-yellow-500/30 transition-colors whitespace-nowrap"
          >
            <Scissors className="w-3.5 h-3.5" />
            Prune Kubeconfig
          </button>
        </div>
      )}

      {/* Cluster Info Cards - collapsible */}
      <div className="mb-6">
        <button
          onClick={onToggleClusterGrid}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <Server className="w-4 h-4" />
          <span>Cluster Info Cards {showSkeletonContent ? '' : `(${filteredClusters.length})`}</span>
          {showClusterGrid ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {showClusterGrid && (
          showSkeletonContent ? (
            /* Show skeleton cluster cards when offline/loading */
            <>
              <div className="flex gap-2 mb-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-8 w-24 bg-secondary/60 rounded-lg animate-pulse" />
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                  <ClusterCardSkeleton key={i} />
                ))}
              </div>
            </>
          ) : (
            <>
              <FilterTabs
                stats={stats}
                filter={filter}
                onFilterChange={onFilterChange}
                sortBy={sortBy}
                onSortByChange={onSortByChange}
                sortAsc={sortAsc}
                onSortAscChange={onSortAscChange}
                layoutMode={layoutMode}
                onLayoutModeChange={(mode) => {
                  onLayoutModeChange(mode)
                  safeSetItem(STORAGE_KEY_CLUSTER_LAYOUT, mode)
                }}
                onAddCluster={onAddCluster}
                onCreateClusterWithAI={onCreateClusterWithAI}
              />
              {filteredClusters.length === 0 && !isLoading && !showSkeletonContent ? (
                <EmptyClusterState
                  onAddCluster={onAddCluster}
                  agentConnected={isConnected}
                  agentDegraded={isDegraded}
                  inClusterMode={inClusterMode}
                />
              ) : (
                <ClusterGrid
                  clusters={filteredClusters}
                  layoutMode={layoutMode}
                  gpuByCluster={gpuByCluster}
                  isConnected={isConnected}
                  permissionsLoading={permissionsLoading}
                  isClusterAdmin={isClusterAdmin}
                  onSelectCluster={onSelectCluster}
                  onRenameCluster={onRenameCluster}
                  onRefreshCluster={refreshSingleCluster}
                  onRemoveCluster={onRemoveCluster}
                  onReorder={onReorder}
                />
              )}
            </>
          )
        )}
      </div>

      {/* Cluster Groups */}
      <ClusterGroupsSection
        clusters={clusters}
        clusterGroups={clusterGroups}
        addClusterGroup={addClusterGroup}
        deleteClusterGroup={deleteClusterGroup}
        selectClusterGroup={selectClusterGroup}
      />
    </>
  )
}
