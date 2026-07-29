import { AlertTriangle, ChevronDown, ChevronRight, Scissors, Server } from 'lucide-react'
import type { TFunction } from 'i18next'
import { loadMissionPrompt } from '../cards/multi-tenancy/missionLoader'
import { FilterTabs, ClusterGrid } from './components'
import { EmptyClusterState } from './EmptyClusterState'
import { ClusterGroupsSection } from './ClusterGroupsSection'
import { ClusterCardSkeleton } from '../ui/ClusterCardSkeleton'
import { refreshSingleCluster } from '../../hooks/useMCP'
import { isInClusterMode } from '../../hooks/useBackendHealth'
import type { ClusterInfo } from '../../hooks/mcp/types'
import type { GPUByCluster, ClusterStats } from './useClusterStats'
import type { ClusterHealthFilter, ClusterSortField } from './useClusterViewState'
import type { ClusterLayoutMode } from './components'
import type { ClusterGroup } from '../../hooks/useGlobalFilters'
import type { StartMissionParams } from '../../hooks/useMissions.types'

const AI_CLUSTER_CREATION_CONTEXT = {
  allowMissingLocalTools: true,
  skipClusterPreflight: true,
  missionFlow: 'cluster-creation',
}

export interface ClustersBeforeCardsProps {
  clusters: ClusterInfo[]
  filteredClusters: ClusterInfo[]
  stats: ClusterStats
  clusterGroundtruthFields: Record<string, number>
  showClusterGrid: boolean
  setShowClusterGrid: (v: boolean) => void
  showSkeletonContent: boolean
  filter: ClusterHealthFilter
  setFilter: (f: ClusterHealthFilter) => void
  sortBy: ClusterSortField
  setSortBy: (s: ClusterSortField) => void
  sortAsc: boolean
  setSortAsc: (v: boolean) => void
  layoutMode: ClusterLayoutMode
  setLayoutMode: (m: ClusterLayoutMode) => void
  gpuByCluster: GPUByCluster
  isConnected: boolean
  isDegraded: boolean
  isLoading: boolean
  permissionsLoading: boolean
  isClusterAdmin: boolean
  clusterGroups: ClusterGroup[]
  addClusterGroup: (group: Omit<ClusterGroup, 'id'>) => void
  deleteClusterGroup: (id: string) => void
  selectClusterGroup: (groupId: string) => void
  setSelectedCluster: (c: string | null) => void
  setRenamingCluster: (c: string | null) => void
  setRemovingCluster: (c: string | null) => void
  handleReorder: (order: string[]) => void
  setShowAddCluster: (v: boolean) => void
  pruneCheckKeyAndRun: (fn: () => void | Promise<void>) => void
  createCheckKeyAndRun: (fn: () => void | Promise<void>) => void
  startMission: (params: StartMissionParams) => string
  openSidebar: () => void
  t: TFunction
}

/**
 * Renders the "before cards" region of the Clusters page:
 *  - Accessibility groundtruth fields
 *  - Stale kubeconfig contexts warning banner
 *  - Collapsible cluster info cards section (FilterTabs + ClusterGrid / EmptyState / skeleton)
 *  - Cluster groups section
 *
 * Extracted from Clusters.tsx (#21886) to reduce the component's line count.
 * All logic lives in useClustersView; this component is purely presentational.
 */
export function ClustersBeforeCards({
  clusters,
  filteredClusters,
  stats,
  clusterGroundtruthFields,
  showClusterGrid,
  setShowClusterGrid,
  showSkeletonContent,
  filter,
  setFilter,
  sortBy,
  setSortBy,
  sortAsc,
  setSortAsc,
  layoutMode,
  setLayoutMode,
  gpuByCluster,
  isConnected,
  isDegraded,
  isLoading,
  permissionsLoading,
  isClusterAdmin,
  clusterGroups,
  addClusterGroup,
  deleteClusterGroup,
  selectClusterGroup,
  setSelectedCluster,
  setRenamingCluster,
  setRemovingCluster,
  handleReorder,
  setShowAddCluster,
  pruneCheckKeyAndRun,
  createCheckKeyAndRun,
  startMission,
  openSidebar,
  t,
}: ClustersBeforeCardsProps) {
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
            onClick={() => {
              pruneCheckKeyAndRun(async () => {
                const prompt = await loadMissionPrompt(
                  'kubeconfig-prune',
                  'Back up my kubeconfig to a timestamped file, test each context for reachability, show me which are stale, ask for confirmation, then remove the stale ones. Tell me the backup file path.',
                )
                startMission({
                  title: 'Prune Stale Kubeconfig Contexts',
                  description: 'Safely clean up kubeconfig by removing entries for clusters that no longer exist',
                  type: 'repair',
                  initialPrompt: prompt,
                })
              })
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/20 text-yellow-300 text-xs font-medium hover:bg-yellow-500/30 transition-colors whitespace-nowrap"
          >
            <Scissors className="w-3.5 h-3.5" />
            Prune Kubeconfig
          </button>
        </div>
      )}

      {/* Cluster Info Cards — collapsible */}
      <div className="mb-6">
        <button
          onClick={() => setShowClusterGrid(!showClusterGrid)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <Server className="w-4 h-4" />
          <span>Cluster Info Cards {showSkeletonContent ? '' : `(${filteredClusters.length})`}</span>
          {showClusterGrid ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {showClusterGrid && (
          showSkeletonContent ? (
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
                onFilterChange={setFilter}
                sortBy={sortBy}
                onSortByChange={setSortBy}
                sortAsc={sortAsc}
                onSortAscChange={setSortAsc}
                layoutMode={layoutMode}
                onLayoutModeChange={setLayoutMode}
                onAddCluster={() => setShowAddCluster(true)}
                onCreateClusterWithAI={() => {
                  createCheckKeyAndRun(async () => {
                    const prompt = await loadMissionPrompt(
                      'create-cluster',
                      'Help me create a new Kubernetes cluster. Ask me about the provider (kind, k3d, EKS, GKE, AKS, OpenShift), cluster name, node count, and Kubernetes version. Then generate and execute the appropriate commands to create the cluster and add it to my kubeconfig.',
                    )
                    startMission({
                      title: t('cluster.createClusterWithAI'),
                      description: 'AI-guided cluster creation across any provider',
                      type: 'deploy',
                      initialPrompt: prompt,
                      context: AI_CLUSTER_CREATION_CONTEXT,
                    })
                    openSidebar()
                  })
                }}
              />
              {filteredClusters.length === 0 && !isLoading && !showSkeletonContent ? (
                <EmptyClusterState
                  onAddCluster={() => setShowAddCluster(true)}
                  agentConnected={isConnected}
                  agentDegraded={isDegraded}
                  inClusterMode={isInClusterMode()}
                />
              ) : (
                <ClusterGrid
                  clusters={filteredClusters}
                  layoutMode={layoutMode}
                  gpuByCluster={gpuByCluster}
                  isConnected={isConnected}
                  permissionsLoading={permissionsLoading}
                  isClusterAdmin={isClusterAdmin}
                  onSelectCluster={setSelectedCluster}
                  onRenameCluster={setRenamingCluster}
                  onRefreshCluster={refreshSingleCluster}
                  onRemoveCluster={setRemovingCluster}
                  onReorder={handleReorder}
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
