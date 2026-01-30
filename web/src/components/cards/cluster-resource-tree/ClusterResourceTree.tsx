import { useMemo, useState, useCallback, useEffect } from 'react'
import { Server, Box, Layers, Database, Network, HardDrive, Search, AlertTriangle, RefreshCw, Folder, Filter, ChevronDown } from 'lucide-react'
import { useClusters, useNodes, useNamespaces, useDeployments, useServices, usePVCs, usePods, useConfigMaps, useSecrets, useServiceAccounts, useJobs, useHPAs, useReplicaSets, useStatefulSets, useDaemonSets, useCronJobs, useIngresses, useNetworkPolicies } from '../../../hooks/useMCP'
import { useCachedPodIssues } from '../../../hooks/useCachedData'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { CardControls, SortDirection } from '../../ui/CardControls'
import { useChartFilters } from '../../../lib/cards'
import { TreeNode } from './TreeRenderer'
import { ResourceIcon, SORT_OPTIONS } from './types'
import { buildNamespaceResources, getVisibleNamespaces, getIssueCounts, getPodsForDeployment } from './TreeBuilder'
import type { ClusterResourceTreeProps, TreeLens, SortByOption, NamespaceResources, ClusterDataCache } from './types'

export function ClusterResourceTree({ config: _config }: ClusterResourceTreeProps) {
  const { deduplicatedClusters: clusters } = useClusters()
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

  // Local cluster filter via shared hook
  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
  } = useChartFilters({
    storageKey: 'cluster-resource-tree',
  })

  // Per-cluster data cache - persists data for all expanded clusters
  const [clusterDataCache, setClusterDataCache] = useState<Map<string, ClusterDataCache>>(new Map())

  // Get filtered clusters based on global filter + local cluster filter
  // Include all clusters (don't filter by reachability - show clusters with unknown status)
  const filteredClusters = useMemo(() => {
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
  }, [clusters, selectedClusters, isAllClustersSelected, localClusterFilter, searchFilter])

  // Fetch data for the selected cluster (only when a cluster is expanded)
  const { issues: podIssues } = useCachedPodIssues(selectedCluster || undefined)
  const { nodes: allNodes, isLoading: nodesLoading } = useNodes(selectedCluster || undefined)
  const { namespaces: allNamespaces, isLoading: namespacesLoading } = useNamespaces(selectedCluster || undefined)
  const { deployments: allDeployments } = useDeployments(selectedCluster || undefined)
  const { services: allServices } = useServices(selectedCluster || undefined)
  const { pvcs: allPVCs } = usePVCs(selectedCluster || undefined)
  const { pods: allPods } = usePods(selectedCluster || undefined, undefined, 'name', 500)
  const { configmaps: allConfigMaps } = useConfigMaps(selectedCluster || undefined)
  const { secrets: allSecrets } = useSecrets(selectedCluster || undefined)
  const { serviceAccounts: allServiceAccounts } = useServiceAccounts(selectedCluster || undefined)
  const { jobs: allJobs } = useJobs(selectedCluster || undefined)
  const { hpas: allHPAs } = useHPAs(selectedCluster || undefined)
  const { replicasets: allReplicaSets } = useReplicaSets(selectedCluster || undefined)
  const { statefulsets: allStatefulSets } = useStatefulSets(selectedCluster || undefined)
  const { daemonsets: allDaemonSets } = useDaemonSets(selectedCluster || undefined)
  const { cronjobs: allCronJobs } = useCronJobs(selectedCluster || undefined)
  const { ingresses: allIngresses } = useIngresses(selectedCluster || undefined)
  const { networkpolicies: allNetworkPolicies } = useNetworkPolicies(selectedCluster || undefined)

  // Cache data for the selected cluster when it changes
  useEffect(() => {
    if (!selectedCluster) return
    // Cache once at least one hook has finished loading and has meaningful data
    const anyHookFinished = !nodesLoading || !namespacesLoading
    if (!anyHookFinished) return
    const hasAnyData = (allNodes && allNodes.length > 0) ||
                       (allNamespaces && allNamespaces.length > 0) ||
                       (allDeployments && allDeployments.length > 0) ||
                       (allPods && allPods.length > 0)
    if (hasAnyData) {
      setClusterDataCache(prev => {
        const next = new Map(prev)
        next.set(selectedCluster, {
          nodes: allNodes.map(n => ({ name: n.name, status: n.status })),
          namespaces: [...(allNamespaces || [])],
          deployments: (allDeployments || []).map(d => ({
            name: d.name,
            namespace: d.namespace,
            replicas: d.replicas,
            readyReplicas: d.readyReplicas,
            status: d.status,
            image: d.image,
          })),
          services: (allServices || []).map(s => ({
            name: s.name,
            namespace: s.namespace,
            type: s.type,
          })),
          pvcs: (allPVCs || []).map(p => ({
            name: p.name,
            namespace: p.namespace,
            status: p.status,
            capacity: p.capacity,
          })),
          pods: (allPods || []).map(p => ({
            name: p.name,
            namespace: p.namespace,
            status: p.status,
            restarts: p.restarts,
          })),
          configmaps: (allConfigMaps || []).map(cm => ({
            name: cm.name,
            namespace: cm.namespace,
            dataCount: cm.dataCount || 0,
          })),
          secrets: (allSecrets || []).map(s => ({
            name: s.name,
            namespace: s.namespace,
            type: s.type || 'Opaque',
          })),
          serviceaccounts: (allServiceAccounts || []).map(sa => ({
            name: sa.name,
            namespace: sa.namespace,
          })),
          jobs: (allJobs || []).map(j => ({
            name: j.name,
            namespace: j.namespace,
            status: j.status,
            completions: j.completions,
            duration: j.duration,
          })),
          hpas: (allHPAs || []).map(h => ({
            name: h.name,
            namespace: h.namespace,
            reference: h.reference,
            minReplicas: h.minReplicas,
            maxReplicas: h.maxReplicas,
            currentReplicas: h.currentReplicas,
          })),
          replicasets: (allReplicaSets || []).map(rs => ({
            name: rs.name,
            namespace: rs.namespace,
            replicas: rs.replicas,
            readyReplicas: rs.readyReplicas,
            ownerName: rs.ownerName,
          })),
          statefulsets: (allStatefulSets || []).map(ss => ({
            name: ss.name,
            namespace: ss.namespace,
            replicas: ss.replicas,
            readyReplicas: ss.readyReplicas,
            status: ss.status,
          })),
          daemonsets: (allDaemonSets || []).map(ds => ({
            name: ds.name,
            namespace: ds.namespace,
            desiredScheduled: ds.desiredScheduled,
            ready: ds.ready,
            status: ds.status,
          })),
          cronjobs: (allCronJobs || []).map(cj => ({
            name: cj.name,
            namespace: cj.namespace,
            schedule: cj.schedule,
            suspend: cj.suspend,
            active: cj.active,
            lastSchedule: cj.lastSchedule,
          })),
          ingresses: (allIngresses || []).map(ing => ({
            name: ing.name,
            namespace: ing.namespace,
            class: ing.class,
            hosts: ing.hosts || [],
            address: ing.address,
          })),
          networkpolicies: (allNetworkPolicies || []).map(np => ({
            name: np.name,
            namespace: np.namespace,
            policyTypes: np.policyTypes || [],
            podSelector: np.podSelector,
          })),
          podIssues: (podIssues || []).map(p => ({
            name: p.name,
            namespace: p.namespace,
            status: p.status,
            reason: p.reason,
          })),
        })
        return next
      })
      // Mark this cluster as no longer loading
      setLoadingClusters(prev => {
        const next = new Set(prev)
        next.delete(selectedCluster)
        return next
      })
    }
  }, [selectedCluster, nodesLoading, namespacesLoading, allNodes, allNamespaces, allDeployments, allServices, allPVCs, allPods, allConfigMaps, allSecrets, allServiceAccounts, allJobs, allHPAs, allReplicaSets, allStatefulSets, allDaemonSets, allCronJobs, allIngresses, allNetworkPolicies, podIssues])

  // Helper to get cached data for a cluster
  const getClusterData = useCallback((clusterName: string): ClusterDataCache | null => {
    return clusterDataCache.get(clusterName) || null
  }, [clusterDataCache])

  // Toggle node expansion
  const toggleNode = useCallback((nodeId: string) => {
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
  }, [])

  // Aggregate issue counts across all cached clusters for the top-level badge
  const totalIssueCounts = useMemo(() => {
    const counts = { nodes: 0, deployments: 0, pods: 0, pvcs: 0, total: 0 }
    for (const clusterData of clusterDataCache.values()) {
      counts.nodes += clusterData.nodes.filter(n => n.status !== 'Ready').length
      counts.deployments += clusterData.deployments.filter(d => d.readyReplicas < d.replicas).length
      counts.pods += clusterData.podIssues.length
      counts.pvcs += clusterData.pvcs.filter(p => p.status !== 'Bound').length
    }
    counts.total = counts.nodes + counts.deployments + counts.pods + counts.pvcs
    return counts
  }, [clusterDataCache])

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {filteredClusters.length} clusters
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
          {availableClusters.length >= 1 && (
            <div ref={clusterFilterRef} className="relative">
              <button
                onClick={() => setShowClusterFilter(!showClusterFilter)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
                  localClusterFilter.length > 0
                    ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                    : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                }`}
                title="Filter by cluster"
              >
                <Filter className="w-3 h-3" />
                <ChevronDown className="w-3 h-3" />
              </button>

              {showClusterFilter && (
                <div className="absolute top-full right-0 mt-1 w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50">
                  <div className="p-1">
                    <button
                      onClick={clearClusterFilter}
                      className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                        localClusterFilter.length === 0 ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                      }`}
                    >
                      All clusters
                    </button>
                    {availableClusters.map(cluster => (
                      <button
                        key={cluster.name}
                        onClick={() => toggleClusterFilter(cluster.name)}
                        className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                          localClusterFilter.includes(cluster.name) ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                        }`}
                      >
                        {cluster.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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
      <div className="flex flex-col gap-2 mb-3 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search resources..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-secondary rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all' as TreeLens, label: 'All', icon: Layers },
            { id: 'issues' as TreeLens, label: 'Issues', icon: AlertTriangle, count: totalIssueCounts.total },
            { id: 'nodes' as TreeLens, label: 'Nodes', icon: Server },
            { id: 'workloads' as TreeLens, label: 'Workloads', icon: Box },
            { id: 'storage' as TreeLens, label: 'Storage', icon: HardDrive },
            { id: 'network' as TreeLens, label: 'Network', icon: Network },
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
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-400">
                  {lens.count}
                </span>
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
            label="Clusters"
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
                  badge={cluster.nodeCount ? `${cluster.nodeCount} nodes` : undefined}
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
                      Loading resources...
                    </div>
                  )}

                  {/* Nodes section - use cached data */}
                  {(activeLens === 'all' || activeLens === 'nodes' || activeLens === 'issues') && clusterExpanded && hasData && clusterData.nodes.length > 0 && (
                    <TreeNode
                      id={`${clusterId}:nodes`}
                      label="Nodes"
                      icon={Server}
                      iconColor="text-green-400"
                      count={clusterData.nodes.length}
                      badge={issueCounts.nodes > 0 ? issueCounts.nodes : undefined}
                      badgeColor="bg-red-500/20 text-red-400"
                      indent={2}
                      expandedNodes={expandedNodes}
                      toggleNode={toggleNode}
                    >
                      {clusterData.nodes.map(node => (
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
                    </TreeNode>
                  )}

                  {/* Namespaces - use cached data, hide when nodes lens is active */}
                  {clusterExpanded && hasData && activeLens !== 'nodes' && visibleNs.length > 0 && (
                    <TreeNode
                      id={`${clusterId}:namespaces`}
                      label="Namespaces"
                      icon={Folder}
                      iconColor="text-purple-400"
                      count={visibleNs.length}
                      indent={2}
                      expandedNodes={expandedNodes}
                      toggleNode={toggleNode}
                    >
                      {visibleNs.map(ns => {
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
                                label="Deployments"
                                icon={ResourceIcon.deployment}
                                iconColor="text-green-400"
                                count={nsData.deployments.length}
                                badge={nsDeploymentIssues > 0 ? nsDeploymentIssues : undefined}
                                badgeColor="bg-yellow-500/20 text-yellow-400"
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.deployments.map(dep => {
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
                                      {depPods.length > 0 && depPods.map(pod => (
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
                                    </TreeNode>
                                  )
                                })}
                              </TreeNode>
                            )}

                            {/* Standalone Pods section (shows all pods, not just those under deployments) */}
                            {showPods && (
                              <TreeNode
                                id={`${nsId}:pods`}
                                label="Pods"
                                icon={ResourceIcon.pod}
                                iconColor="text-teal-400"
                                count={nsData.pods.length}
                                badge={nsPodIssues > 0 ? nsPodIssues : undefined}
                                badgeColor="bg-red-500/20 text-red-400"
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.pods.map(pod => (
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
                              </TreeNode>
                            )}

                            {/* Services */}
                            {showServices && (
                              <TreeNode
                                id={`${nsId}:services`}
                                label="Services"
                                icon={ResourceIcon.service}
                                iconColor="text-blue-400"
                                count={nsData.services.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.services.map(svc => (
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
                              </TreeNode>
                            )}

                            {/* PVCs */}
                            {showPVCs && (
                              <TreeNode
                                id={`${nsId}:pvcs`}
                                label="PVCs"
                                icon={ResourceIcon.pvc}
                                iconColor="text-emerald-400"
                                count={nsData.pvcs.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.pvcs.map(pvc => (
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
                              </TreeNode>
                            )}

                            {/* ConfigMaps */}
                            {showConfigMaps && (
                              <TreeNode
                                id={`${nsId}:configmaps`}
                                label="ConfigMaps"
                                icon={ResourceIcon.configmap}
                                iconColor="text-orange-400"
                                count={nsData.configmaps.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.configmaps.map(cm => (
                                  <TreeNode
                                    key={cm.name}
                                    id={`${nsId}:cm:${cm.name}`}
                                    label={cm.name}
                                    icon={ResourceIcon.configmap}
                                    iconColor="text-orange-400"
                                    badge={`${cm.dataCount} keys`}
                                    badgeColor="bg-orange-500/20 text-orange-400"
                                    indent={5}
                                    expandedNodes={expandedNodes}
                                    toggleNode={toggleNode}
                                  />
                                ))}
                              </TreeNode>
                            )}

                            {/* Secrets */}
                            {showSecrets && (
                              <TreeNode
                                id={`${nsId}:secrets`}
                                label="Secrets"
                                icon={ResourceIcon.secret}
                                iconColor="text-red-400"
                                count={nsData.secrets.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.secrets.map(secret => (
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
                              </TreeNode>
                            )}

                            {/* ServiceAccounts */}
                            {showServiceAccounts && (
                              <TreeNode
                                id={`${nsId}:serviceaccounts`}
                                label="ServiceAccounts"
                                icon={ResourceIcon.serviceaccount}
                                iconColor="text-cyan-400"
                                count={nsData.serviceaccounts.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.serviceaccounts.map(sa => (
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
                              </TreeNode>
                            )}

                            {/* Jobs */}
                            {showJobs && (
                              <TreeNode
                                id={`${nsId}:jobs`}
                                label="Jobs"
                                icon={ResourceIcon.job}
                                iconColor="text-amber-400"
                                count={nsData.jobs.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.jobs.map(job => {
                                  const isComplete = job.status === 'Complete'
                                  const isRunning = job.status === 'Running'
                                  return (
                                    <TreeNode
                                      key={job.name}
                                      id={`${nsId}:job:${job.name}`}
                                      label={job.name}
                                      icon={ResourceIcon.job}
                                      iconColor={isComplete ? 'text-green-400' : isRunning ? 'text-amber-400' : 'text-red-400'}
                                      badge={`${job.status} (${job.completions})`}
                                      badgeColor={isComplete ? 'bg-green-500/20 text-green-400' : isRunning ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}
                                      indent={5}
                                      expandedNodes={expandedNodes}
                                      toggleNode={toggleNode}
                                    />
                                  )
                                })}
                              </TreeNode>
                            )}

                            {/* HPAs */}
                            {showHPAs && (
                              <TreeNode
                                id={`${nsId}:hpas`}
                                label="HPAs"
                                icon={ResourceIcon.hpa}
                                iconColor="text-violet-400"
                                count={nsData.hpas.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.hpas.map(hpa => (
                                  <TreeNode
                                    key={hpa.name}
                                    id={`${nsId}:hpa:${hpa.name}`}
                                    label={hpa.name}
                                    icon={ResourceIcon.hpa}
                                    iconColor="text-violet-400"
                                    badge={`${hpa.currentReplicas} (${hpa.minReplicas}-${hpa.maxReplicas})`}
                                    badgeColor="bg-violet-500/20 text-violet-400"
                                    indent={5}
                                    expandedNodes={expandedNodes}
                                    toggleNode={toggleNode}
                                  />
                                ))}
                              </TreeNode>
                            )}

                            {/* ReplicaSets */}
                            {showReplicaSets && (
                              <TreeNode
                                id={`${nsId}:replicasets`}
                                label="ReplicaSets"
                                icon={ResourceIcon.replicaset}
                                iconColor="text-indigo-400"
                                count={nsData.replicasets.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.replicasets.map(rs => {
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
                              </TreeNode>
                            )}

                            {/* StatefulSets */}
                            {showStatefulSets && (
                              <TreeNode
                                id={`${nsId}:statefulsets`}
                                label="StatefulSets"
                                icon={ResourceIcon.statefulset}
                                iconColor="text-blue-400"
                                count={nsData.statefulsets.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.statefulsets.map(ss => {
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
                              </TreeNode>
                            )}

                            {/* DaemonSets */}
                            {showDaemonSets && (
                              <TreeNode
                                id={`${nsId}:daemonsets`}
                                label="DaemonSets"
                                icon={ResourceIcon.daemonset}
                                iconColor="text-teal-400"
                                count={nsData.daemonsets.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.daemonsets.map(ds => {
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
                              </TreeNode>
                            )}

                            {/* CronJobs */}
                            {showCronJobs && (
                              <TreeNode
                                id={`${nsId}:cronjobs`}
                                label="CronJobs"
                                icon={ResourceIcon.cronjob}
                                iconColor="text-amber-400"
                                count={nsData.cronjobs.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.cronjobs.map(cj => (
                                  <TreeNode
                                    key={cj.name}
                                    id={`${nsId}:cj:${cj.name}`}
                                    label={cj.name}
                                    icon={ResourceIcon.cronjob}
                                    iconColor={cj.suspend ? 'text-gray-400' : 'text-amber-400'}
                                    badge={cj.suspend ? 'Suspended' : cj.schedule}
                                    badgeColor={cj.suspend ? 'bg-gray-500/20 text-gray-400' : 'bg-amber-500/20 text-amber-400'}
                                    indent={5}
                                    expandedNodes={expandedNodes}
                                    toggleNode={toggleNode}
                                  />
                                ))}
                              </TreeNode>
                            )}

                            {/* Ingresses */}
                            {showIngresses && (
                              <TreeNode
                                id={`${nsId}:ingresses`}
                                label="Ingresses"
                                icon={ResourceIcon.ingress}
                                iconColor="text-sky-400"
                                count={nsData.ingresses.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.ingresses.map(ing => (
                                  <TreeNode
                                    key={ing.name}
                                    id={`${nsId}:ing:${ing.name}`}
                                    label={ing.name}
                                    icon={ResourceIcon.ingress}
                                    iconColor="text-sky-400"
                                    badge={ing.hosts.length > 0 ? ing.hosts.join(', ') : ing.class || 'No host'}
                                    badgeColor="bg-sky-500/20 text-sky-400"
                                    indent={5}
                                    expandedNodes={expandedNodes}
                                    toggleNode={toggleNode}
                                  />
                                ))}
                              </TreeNode>
                            )}

                            {/* NetworkPolicies */}
                            {showNetworkPolicies && (
                              <TreeNode
                                id={`${nsId}:networkpolicies`}
                                label="NetworkPolicies"
                                icon={ResourceIcon.networkpolicy}
                                iconColor="text-rose-400"
                                count={nsData.networkpolicies.length}
                                indent={4}
                                expandedNodes={expandedNodes}
                                toggleNode={toggleNode}
                              >
                                {nsData.networkpolicies.map(np => (
                                  <TreeNode
                                    key={np.name}
                                    id={`${nsId}:np:${np.name}`}
                                    label={np.name}
                                    icon={ResourceIcon.networkpolicy}
                                    iconColor="text-rose-400"
                                    badge={np.policyTypes.join(', ') || 'No types'}
                                    badgeColor="bg-rose-500/20 text-rose-400"
                                    indent={5}
                                    expandedNodes={expandedNodes}
                                    toggleNode={toggleNode}
                                  />
                                ))}
                              </TreeNode>
                            )}
                          </TreeNode>
                        )
                      })}
                    </TreeNode>
                  )}

                  {/* View cluster details link */}
                  {clusterExpanded && (
                    <button
                      onClick={() => drillToCluster(cluster.name)}
                      className="flex items-center gap-2 px-2 py-1.5 ml-8 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded transition-colors"
                    >
                      View cluster details →
                    </button>
                  )}
                </TreeNode>
              )
            })}
          </TreeNode>

          {filteredClusters.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8">
              No clusters match the current filter
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
