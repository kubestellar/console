import { useState, useEffect } from 'react'
import { Server, Box, Layers, Database, Network, HardDrive, AlertTriangle, RefreshCw, Folder } from 'lucide-react'
import { useClusters } from '../../../hooks/useMCP'
import { useCachedPodIssues, useCachedNodes, useCachedNamespaces, useCachedDeployments, useCachedServices, useCachedPVCs, useCachedPods, useCachedConfigMaps, useCachedSecrets, useCachedServiceAccounts, useCachedJobs, useCachedHPAs, useCachedReplicaSets, useCachedStatefulSets, useCachedDaemonSets, useCachedCronJobs, useCachedIngresses, useCachedNetworkPolicies } from '../../../hooks/useCachedData'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useCardLoadingState } from '../CardDataContext'
import { CardControls, SortDirection } from '../../ui/CardControls'
import { CardClusterFilter, CardSearchInput } from '../../../lib/cards/CardComponents'
import { useChartFilters } from '../../../lib/cards/cardHooks'
import { TreeNode } from './TreeRenderer'
import { ResourceIcon, SORT_OPTIONS } from './types'
import { buildNamespaceResources, getVisibleNamespaces, getIssueCounts, getPodsForDeployment } from './TreeBuilder'
import type { ClusterResourceTreeProps, TreeLens, SortByOption, NamespaceResources, ClusterDataCache } from './types'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../../ui/StatusBadge'

/** Maximum items to cache per resource type per cluster, to prevent unbounded memory growth */
const MAX_CACHED_PER_TYPE = 500

/** Renders a "+N more" indicator when a list is truncated by the render limit */
function TruncatedIndicator({ total, shown, indent }: { total: number; shown: number; indent: number }) {
  if (shown >= total) return null
  return (
    <div
      className="text-xs text-muted-foreground py-1 px-2"
      style={{ paddingLeft: `${indent * 16 + 8}px` }}
    >
      +{total - shown} more
    </div>
  )
}

export function ClusterResourceTree({ config: _config }: ClusterResourceTreeProps) {
  const { t } = useTranslation()
  const { deduplicatedClusters: clusters, isLoading, isRefreshing: clustersRefreshing, isFailed, consecutiveFailures } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { drillToNamespace, drillToPod, drillToCluster, drillToDeployment, drillToService, drillToPVC } = useDrillDownActions()
  // Tree view state - start with clusters expanded
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['clusters']))
  const [searchFilter, setSearchFilter] = useState('')
  const [activeLens, setActiveLens] = useState<TreeLens>('all')
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  // Track which clusters are currently loading data
  const [loadingClusters, setLoadingClusters] = useState<Set<string>>(new Set())

  // Sort state
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [sortBy, setSortBy] = useState<SortByOption>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Effective render limit — applies to all resource lists inside the tree
  const renderLimit = limit === 'unlimited' ? Infinity : limit

  // Local cluster filter via shared hook
  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef } = useChartFilters({
    storageKey: 'cluster-resource-tree' })

  // Per-cluster data cache - persists data for all expanded clusters
  const [clusterDataCache, setClusterDataCache] = useState<Map<string, ClusterDataCache>>(new Map())

  // Get filtered clusters based on global filter + local cluster filter
  // Include all clusters (don't filter by reachability - show clusters with unknown status)
  const filteredClusters = (() => {
    let result = clusters
    if (!isAllClustersSelected) {
      result = result.filter(c => selectedClusters.includes(c.name))
    }
    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
      result = result.filter(c => localClusterFilter.includes(c.name))
    }
    if (searchFilter) {
      const query = searchFilter.toLowerCase()
      result = result.filter(c => c.name.toLowerCase().includes(query))
    }
    return result
  })()

  // Fetch data for the selected cluster (only when a cluster is expanded)
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

  // Combine all isDemoFallback values from cached hooks
  const isDemoData = nodesDemoFallback || namespacesDemoFallback || deploymentsDemoFallback ||
    servicesDemoFallback || pvcsDemoFallback || podsDemoFallback || configmapsDemoFallback ||
    secretsDemoFallback || serviceAccountsDemoFallback || jobsDemoFallback || hpasDemoFallback ||
    replicasetsDemoFallback || statefulsetsDemoFallback || daemonsetsDemoFallback ||
    cronjobsDemoFallback || ingressesDemoFallback || networkpoliciesDemoFallback

  // Report state to CardWrapper for refresh animation
  const hasData = clusters.length > 0
  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing: clustersRefreshing,
    hasAnyData: hasData,
    isDemoData,
    isFailed,
    consecutiveFailures })

  // Cache data for the selected cluster when it changes
  useEffect(() => {
    // Capture `selectedCluster` at effect run-time — we key the cache write
    // against this captured value, not whatever the closure would otherwise
    // resolve to later.
    const cluster = selectedCluster
    if (!cluster) return
    // Cache once at least one hook has finished loading and has meaningful data
    const anyHookFinished = !nodesLoading || !namespacesLoading
    if (!anyHookFinished) return
    const hasAnyData = (allNodes && allNodes.length > 0) ||
                       (allNamespaces && allNamespaces.length > 0) ||
                       (allDeployments && allDeployments.length > 0) ||
                       (allPods && allPods.length > 0)
    if (hasAnyData) {
      // Guard against cross-cluster leakage (#6051): individual cached hooks
      // do not atomically swap their returned data when the cluster key
      // changes — a hook can still be returning the prior cluster's tagged
      // results while its next fetch is in flight. Every hook tags items
      // with `.cluster`, so if any top-level dataset references a different
      // cluster, bail out and wait for a clean render where all hooks agree.
      // Without this, switching A → B would persist A's nodes/pods under
      // the cache key for B.
      const tagMismatch = (tag?: string) => tag !== undefined && tag !== cluster
      if (
        (allNodes && allNodes.length > 0 && tagMismatch(allNodes[0].cluster)) ||
        (allPods && allPods.length > 0 && tagMismatch(allPods[0].cluster)) ||
        (allDeployments && allDeployments.length > 0 && tagMismatch(allDeployments[0].cluster)) ||
        (allServices && allServices.length > 0 && tagMismatch(allServices[0].cluster))
      ) {
        return
      }

      setClusterDataCache(prev => {
        const next = new Map(prev)
        next.set(cluster, {
          nodes: allNodes.slice(0, MAX_CACHED_PER_TYPE).map(n => ({ name: n.name, status: n.status })),
          namespaces: [...(allNamespaces || [])].slice(0, MAX_CACHED_PER_TYPE),
          deployments: (allDeployments || []).slice(0, MAX_CACHED_PER_TYPE).map(d => ({
            name: d.name,
            namespace: d.namespace,
            replicas: d.replicas,
            readyReplicas: d.readyReplicas,
            status: d.status,
            image: d.image })),
          services: (allServices || []).slice(0, MAX_CACHED_PER_TYPE).map(s => ({
            name: s.name,
            namespace: s.namespace,
            type: s.type })),
          pvcs: (allPVCs || []).slice(0, MAX_CACHED_PER_TYPE).map(p => ({
            name: p.name,
            namespace: p.namespace,
            status: p.status,
            capacity: p.capacity })),
          pods: (allPods || []).slice(0, MAX_CACHED_PER_TYPE).map(p => ({
            name: p.name,
            namespace: p.namespace,
            status: p.status,
            restarts: p.restarts })),
          configmaps: (allConfigMaps || []).slice(0, MAX_CACHED_PER_TYPE).map(cm => ({
            name: cm.name,
            namespace: cm.namespace,
            dataCount: cm.dataCount || 0 })),
          secrets: (allSecrets || []).slice(0, MAX_CACHED_PER_TYPE).map(s => ({
            name: s.name,
            namespace: s.namespace,
            type: s.type || 'Opaque' })),
          serviceaccounts: (allServiceAccounts || []).slice(0, MAX_CACHED_PER_TYPE).map(sa => ({
            name: sa.name,
            namespace: sa.namespace })),
          jobs: (allJobs || []).slice(0, MAX_CACHED_PER_TYPE).map(j => ({
            name: j.name,
            namespace: j.namespace,
            status: j.status,
            completions: j.completions,
            duration: j.duration })),
          hpas: (allHPAs || []).slice(0, MAX_CACHED_PER_TYPE).map(h => ({
            name: h.name,
            namespace: h.namespace,
            reference: h.reference,
            minReplicas: h.minReplicas,
            maxReplicas: h.maxReplicas,
            currentReplicas: h.currentReplicas })),
          replicasets: (allReplicaSets || []).slice(0, MAX_CACHED_PER_TYPE).map(rs => ({
            name: rs.name,
            namespace: rs.namespace,
            replicas: rs.replicas,
            readyReplicas: rs.readyReplicas,
            ownerName: rs.ownerName })),
          statefulsets: (allStatefulSets || []).slice(0, MAX_CACHED_PER_TYPE).map(ss => ({
            name: ss.name,
            namespace: ss.namespace,
            replicas: ss.replicas,
            readyReplicas: ss.readyReplicas,
            status: ss.status })),
          daemonsets: (allDaemonSets || []).slice(0, MAX_CACHED_PER_TYPE).map(ds => ({
            name: ds.name,
            namespace: ds.namespace,
            desiredScheduled: ds.desiredScheduled,
            ready: ds.ready,
            status: ds.status })),
          cronjobs: (allCronJobs || []).slice(0, MAX_CACHED_PER_TYPE).map(cj => ({
            name: cj.name,
            namespace: cj.namespace,
            schedule: cj.schedule,
            suspend: cj.suspend,
            active: cj.active,
            lastSchedule: cj.lastSchedule })),
          ingresses: (allIngresses || []).slice(0, MAX_CACHED_PER_TYPE).map(ing => ({
            name: ing.name,
            namespace: ing.namespace,
            class: ing.class,
            hosts: ing.hosts || [],
            address: ing.address })),
          networkpolicies: (allNetworkPolicies || []).slice(0, MAX_CACHED_PER_TYPE).map(np => ({
            name: np.name,
            namespace: np.namespace,
            policyTypes: np.policyTypes || [],
            podSelector: np.podSelector })),
          podIssues: (podIssues || []).slice(0, MAX_CACHED_PER_TYPE).map(p => ({
            name: p.name,
            namespace: p.namespace,
            status: p.status,
            reason: p.reason })) })
        return next
      })
      // Mark this cluster as no longer loading
      setLoadingClusters(prev => {
        const next = new Set(prev)
        next.delete(cluster)
        return next
      })
    }
  }, [selectedCluster, nodesLoading, namespacesLoading, allNodes, allNamespaces, allDeployments, allServices, allPVCs, allPods, allConfigMaps, allSecrets, allServiceAccounts, allJobs, allHPAs, allReplicaSets, allStatefulSets, allDaemonSets, allCronJobs, allIngresses, allNetworkPolicies, podIssues])

  // Evict cache entries for clusters that have transitioned to offline/
  // unhealthy. Without this, stale resources captured while the cluster
  // was reachable continue to render after the cluster goes down
  // (issue #6051 — stale data persists past offline transition).
  useEffect(() => {
    const offlineClusterNames: string[] = []
    for (const c of clusters) {
      if (!c.healthy) offlineClusterNames.push(c.name)
    }
    if (offlineClusterNames.length === 0) return
    // Cache eviction is a legitimate state synchronization: when a cluster
    // transitions to offline we must drop its stale entry so `getClusterData`
    // stops returning data that is no longer trustworthy. Matches the
    // pattern used by the cache-write effect above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClusterDataCache(prev => {
      let changed = false
      const next = new Map(prev)
      for (const name of offlineClusterNames) {
        if (next.has(name)) {
          next.delete(name)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [clusters])

  // Helper to get cached data for a cluster
  const getClusterData = (clusterName: string): ClusterDataCache | null => {
    return clusterDataCache.get(clusterName) || null
  }

  // Toggle node expansion
  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
        // If collapsing a cluster, remove it from loading set
        if (nodeId.startsWith('cluster:')) {
          const clusterName = nodeId.replace('cluster:', '')
          setLoadingClusters(prevLoading => {
            const nextLoading = new Set(prevLoading)
            nextLoading.delete(clusterName)
            return nextLoading
          })
        }
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  // Aggregate issue counts across all cached clusters for the top-level badge
  const totalIssueCounts = (() => {
    const counts = { nodes: 0, deployments: 0, pods: 0, pvcs: 0, total: 0 }
    for (const clusterData of clusterDataCache.values()) {
      counts.nodes += clusterData.nodes.filter(n => n.status !== 'Ready').length
      counts.deployments += clusterData.deployments.filter(d => d.readyReplicas < d.replicas).length
      counts.pods += clusterData.podIssues.length
      counts.pvcs += clusterData.pvcs.filter(p => p.status !== 'Bound').length
    }
    counts.total = counts.nodes + counts.deployments + counts.pods + counts.pvcs
    return counts
  })()

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
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
          {/* Cluster filter dropdown */}
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

      {/* Search and Lens Filters */}
      <div className="flex flex-col gap-2 mb-3 shrink-0">
        <CardSearchInput
          value={searchFilter}
          onChange={setSearchFilter}
          placeholder={t('common.searchResources')}
        />

        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all' as TreeLens, label: t('resourceTree.lensAll'), icon: Layers },
            { id: 'issues' as TreeLens, label: t('resourceTree.lensIssues'), icon: AlertTriangle, count: totalIssueCounts.total },
            { id: 'nodes' as TreeLens, label: t('resourceTree.lensNodes'), icon: Server },
            { id: 'workloads' as TreeLens, label: t('resourceTree.lensWorkloads'), icon: Box },
            { id: 'storage' as TreeLens, label: t('resourceTree.lensStorage'), icon: HardDrive },
            { id: 'network' as TreeLens, label: t('resourceTree.lensNetwork'), icon: Network },
          ].map(lens => (
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
              {lens.label}
              {lens.count !== undefined && lens.count > 0 && (
                <StatusBadge color="red" size="xs" rounded="full" className="ml-0.5">
                  {lens.count}
                </StatusBadge>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 bg-card/30 rounded-lg border border-border overflow-y-auto min-h-card-content">
        <div className="p-2">
          {/* Clusters Root */}
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
              // Get cached data for this cluster (may be null if not yet loaded)
              const clusterData = getClusterData(cluster.name)
              const hasData = clusterData !== null
              // Build namespace resources from cached data
              const namespaceResources = hasData ? buildNamespaceResources(clusterData, searchFilter) : new Map<string, NamespaceResources>()
              const visibleNs = hasData ? getVisibleNamespaces(namespaceResources, activeLens, searchFilter) : []
              const issueCounts = hasData ? getIssueCounts(clusterData) : { nodes: 0, deployments: 0, pods: 0, pvcs: 0, total: 0 }

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
                    if (expanding) {
                      // Always fetch data when expanding (to get fresh data)
                      setSelectedCluster(cluster.name)
                      if (!hasData) {
                        // Mark as loading only if no cached data
                        setLoadingClusters(prev => new Set(prev).add(cluster.name))
                      }
                    }
                  }}
                  indent={1}
                  expandedNodes={expandedNodes}
                  toggleNode={toggleNode}
                >
                  {/* Loading indicator when expanding but no data yet */}
                  {clusterExpanded && !hasData && loadingClusters.has(cluster.name) && (
                    <div className="flex items-center gap-2 px-2 py-1.5 ml-8 text-xs text-muted-foreground">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      {t('resourceTree.loadingResources')}
                    </div>
                  )}

                  {/* Empty-state hint when the Issues lens has no matching
                      resources in this cluster. Without this, the tree
                      collapses to a silent blank after switching from the
                      All lens (see issue: Resource tree disappears when
                      filtering by Issues after notification navigation). */}
                  {clusterExpanded && hasData && activeLens === 'issues' && visibleNs.length === 0 && issueCounts.nodes === 0 && (
                    <div className="flex items-center gap-2 px-2 py-1.5 ml-8 text-xs text-muted-foreground">
                      {t('resourceTree.noIssuesFound')}
                    </div>
                  )}

                  {/* Nodes section - use cached data. In the Issues lens
                      we only render this section when there is at least
                      one unhealthy node, otherwise switching to Issues
                      would still surface a full Ready-node list. */}
                  {(activeLens === 'all' || activeLens === 'nodes' || (activeLens === 'issues' && issueCounts.nodes > 0)) && clusterExpanded && hasData && clusterData.nodes.length > 0 && (
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

                  {/* Namespaces - use cached data, hide when nodes lens is active */}
                  {clusterExpanded && hasData && activeLens !== 'nodes' && visibleNs.length > 0 && (
                    <TreeNode
                      id={`${clusterId}:namespaces`}
                      label={t('resourceTree.namespaces')}
                      icon={Folder}
                      iconColor="text-purple-400"
                      count={visibleNs.length}
                      indent={2}
                      expandedNodes={expandedNodes}
                      toggleNode={toggleNode}
                    >
                      {visibleNs.slice(0, renderLimit).map(ns => {
                        const nsId = `${clusterId}:ns:${ns}`
                        const nsData = namespaceResources.get(ns)!
                        const nsPodIssues = nsData.pods.filter(p => p.status !== 'Running' && p.status !== 'Succeeded').length
                        const nsDeploymentIssues = nsData.deployments.filter(d => d.readyReplicas < d.replicas).length
                        const totalIssues = nsPodIssues + nsDeploymentIssues

                        // Apply lens filtering to namespace content
                        const showDeployments = (activeLens === 'all' || activeLens === 'workloads' || activeLens === 'issues') && nsData.deployments.length > 0
                        const showPods = (activeLens === 'all' || activeLens === 'workloads' || activeLens === 'issues') && nsData.pods.length > 0
                        const showServices = (activeLens === 'all' || activeLens === 'network') && nsData.services.length > 0
                        const showPVCs = (activeLens === 'all' || activeLens === 'storage' || activeLens === 'issues') && nsData.pvcs.length > 0
                        const showConfigMaps = (activeLens === 'all' || activeLens === 'workloads') && nsData.configmaps.length > 0
                        const showSecrets = (activeLens === 'all' || activeLens === 'workloads') && nsData.secrets.length > 0
                        const showServiceAccounts = (activeLens === 'all' || activeLens === 'workloads') && nsData.serviceaccounts.length > 0
                        const showJobs = (activeLens === 'all' || activeLens === 'workloads') && nsData.jobs.length > 0
                        const showHPAs = (activeLens === 'all' || activeLens === 'workloads') && nsData.hpas.length > 0
                        const showReplicaSets = (activeLens === 'all' || activeLens === 'workloads') && nsData.replicasets.length > 0
                        const showStatefulSets = (activeLens === 'all' || activeLens === 'workloads') && nsData.statefulsets.length > 0
                        const showDaemonSets = (activeLens === 'all' || activeLens === 'workloads') && nsData.daemonsets.length > 0
                        const showCronJobs = (activeLens === 'all' || activeLens === 'workloads') && nsData.cronjobs.length > 0
                        const showIngresses = (activeLens === 'all' || activeLens === 'network') && nsData.ingresses.length > 0
                        const showNetworkPolicies = (activeLens === 'all' || activeLens === 'network') && nsData.networkpolicies.length > 0

                        return (
                          <TreeNode
                            key={ns}
                            id={nsId}
                            label={ns}
                            icon={Folder}
                            iconColor="text-yellow-400"
                            badge={totalIssues > 0 ? totalIssues : undefined}
                            badgeColor="bg-red-500/20 text-red-400"
                            onClick={() => drillToNamespace(cluster.name, ns)}
                            indent={3}
                            expandedNodes={expandedNodes}
                            toggleNode={toggleNode}
                          >
                            {/* Deployments */}
                            {showDeployments && (
                              <TreeNode
                                id={`${nsId}:deployments`}
                                label={t('resourceTree.deployments')}
                                icon={ResourceIcon.deployment}
                                iconColor="text-green-400"
                                count={nsData.deployments.length}
                                badge={nsDeploymentIssues > 0 ? nsDeploymentIssues : undefined}
                                badgeColor="bg-yellow-500/20 text-yellow-400"
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.deployments.slice(0, renderLimit).map(dep => {
                                  const depId = `${nsId}:dep:${dep.name}`
                                  const depPods = getPodsForDeployment(namespaceResources, dep.name, ns)
                                  const isHealthy = dep.readyReplicas === dep.replicas

                                  return (
                                    <TreeNode
                                      key={dep.name}
                                      id={depId}
                                      label={dep.name}
                                      icon={ResourceIcon.deployment}
                                      iconColor={isHealthy ? 'text-green-400' : 'text-yellow-400'}
                                      badge={`${dep.readyReplicas}/${dep.replicas}`}
                                      badgeColor={isHealthy ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}
                                      onClick={() => drillToDeployment(cluster.name, ns, dep.name)}
                                      indent={5}
                                      expandedNodes={expandedNodes}
                                      toggleNode={toggleNode}
                                    >
                                      {/* Pods under deployment */}
                                      {depPods.length > 0 && depPods.slice(0, renderLimit).map(pod => (
                                        <TreeNode
                                          key={pod.name}
                                          id={`${depId}:pod:${pod.name}`}
                                          label={pod.name}
                                          icon={ResourceIcon.pod}
                                          iconColor={pod.status === 'Running' ? 'text-green-400' : 'text-red-400'}
                                          badge={pod.status}
                                          badgeColor={pod.status === 'Running' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}
                                          onClick={() => drillToPod(cluster.name, ns, pod.name, { status: pod.status, restarts: pod.restarts })}
                                          indent={6}
                                          expandedNodes={expandedNodes}
                                          toggleNode={toggleNode}
                                        />
                                      ))}
                                      {depPods.length > renderLimit && <TruncatedIndicator total={depPods.length} shown={renderLimit} indent={6} />}
                                    </TreeNode>
                                  )
                                })}
                                <TruncatedIndicator total={nsData.deployments.length} shown={renderLimit} indent={5} />
                              </TreeNode>
                            )}

                            {/* Standalone Pods section (shows all pods, not just those under deployments) */}
                            {showPods && (
                              <TreeNode
                                id={`${nsId}:pods`}
                                label={t('resourceTree.pods')}
                                icon={ResourceIcon.pod}
                                iconColor="text-cyan-400"
                                count={nsData.pods.length}
                                badge={nsPodIssues > 0 ? nsPodIssues : undefined}
                                badgeColor="bg-red-500/20 text-red-400"
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.pods.slice(0, renderLimit).map(pod => (
                                  <TreeNode
                                    key={pod.name}
                                    id={`${nsId}:pod:${pod.name}`}
                                    label={pod.name}
                                    icon={ResourceIcon.pod}
                                    iconColor={pod.status === 'Running' || pod.status === 'Succeeded' ? 'text-green-400' : 'text-red-400'}
                                    badge={pod.restarts > 0 ? `${pod.status} (${pod.restarts} restarts)` : pod.status}
                                    badgeColor={pod.status === 'Running' || pod.status === 'Succeeded' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}
                                    onClick={() => drillToPod(cluster.name, ns, pod.name, { status: pod.status, restarts: pod.restarts })}
                                    indent={5}
                                    expandedNodes={expandedNodes}
                                    toggleNode={toggleNode}
                                  />
                                ))}
                                <TruncatedIndicator total={nsData.pods.length} shown={renderLimit} indent={5} />
                              </TreeNode>
                            )}

                            {/* Services */}
                            {showServices && (
                              <TreeNode
                                id={`${nsId}:services`}
                                label={t('resourceTree.services')}
                                icon={ResourceIcon.service}
                                iconColor="text-blue-400"
                                count={nsData.services.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.services.slice(0, renderLimit).map(svc => (
                                  <TreeNode
                                    key={svc.name}
                                    id={`${nsId}:svc:${svc.name}`}
                                    label={svc.name}
                                    icon={ResourceIcon.service}
                                    iconColor="text-blue-400"
                                    badge={svc.type}
                                    badgeColor="bg-blue-500/20 text-blue-400"
                                    onClick={() => drillToService(cluster.name, ns, svc.name)}
                                    indent={5}
                                    expandedNodes={expandedNodes}
                                    toggleNode={toggleNode}
                                  />
                                ))}
                                <TruncatedIndicator total={nsData.services.length} shown={renderLimit} indent={5} />
                              </TreeNode>
                            )}

                            {/* PVCs */}
                            {showPVCs && (
                              <TreeNode
                                id={`${nsId}:pvcs`}
                                label={t('resourceTree.pvcs')}
                                icon={ResourceIcon.pvc}
                                iconColor="text-green-400"
                                count={nsData.pvcs.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.pvcs.slice(0, renderLimit).map(pvc => (
                                  <TreeNode
                                    key={pvc.name}
                                    id={`${nsId}:pvc:${pvc.name}`}
                                    label={pvc.name}
                                    icon={ResourceIcon.pvc}
                                    iconColor={pvc.status === 'Bound' ? 'text-green-400' : 'text-yellow-400'}
                                    badge={pvc.status}
                                    badgeColor={pvc.status === 'Bound' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}
                                    onClick={() => drillToPVC(cluster.name, ns, pvc.name)}
                                    indent={5}
                                    expandedNodes={expandedNodes}
                                    toggleNode={toggleNode}
                                  />
                                ))}
                                <TruncatedIndicator total={nsData.pvcs.length} shown={renderLimit} indent={5} />
                              </TreeNode>
                            )}

                            {/* ConfigMaps */}
                            {showConfigMaps && (
                              <TreeNode
                                id={`${nsId}:configmaps`}
                                label={t('resourceTree.configMaps')}
                                icon={ResourceIcon.configmap}
                                iconColor="text-orange-400"
                                count={nsData.configmaps.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.configmaps.slice(0, renderLimit).map(cm => (
                                  <TreeNode
                                    key={cm.name}
                                    id={`${nsId}:cm:${cm.name}`}
                                    label={cm.name}
                                    icon={ResourceIcon.configmap}
                                    iconColor="text-orange-400"
                                    badge={t('resourceTree.keysCount', { count: cm.dataCount })}
                                    badgeColor="bg-orange-500/20 text-orange-400"
                                    indent={5}
                                    expandedNodes={expandedNodes}
                                    toggleNode={toggleNode}
                                  />
                                ))}
                                <TruncatedIndicator total={nsData.configmaps.length} shown={renderLimit} indent={5} />
                              </TreeNode>
                            )}

                            {/* Secrets */}
                            {showSecrets && (
                              <TreeNode
                                id={`${nsId}:secrets`}
                                label={t('resourceTree.secrets')}
                                icon={ResourceIcon.secret}
                                iconColor="text-red-400"
                                count={nsData.secrets.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.secrets.slice(0, renderLimit).map(secret => (
                                  <TreeNode
                                    key={secret.name}
                                    id={`${nsId}:secret:${secret.name}`}
                                    label={secret.name}
                                    icon={ResourceIcon.secret}
                                    iconColor="text-red-400"
                                    badge={secret.type}
                                    badgeColor="bg-red-500/20 text-red-400"
                                    indent={5}
                                    expandedNodes={expandedNodes}
                                    toggleNode={toggleNode}
                                  />
                                ))}
                                <TruncatedIndicator total={nsData.secrets.length} shown={renderLimit} indent={5} />
                              </TreeNode>
                            )}

                            {/* ServiceAccounts */}
                            {showServiceAccounts && (
                              <TreeNode
                                id={`${nsId}:serviceaccounts`}
                                label={t('resourceTree.serviceAccounts')}
                                icon={ResourceIcon.serviceaccount}
                                iconColor="text-cyan-400"
                                count={nsData.serviceaccounts.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.serviceaccounts.slice(0, renderLimit).map(sa => (
                                  <TreeNode
                                    key={sa.name}
                                    id={`${nsId}:sa:${sa.name}`}
                                    label={sa.name}
                                    icon={ResourceIcon.serviceaccount}
                                    iconColor="text-cyan-400"
                                    indent={5}
                                    expandedNodes={expandedNodes}
                                    toggleNode={toggleNode}
                                  />
                                ))}
                                <TruncatedIndicator total={nsData.serviceaccounts.length} shown={renderLimit} indent={5} />
                              </TreeNode>
                            )}

                            {/* Jobs */}
                            {showJobs && (
                              <TreeNode
                                id={`${nsId}:jobs`}
                                label={t('resourceTree.jobs')}
                                icon={ResourceIcon.job}
                                iconColor="text-yellow-400"
                                count={nsData.jobs.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.jobs.slice(0, renderLimit).map(job => {
                                  const isComplete = job.status === 'Complete'
                                  const isRunning = job.status === 'Running'
                                  return (
                                    <TreeNode
                                      key={job.name}
                                      id={`${nsId}:job:${job.name}`}
                                      label={job.name}
                                      icon={ResourceIcon.job}
                                      iconColor={isComplete ? 'text-green-400' : isRunning ? 'text-green-400' : 'text-red-400'}
                                      badge={`${job.status} (${job.completions})`}
                                      badgeColor={isComplete ? 'bg-green-500/20 text-green-400' : isRunning ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}
                                      indent={5}
                                      expandedNodes={expandedNodes}
                                      toggleNode={toggleNode}
                                    />
                                  )
                                })}
                                <TruncatedIndicator total={nsData.jobs.length} shown={renderLimit} indent={5} />
                              </TreeNode>
                            )}

                            {/* HPAs */}
                            {showHPAs && (
                              <TreeNode
                                id={`${nsId}:hpas`}
                                label={t('resourceTree.hpas')}
                                icon={ResourceIcon.hpa}
                                iconColor="text-purple-400"
                                count={nsData.hpas.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.hpas.slice(0, renderLimit).map(hpa => (
                                  <TreeNode
                                    key={hpa.name}
                                    id={`${nsId}:hpa:${hpa.name}`}
                                    label={hpa.name}
                                    icon={ResourceIcon.hpa}
                                    iconColor="text-purple-400"
                                    badge={`${hpa.currentReplicas} (${hpa.minReplicas}-${hpa.maxReplicas})`}
                                    badgeColor="bg-purple-500/20 text-purple-400"
                                    indent={5}
                                    expandedNodes={expandedNodes}
                                    toggleNode={toggleNode}
                                  />
                                ))}
                                <TruncatedIndicator total={nsData.hpas.length} shown={renderLimit} indent={5} />
                              </TreeNode>
                            )}

                            {/* ReplicaSets */}
                            {showReplicaSets && (
                              <TreeNode
                                id={`${nsId}:replicasets`}
                                label={t('resourceTree.replicaSets')}
                                icon={ResourceIcon.replicaset}
                                iconColor="text-blue-400"
                                count={nsData.replicasets.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.replicasets.slice(0, renderLimit).map(rs => {
                                  const isHealthy = rs.readyReplicas === rs.replicas
                                  return (
                                    <TreeNode
                                      key={rs.name}
                                      id={`${nsId}:rs:${rs.name}`}
                                      label={rs.name}
                                      icon={ResourceIcon.replicaset}
                                      iconColor={isHealthy ? 'text-green-400' : 'text-yellow-400'}
                                      badge={`${rs.readyReplicas}/${rs.replicas}`}
                                      badgeColor={isHealthy ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}
                                      indent={5}
                                      expandedNodes={expandedNodes}
                                      toggleNode={toggleNode}
                                    />
                                  )
                                })}
                                <TruncatedIndicator total={nsData.replicasets.length} shown={renderLimit} indent={5} />
                              </TreeNode>
                            )}

                            {/* StatefulSets */}
                            {showStatefulSets && (
                              <TreeNode
                                id={`${nsId}:statefulsets`}
                                label={t('resourceTree.statefulSets')}
                                icon={ResourceIcon.statefulset}
                                iconColor="text-blue-400"
                                count={nsData.statefulsets.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.statefulsets.slice(0, renderLimit).map(ss => {
                                  const isHealthy = ss.readyReplicas === ss.replicas
                                  return (
                                    <TreeNode
                                      key={ss.name}
                                      id={`${nsId}:ss:${ss.name}`}
                                      label={ss.name}
                                      icon={ResourceIcon.statefulset}
                                      iconColor={isHealthy ? 'text-green-400' : 'text-yellow-400'}
                                      badge={`${ss.readyReplicas}/${ss.replicas}`}
                                      badgeColor={isHealthy ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}
                                      indent={5}
                                      expandedNodes={expandedNodes}
                                      toggleNode={toggleNode}
                                    />
                                  )
                                })}
                                <TruncatedIndicator total={nsData.statefulsets.length} shown={renderLimit} indent={5} />
                              </TreeNode>
                            )}

                            {/* DaemonSets */}
                            {showDaemonSets && (
                              <TreeNode
                                id={`${nsId}:daemonsets`}
                                label={t('resourceTree.daemonSets')}
                                icon={ResourceIcon.daemonset}
                                iconColor="text-cyan-400"
                                count={nsData.daemonsets.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.daemonsets.slice(0, renderLimit).map(ds => {
                                  const isHealthy = ds.ready === ds.desiredScheduled
                                  return (
                                    <TreeNode
                                      key={ds.name}
                                      id={`${nsId}:ds:${ds.name}`}
                                      label={ds.name}
                                      icon={ResourceIcon.daemonset}
                                      iconColor={isHealthy ? 'text-green-400' : 'text-yellow-400'}
                                      badge={`${ds.ready}/${ds.desiredScheduled}`}
                                      badgeColor={isHealthy ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}
                                      indent={5}
                                      expandedNodes={expandedNodes}
                                      toggleNode={toggleNode}
                                    />
                                  )
                                })}
                                <TruncatedIndicator total={nsData.daemonsets.length} shown={renderLimit} indent={5} />
                              </TreeNode>
                            )}

                            {/* CronJobs */}
                            {showCronJobs && (
                              <TreeNode
                                id={`${nsId}:cronjobs`}
                                label={t('resourceTree.cronJobs')}
                                icon={ResourceIcon.cronjob}
                                iconColor="text-yellow-400"
                                count={nsData.cronjobs.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.cronjobs.slice(0, renderLimit).map(cj => (
                                  <TreeNode
                                    key={cj.name}
                                    id={`${nsId}:cj:${cj.name}`}
                                    label={cj.name}
                                    icon={ResourceIcon.cronjob}
                                    iconColor={cj.suspend ? 'text-muted-foreground' : 'text-yellow-400'}
                                    badge={cj.suspend ? t('resourceTree.suspended') : cj.schedule}
                                    badgeColor={cj.suspend ? 'bg-gray-500/20 dark:bg-gray-400/20 text-muted-foreground' : 'bg-yellow-500/20 text-yellow-400'}
                                    indent={5}
                                    expandedNodes={expandedNodes}
                                    toggleNode={toggleNode}
                                  />
                                ))}
                                <TruncatedIndicator total={nsData.cronjobs.length} shown={renderLimit} indent={5} />
                              </TreeNode>
                            )}

                            {/* Ingresses */}
                            {showIngresses && (
                              <TreeNode
                                id={`${nsId}:ingresses`}
                                label={t('resourceTree.ingresses')}
                                icon={ResourceIcon.ingress}
                                iconColor="text-blue-400"
                                count={nsData.ingresses.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.ingresses.slice(0, renderLimit).map(ing => (
                                  <TreeNode
                                    key={ing.name}
                                    id={`${nsId}:ing:${ing.name}`}
                                    label={ing.name}
                                    icon={ResourceIcon.ingress}
                                    iconColor="text-blue-400"
                                    badge={ing.hosts.length > 0 ? ing.hosts.join(', ') : ing.class || t('resourceTree.noHost')}
                                    badgeColor="bg-blue-500/20 text-blue-400"
                                    indent={5}
                                    expandedNodes={expandedNodes}
                                    toggleNode={toggleNode}
                                  />
                                ))}
                                <TruncatedIndicator total={nsData.ingresses.length} shown={renderLimit} indent={5} />
                              </TreeNode>
                            )}

                            {/* NetworkPolicies */}
                            {showNetworkPolicies && (
                              <TreeNode
                                id={`${nsId}:networkpolicies`}
                                label={t('resourceTree.networkPolicies')}
                                icon={ResourceIcon.networkpolicy}
                                iconColor="text-red-400"
                                count={nsData.networkpolicies.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.networkpolicies.slice(0, renderLimit).map(np => (
                                  <TreeNode
                                    key={np.name}
                                    id={`${nsId}:np:${np.name}`}
                                    label={np.name}
                                    icon={ResourceIcon.networkpolicy}
                                    iconColor="text-red-400"
                                    badge={(np.policyTypes || []).join(', ') || t('resourceTree.noTypes')}
                                    badgeColor="bg-red-500/20 text-red-400"
                                    indent={5}
                                    expandedNodes={expandedNodes}
                                    toggleNode={toggleNode}
                                  />
                                ))}
                                <TruncatedIndicator total={nsData.networkpolicies.length} shown={renderLimit} indent={5} />
                              </TreeNode>
                            )}
                          </TreeNode>
                        )
                      })}
                      <TruncatedIndicator total={visibleNs.length} shown={renderLimit} indent={3} />
                    </TreeNode>
                  )}

                  {/* View cluster details link */}
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
