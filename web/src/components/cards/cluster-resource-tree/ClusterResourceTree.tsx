import { useEffect, useState } from 'react'
import { Database, Folder, RefreshCw, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useClusters } from '../../../hooks/useMCP'
import {
  useCachedConfigMaps,
  useCachedCronJobs,
  useCachedDaemonSets,
  useCachedDeployments,
  useCachedHPAs,
  useCachedIngresses,
  useCachedJobs,
  useCachedNamespaces,
  useCachedNetworkPolicies,
  useCachedNodes,
  useCachedPVCs,
  useCachedPodIssues,
  useCachedPods,
  useCachedReplicaSets,
  useCachedSecrets,
  useCachedServiceAccounts,
  useCachedServices,
  useCachedStatefulSets,
} from '../../../hooks/useCachedData'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { CardClusterFilter, CardSearchInput } from '../../../lib/cards/CardComponents'
import { useChartFilters } from '../../../lib/cards/cardHooks'
import { useCardLoadingState } from '../CardDataContext'
import { CardControls, type SortDirection } from '../../ui/CardControls'
import { StatusBadge } from '../../ui/StatusBadge'
import { MAX_CACHED_PER_TYPE, TREE_LENS_OPTIONS } from './ClusterResourceTree.constants'
import { NamespaceTreeNode } from './NamespaceTreeNode'
import { TruncatedIndicator } from './TruncatedIndicator'
import {
  buildNamespaceResources,
  evictOfflineClusterCacheEntries,
  filterClusters,
  getIssueCounts,
  getTotalIssueCounts,
  getVisibleNamespaces,
  hasAnyClusterResourceData,
  hasCrossClusterTagMismatch,
  normalizeClusterDataCache,
} from './ClusterResourceTree.utils'
import { TreeNode } from './TreeRenderer'
import { SORT_OPTIONS, type ClusterDataCache, type ClusterResourceTreeProps, type NamespaceResources, type SortByOption, type TreeLens } from './types'

export function ClusterResourceTree({ config: _config }: ClusterResourceTreeProps) {
  const { t } = useTranslation()
  const { deduplicatedClusters: clusters, isLoading, isRefreshing: clustersRefreshing, isFailed, consecutiveFailures } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { drillToNamespace, drillToPod, drillToCluster, drillToDeployment, drillToService, drillToPVC } = useDrillDownActions()

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['clusters']))
  const [searchFilter, setSearchFilter] = useState('')
  const [activeLens, setActiveLens] = useState<TreeLens>('all')
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  const [loadingClusters, setLoadingClusters] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [sortBy, setSortBy] = useState<SortByOption>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [clusterDataCache, setClusterDataCache] = useState<Map<string, ClusterDataCache>>(new Map())

  const renderLimit = limit === 'unlimited' ? Infinity : limit

  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
  } = useChartFilters({ storageKey: 'cluster-resource-tree' })

  const filteredClusters = filterClusters({
    clusters,
    isAllClustersSelected,
    selectedClusters,
    localClusterFilter,
    searchFilter,
  })

  const { issues: podIssues } = useCachedPodIssues(selectedCluster || undefined)
  const { nodes: allNodes, isLoading: nodesLoading, isDemoFallback: nodesDemoFallback } = useCachedNodes(selectedCluster || undefined)
  const { namespaces: allNamespaces, isLoading: namespacesLoading, isDemoFallback: namespacesDemoFallback } = useCachedNamespaces(selectedCluster || undefined)
  const { deployments: allDeployments, isDemoFallback: deploymentsDemoFallback } = useCachedDeployments(selectedCluster || undefined)
  const { services: allServices, isDemoFallback: servicesDemoFallback } = useCachedServices(selectedCluster || undefined)
  const { pvcs: allPVCs, isDemoFallback: pvcsDemoFallback } = useCachedPVCs(selectedCluster || undefined)
  const { pods: allPods, isDemoFallback: podsDemoFallback } = useCachedPods(selectedCluster || undefined, undefined, { limit: 500 })
  const { configmaps: allConfigMaps, isDemoFallback: configmapsDemoFallback } = useCachedConfigMaps(selectedCluster || undefined)
  const { secrets: allSecrets, isDemoFallback: secretsDemoFallback } = useCachedSecrets(selectedCluster || undefined)
  const { serviceAccounts: allServiceAccounts, isDemoFallback: serviceAccountsDemoFallback } = useCachedServiceAccounts(selectedCluster || undefined)
  const { jobs: allJobs, isDemoFallback: jobsDemoFallback } = useCachedJobs(selectedCluster || undefined)
  const { hpas: allHPAs, isDemoFallback: hpasDemoFallback } = useCachedHPAs(selectedCluster || undefined)
  const { replicasets: allReplicaSets, isDemoFallback: replicasetsDemoFallback } = useCachedReplicaSets(selectedCluster || undefined)
  const { statefulsets: allStatefulSets, isDemoFallback: statefulsetsDemoFallback } = useCachedStatefulSets(selectedCluster || undefined)
  const { daemonsets: allDaemonSets, isDemoFallback: daemonsetsDemoFallback } = useCachedDaemonSets(selectedCluster || undefined)
  const { cronjobs: allCronJobs, isDemoFallback: cronjobsDemoFallback } = useCachedCronJobs(selectedCluster || undefined)
  const { ingresses: allIngresses, isDemoFallback: ingressesDemoFallback } = useCachedIngresses(selectedCluster || undefined)
  const { networkpolicies: allNetworkPolicies, isDemoFallback: networkpoliciesDemoFallback } = useCachedNetworkPolicies(selectedCluster || undefined)

  const isDemoData = nodesDemoFallback || namespacesDemoFallback || deploymentsDemoFallback ||
    servicesDemoFallback || pvcsDemoFallback || podsDemoFallback || configmapsDemoFallback ||
    secretsDemoFallback || serviceAccountsDemoFallback || jobsDemoFallback || hpasDemoFallback ||
    replicasetsDemoFallback || statefulsetsDemoFallback || daemonsetsDemoFallback ||
    cronjobsDemoFallback || ingressesDemoFallback || networkpoliciesDemoFallback

  const hasData = clusters.length > 0
  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing: clustersRefreshing,
    hasAnyData: hasData,
    isDemoData,
    isFailed,
    consecutiveFailures,
  })

  useEffect(() => {
    const cluster = selectedCluster
    if (!cluster) return

    const anyHookFinished = !nodesLoading || !namespacesLoading
    if (!anyHookFinished) return
    if (!hasAnyClusterResourceData({ allNodes, allNamespaces, allDeployments, allPods })) return
    if (hasCrossClusterTagMismatch(cluster, { allNodes, allDeployments, allPods, allServices })) return

    const normalizedClusterData = normalizeClusterDataCache({
      maxItems: MAX_CACHED_PER_TYPE,
      allNodes,
      allNamespaces,
      allDeployments,
      allServices,
      allPVCs,
      allPods,
      allConfigMaps,
      allSecrets,
      allServiceAccounts,
      allJobs,
      allHPAs,
      allReplicaSets,
      allStatefulSets,
      allDaemonSets,
      allCronJobs,
      allIngresses,
      allNetworkPolicies,
      podIssues,
    })

    setClusterDataCache(previousCache => {
      const nextCache = new Map(previousCache)
      nextCache.set(cluster, normalizedClusterData)
      return nextCache
    })

    setLoadingClusters(previousLoading => {
      const nextLoading = new Set(previousLoading)
      nextLoading.delete(cluster)
      return nextLoading
    })
  }, [selectedCluster, nodesLoading, namespacesLoading, allNodes, allNamespaces, allDeployments, allServices, allPVCs, allPods, allConfigMaps, allSecrets, allServiceAccounts, allJobs, allHPAs, allReplicaSets, allStatefulSets, allDaemonSets, allCronJobs, allIngresses, allNetworkPolicies, podIssues])

  useEffect(() => {
    setClusterDataCache(previousCache => evictOfflineClusterCacheEntries(previousCache, clusters) || previousCache)
  }, [clusters])

  const getClusterData = (clusterName: string): ClusterDataCache | null => clusterDataCache.get(clusterName) || null

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(previousExpanded => {
      const nextExpanded = new Set(previousExpanded)

      if (nextExpanded.has(nodeId)) {
        nextExpanded.delete(nodeId)
        if (nodeId.startsWith('cluster:')) {
          const clusterName = nodeId.replace('cluster:', '')
          setLoadingClusters(previousLoading => {
            const nextLoading = new Set(previousLoading)
            nextLoading.delete(clusterName)
            return nextLoading
          })
        }
      } else {
        nextExpanded.add(nodeId)
      }

      return nextExpanded
    })
  }

  const totalIssueCounts = getTotalIssueCounts(clusterDataCache)

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {t('resourceTree.clustersCount', { count: filteredClusters.length })}
          </span>
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClusters.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <CardClusterFilter
            availableClusters={availableClusters}
            selectedClusters={localClusterFilter}
            onToggle={toggleClusterFilter}
            onClear={clearClusterFilter}
            isOpen={showClusterFilter}
            setIsOpen={setShowClusterFilter}
            containerRef={clusterFilterRef}
            minClusters={1}
          />
          <CardControls
            limit={limit}
            onLimitChange={setLimit}
            sortBy={sortBy}
            sortOptions={SORT_OPTIONS}
            onSortChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 mb-3 shrink-0">
        <CardSearchInput
          value={searchFilter}
          onChange={setSearchFilter}
          placeholder={t('common.searchResources')}
        />

        <div className="flex flex-wrap gap-1.5">
          {TREE_LENS_OPTIONS.map(lens => (
            <button
              key={lens.id}
              onClick={() => setActiveLens(lens.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                activeLens === lens.id
                  ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                  : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <lens.icon className="w-3.5 h-3.5" />
              {t(lens.translationKey as never)}
              {lens.showCount && totalIssueCounts.total > 0 && (
                <StatusBadge color="red" size="xs" rounded="full" className="ml-0.5">
                  {totalIssueCounts.total}
                </StatusBadge>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 bg-card/30 rounded-lg border border-border overflow-y-auto min-h-card-content">
        <div className="p-2">
          <TreeNode
            id="clusters"
            label={t('resourceTree.clusters')}
            icon={Database}
            iconColor="text-cyan-400"
            count={filteredClusters.length}
            expandedNodes={expandedNodes}
            toggleNode={toggleNode}
          >
            {filteredClusters.map(cluster => {
              const clusterId = `cluster:${cluster.name}`
              const clusterExpanded = expandedNodes.has(clusterId)
              const clusterData = getClusterData(cluster.name)
              const hasClusterData = clusterData !== null
              const namespaceResources = hasClusterData ? buildNamespaceResources(clusterData, searchFilter) : new Map<string, NamespaceResources>()
              const visibleNamespaces = hasClusterData ? getVisibleNamespaces(namespaceResources, activeLens, searchFilter) : []
              const issueCounts = hasClusterData ? getIssueCounts(clusterData) : { nodes: 0, deployments: 0, pods: 0, pvcs: 0, total: 0 }

              return (
                <TreeNode
                  key={cluster.name}
                  id={clusterId}
                  label={cluster.context || cluster.name}
                  icon={Server}
                  iconColor="text-blue-400"
                  statusIndicator={cluster.healthy ? 'healthy' : 'error'}
                  badge={cluster.nodeCount ? t('resourceTree.nodesCount', { count: cluster.nodeCount }) : undefined}
                  badgeColor="bg-secondary text-muted-foreground"
                  onClick={() => drillToCluster(cluster.name)}
                  onToggle={(expanding) => {
                    if (!expanding) return
                    setSelectedCluster(cluster.name)
                    if (!hasClusterData) {
                      setLoadingClusters(previousLoading => new Set(previousLoading).add(cluster.name))
                    }
                  }}
                  indent={1}
                  expandedNodes={expandedNodes}
                  toggleNode={toggleNode}
                >
                  {clusterExpanded && !hasClusterData && loadingClusters.has(cluster.name) && (
                    <div className="flex items-center gap-2 px-2 py-1.5 ml-8 text-xs text-muted-foreground">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      {t('resourceTree.loadingResources')}
                    </div>
                  )}

                  {clusterExpanded && hasClusterData && activeLens === 'issues' && visibleNamespaces.length === 0 && issueCounts.nodes === 0 && (
                    <div className="flex items-center gap-2 px-2 py-1.5 ml-8 text-xs text-muted-foreground">
                      {t('resourceTree.noIssuesFound')}
                    </div>
                  )}

                  {(activeLens === 'all' || activeLens === 'nodes' || (activeLens === 'issues' && issueCounts.nodes > 0)) && clusterExpanded && hasClusterData && clusterData.nodes.length > 0 && (
                    <TreeNode
                      id={`${clusterId}:nodes`}
                      label={t('resourceTree.nodes')}
                      icon={Server}
                      iconColor="text-green-400"
                      count={clusterData.nodes.length}
                      badge={issueCounts.nodes > 0 ? issueCounts.nodes : undefined}
                      badgeColor="bg-red-500/20 text-red-400"
                      indent={2}
                      expandedNodes={expandedNodes}
                      toggleNode={toggleNode}
                    >
                      {clusterData.nodes.slice(0, renderLimit).map(node => (
                        <TreeNode
                          key={node.name}
                          id={`${clusterId}:node:${node.name}`}
                          label={node.name}
                          icon={Server}
                          iconColor={node.status === 'Ready' ? 'text-green-400' : 'text-red-400'}
                          badge={node.status}
                          badgeColor={node.status === 'Ready' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}
                          indent={3}
                          expandedNodes={expandedNodes}
                          toggleNode={toggleNode}
                        />
                      ))}
                      <TruncatedIndicator total={clusterData.nodes.length} shown={renderLimit} indent={3} />
                    </TreeNode>
                  )}

                  {clusterExpanded && hasClusterData && activeLens !== 'nodes' && visibleNamespaces.length > 0 && (
                    <TreeNode
                      id={`${clusterId}:namespaces`}
                      label={t('resourceTree.namespaces')}
                      icon={Folder}
                      iconColor="text-purple-400"
                      count={visibleNamespaces.length}
                      indent={2}
                      expandedNodes={expandedNodes}
                      toggleNode={toggleNode}
                    >
                      {visibleNamespaces.slice(0, renderLimit).map(namespaceName => (
                        <NamespaceTreeNode
                          key={namespaceName}
                          clusterId={clusterId}
                          clusterName={cluster.name}
                          namespaceName={namespaceName}
                          nsData={namespaceResources.get(namespaceName)!}
                          namespaceResources={namespaceResources}
                          activeLens={activeLens}
                          renderLimit={renderLimit}
                          expandedNodes={expandedNodes}
                          toggleNode={toggleNode}
                          drillToNamespace={drillToNamespace}
                          drillToPod={drillToPod}
                          drillToDeployment={drillToDeployment}
                          drillToService={drillToService}
                          drillToPVC={drillToPVC}
                        />
                      ))}
                      <TruncatedIndicator total={visibleNamespaces.length} shown={renderLimit} indent={3} />
                    </TreeNode>
                  )}

                  {clusterExpanded && (
                    <button
                      onClick={() => drillToCluster(cluster.name)}
                      className="flex items-center gap-2 px-2 py-1.5 ml-8 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded transition-colors"
                    >
                      {t('resourceTree.viewClusterDetails')}
                    </button>
                  )}
                </TreeNode>
              )
            })}
          </TreeNode>

          {filteredClusters.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8">
              {t('resourceTree.noClustersMatch')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ClusterResourceTree
