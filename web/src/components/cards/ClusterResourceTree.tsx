import { useMemo, useState, useCallback, useEffect } from 'react'
import { ChevronRight, ChevronDown, Server, Box, Layers, Database, Network, HardDrive, Search, AlertTriangle, RefreshCw, Folder, FileKey, FileText, Gauge, User, Clock, Container } from 'lucide-react'
import { useClusters, usePodIssues, useNodes, useNamespaces, useDeployments, useServices, usePVCs, usePods, useConfigMaps, useSecrets, useServiceAccounts, useJobs, useHPAs } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { StatusIndicator } from '../charts/StatusIndicator'
import { RefreshButton } from '../ui/RefreshIndicator'

// Resource tree lens/view options
type TreeLens = 'all' | 'issues' | 'nodes' | 'workloads' | 'storage' | 'network'

interface ClusterResourceTreeProps {
  config?: Record<string, unknown>
}

// Resource type icons mapping
const ResourceIcon = {
  cluster: Server,
  namespace: Folder,
  deployment: Box,
  statefulset: Database,
  daemonset: Layers,
  job: Clock,
  cronjob: Clock,
  pod: Container,
  service: Network,
  configmap: FileText,
  secret: FileKey,
  pvc: HardDrive,
  serviceaccount: User,
  hpa: Gauge,
} as const

// Namespace resource structure
interface NamespaceResources {
  deployments: Array<{ name: string; namespace: string; replicas: number; readyReplicas: number; status?: string }>
  services: Array<{ name: string; namespace: string; type: string }>
  pvcs: Array<{ name: string; namespace: string; status: string; capacity?: string }>
  pods: Array<{ name: string; namespace: string; status: string; restarts: number }>
  configmaps: Array<{ name: string; namespace: string; dataCount: number }>
  secrets: Array<{ name: string; namespace: string; type: string }>
  serviceaccounts: Array<{ name: string; namespace: string }>
  jobs: Array<{ name: string; namespace: string; status: string; completions: string; duration?: string }>
  hpas: Array<{ name: string; namespace: string; reference: string; minReplicas: number; maxReplicas: number; currentReplicas: number }>
}

// Cache structure for per-cluster data
interface ClusterDataCache {
  nodes: Array<{ name: string; status: string }>
  namespaces: string[]
  deployments: Array<{ name: string; namespace: string; replicas: number; readyReplicas: number; status?: string; image?: string }>
  services: Array<{ name: string; namespace: string; type: string }>
  pvcs: Array<{ name: string; namespace: string; status: string; capacity?: string }>
  pods: Array<{ name: string; namespace: string; status: string; restarts: number }>
  configmaps: Array<{ name: string; namespace: string; dataCount: number }>
  secrets: Array<{ name: string; namespace: string; type: string }>
  serviceaccounts: Array<{ name: string; namespace: string }>
  jobs: Array<{ name: string; namespace: string; status: string; completions: string; duration?: string }>
  hpas: Array<{ name: string; namespace: string; reference: string; minReplicas: number; maxReplicas: number; currentReplicas: number }>
  podIssues: Array<{ name: string; namespace: string; status: string; reason?: string }>
}

export function ClusterResourceTree({ config: _config }: ClusterResourceTreeProps) {
  const { clusters, isRefreshing, refetch: refetchClusters, isFailed, consecutiveFailures, lastRefresh } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { drillToNamespace, drillToPod, drillToCluster, drillToDeployment, drillToService, drillToPVC } = useDrillDownActions()

  // Tree view state - start with clusters expanded
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['clusters']))
  const [searchFilter, setSearchFilter] = useState('')
  const [activeLens, setActiveLens] = useState<TreeLens>('all')
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  // Track which clusters are currently loading data
  const [loadingClusters, setLoadingClusters] = useState<Set<string>>(new Set())

  // Per-cluster data cache - persists data for all expanded clusters
  const [clusterDataCache, setClusterDataCache] = useState<Map<string, ClusterDataCache>>(new Map())

  // Get filtered clusters based on global filter
  const filteredClusters = useMemo(() => {
    let result = clusters.filter(c => c.reachable !== false)
    if (!isAllClustersSelected) {
      result = result.filter(c => selectedClusters.includes(c.name))
    }
    if (searchFilter) {
      const query = searchFilter.toLowerCase()
      result = result.filter(c => c.name.toLowerCase().includes(query))
    }
    return result
  }, [clusters, selectedClusters, isAllClustersSelected, searchFilter])

  // Fetch data for the selected cluster (only when a cluster is expanded)
  const { issues: podIssues } = usePodIssues(selectedCluster || undefined)
  const { nodes: allNodes } = useNodes(selectedCluster || undefined)
  const { namespaces: allNamespaces } = useNamespaces(selectedCluster || undefined)
  const { deployments: allDeployments } = useDeployments(selectedCluster || undefined)
  const { services: allServices } = useServices(selectedCluster || undefined)
  const { pvcs: allPVCs } = usePVCs(selectedCluster || undefined)
  const { pods: allPods } = usePods(selectedCluster || undefined, undefined, 'name', 500)
  const { configmaps: allConfigMaps } = useConfigMaps(selectedCluster || undefined)
  const { secrets: allSecrets } = useSecrets(selectedCluster || undefined)
  const { serviceAccounts: allServiceAccounts } = useServiceAccounts(selectedCluster || undefined)
  const { jobs: allJobs } = useJobs(selectedCluster || undefined)
  const { hpas: allHPAs } = useHPAs(selectedCluster || undefined)

  // Cache data for the selected cluster when it changes
  useEffect(() => {
    if (!selectedCluster) return
    // Only cache if we have data (allow for empty namespaces but require nodes)
    if (allNodes && allNodes.length > 0) {
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
  }, [selectedCluster, allNodes, allNamespaces, allDeployments, allServices, allPVCs, allPods, allConfigMaps, allSecrets, allServiceAccounts, allJobs, allHPAs, podIssues])

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

  // Handle refresh - just call refetchClusters, the hook manages isRefreshing
  const handleRefresh = useCallback(() => {
    refetchClusters()
  }, [refetchClusters])

  // Build namespace resources from cached data for a specific cluster
  const buildNamespaceResources = useCallback((clusterData: ClusterDataCache): Map<string, NamespaceResources> => {
    const map = new Map<string, NamespaceResources>()

    // Filter namespaces based on search
    let namespaces = clusterData.namespaces || []
    if (searchFilter) {
      const query = searchFilter.toLowerCase()
      namespaces = namespaces.filter((ns: string) => ns.toLowerCase().includes(query))
    }

    // Initialize all namespaces
    namespaces.forEach((ns: string) => {
      map.set(ns, {
        deployments: [],
        services: [],
        pvcs: [],
        pods: [],
        configmaps: [],
        secrets: [],
        serviceaccounts: [],
        jobs: [],
        hpas: [],
      })
    })

    // Group deployments
    for (const d of clusterData.deployments) {
      const nsData = map.get(d.namespace)
      if (nsData) {
        nsData.deployments.push(d)
      }
    }

    // Group services
    for (const s of clusterData.services) {
      const nsData = map.get(s.namespace)
      if (nsData) {
        nsData.services.push(s)
      }
    }

    // Group PVCs
    for (const p of clusterData.pvcs) {
      const nsData = map.get(p.namespace)
      if (nsData) {
        nsData.pvcs.push(p)
      }
    }

    // Group pods
    for (const p of clusterData.pods) {
      const nsData = map.get(p.namespace)
      if (nsData) {
        nsData.pods.push({
          name: p.name,
          namespace: p.namespace,
          status: p.status,
          restarts: p.restarts,
        })
      }
    }

    // Group ConfigMaps
    for (const cm of clusterData.configmaps) {
      const nsData = map.get(cm.namespace)
      if (nsData) {
        nsData.configmaps.push({
          name: cm.name,
          namespace: cm.namespace,
          dataCount: cm.dataCount || 0,
        })
      }
    }

    // Group Secrets
    for (const s of clusterData.secrets) {
      const nsData = map.get(s.namespace)
      if (nsData) {
        nsData.secrets.push({
          name: s.name,
          namespace: s.namespace,
          type: s.type || 'Opaque',
        })
      }
    }

    // Group ServiceAccounts
    for (const sa of clusterData.serviceaccounts) {
      const nsData = map.get(sa.namespace)
      if (nsData) {
        nsData.serviceaccounts.push({
          name: sa.name,
          namespace: sa.namespace,
        })
      }
    }

    // Group Jobs
    for (const j of clusterData.jobs) {
      const nsData = map.get(j.namespace)
      if (nsData) {
        nsData.jobs.push({
          name: j.name,
          namespace: j.namespace,
          status: j.status,
          completions: j.completions,
          duration: j.duration,
        })
      }
    }

    // Group HPAs
    for (const h of clusterData.hpas) {
      const nsData = map.get(h.namespace)
      if (nsData) {
        nsData.hpas.push({
          name: h.name,
          namespace: h.namespace,
          reference: h.reference,
          minReplicas: h.minReplicas,
          maxReplicas: h.maxReplicas,
          currentReplicas: h.currentReplicas,
        })
      }
    }

    return map
  }, [searchFilter])

  // Filter namespaces to show based on content (for a specific cluster's data)
  const getVisibleNamespaces = useCallback((namespaceResources: Map<string, NamespaceResources>): string[] => {
    const namespaces = Array.from(namespaceResources.keys())

    // Always filter out system namespaces unless searching
    let filtered = searchFilter
      ? namespaces
      : namespaces.filter(ns => !ns.startsWith('kube-') && ns !== 'openshift' && !ns.startsWith('openshift-'))

    // Apply lens filter
    if (activeLens === 'issues') {
      filtered = filtered.filter(ns => {
        const resources = namespaceResources.get(ns)!
        return resources.pods.some(p => p.status !== 'Running' && p.status !== 'Succeeded') ||
               resources.deployments.some(d => d.readyReplicas < d.replicas) ||
               resources.pvcs.some(p => p.status !== 'Bound')
      })
    } else if (activeLens === 'workloads') {
      filtered = filtered.filter(ns => {
        const resources = namespaceResources.get(ns)!
        return resources.deployments.length > 0 || resources.pods.length > 0
      })
    } else if (activeLens === 'storage') {
      filtered = filtered.filter(ns => {
        const resources = namespaceResources.get(ns)!
        return resources.pvcs.length > 0
      })
    } else if (activeLens === 'network') {
      filtered = filtered.filter(ns => {
        const resources = namespaceResources.get(ns)!
        return resources.services.length > 0
      })
    }

    return filtered.sort()
  }, [activeLens, searchFilter])

  // Count issues for badge (for a specific cluster's data)
  const getIssueCounts = useCallback((clusterData: ClusterDataCache) => {
    const counts = {
      nodes: clusterData.nodes.filter(n => n.status !== 'Ready').length,
      deployments: clusterData.deployments.filter(d => d.readyReplicas < d.replicas).length,
      pods: clusterData.podIssues.length,
      pvcs: clusterData.pvcs.filter(p => p.status !== 'Bound').length,
      total: 0,
    }
    counts.total = counts.nodes + counts.deployments + counts.pods + counts.pvcs
    return counts
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

  // Get pods for a specific deployment (by name prefix matching)
  const getPodsForDeployment = useCallback((namespaceResources: Map<string, NamespaceResources>, deploymentName: string, namespace: string) => {
    const nsData = namespaceResources.get(namespace)
    if (!nsData) return []
    // Match pods whose names start with deployment name followed by a dash and hash
    // This is the standard naming pattern for pods created by ReplicaSets
    return nsData.pods.filter(p => p.name.startsWith(`${deploymentName}-`))
  }, [])

  // TreeNode component for recursive rendering
  const TreeNode = ({
    id,
    label,
    icon: Icon,
    iconColor,
    count,
    children,
    onClick,
    onToggle,
    badge,
    badgeColor = 'bg-secondary text-muted-foreground',
    statusIndicator,
    indent = 0,
  }: {
    id: string
    label: string
    icon: typeof Server
    iconColor: string
    count?: number
    children?: React.ReactNode
    onClick?: () => void
    onToggle?: (expanding: boolean) => void
    badge?: string | number
    badgeColor?: string
    statusIndicator?: 'healthy' | 'error' | 'warning'
    indent?: number
  }) => {
    const isExpanded = expandedNodes.has(id)
    const hasChildren = !!children

    return (
      <div className="select-none">
        <div
          className={`flex items-center gap-1.5 py-1.5 px-2 rounded-md hover:bg-secondary/50 transition-colors group`}
          style={{ paddingLeft: `${indent * 16 + 8}px` }}
        >
          {/* Chevron + Icon - handles expand/collapse */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                const willExpand = !isExpanded
                toggleNode(id)
                onToggle?.(willExpand)
              }}
              className="flex items-center gap-1 p-1 -m-0.5 rounded hover:bg-secondary flex-shrink-0"
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
              <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
            </button>
          ) : (
            <div className="flex items-center gap-1 p-1 -m-0.5">
              <span className="w-3.5" />
              <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
            </div>
          )}
          {/* Label - clickable for navigation/drilldown only */}
          <span
            onClick={(e) => {
              e.stopPropagation()
              onClick?.()
            }}
            className={`text-sm text-foreground truncate ${onClick ? 'cursor-pointer hover:text-purple-400' : ''}`}
          >
            {label}
          </span>
          {statusIndicator && <StatusIndicator status={statusIndicator} size="sm" />}
          {count !== undefined && (
            <span className="text-xs text-muted-foreground ml-1">({count})</span>
          )}
          {badge !== undefined && (
            <span className={`px-1.5 py-0.5 text-[10px] rounded-full ml-auto ${badgeColor}`}>
              {badge}
            </span>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="border-l border-border/50 ml-3" style={{ marginLeft: `${indent * 16 + 16}px` }}>
            {children}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-foreground">Resource Tree</span>
          {selectedCluster && (
            <span className="text-xs text-muted-foreground">• {selectedCluster}</span>
          )}
        </div>
        <RefreshButton
          isRefreshing={isRefreshing}
          isFailed={isFailed}
          consecutiveFailures={consecutiveFailures}
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          size="sm"
        />
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
          >
            {filteredClusters.map(cluster => {
              const clusterId = `cluster:${cluster.name}`
              const clusterExpanded = expandedNodes.has(clusterId)
              // Get cached data for this cluster (may be null if not yet loaded)
              const clusterData = getClusterData(cluster.name)
              const hasData = clusterData !== null
              // Build namespace resources from cached data
              const namespaceResources = hasData ? buildNamespaceResources(clusterData) : new Map<string, NamespaceResources>()
              const visibleNamespaces = hasData ? getVisibleNamespaces(namespaceResources) : []
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
                        />
                      ))}
                    </TreeNode>
                  )}

                  {/* Namespaces - use cached data, hide when nodes lens is active */}
                  {clusterExpanded && hasData && activeLens !== 'nodes' && visibleNamespaces.length > 0 && (
                    <TreeNode
                      id={`${clusterId}:namespaces`}
                      label="Namespaces"
                      icon={Folder}
                      iconColor="text-purple-400"
                      count={visibleNamespaces.length}
                      indent={2}
                    >
                      {visibleNamespaces.map(ns => {
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
                              >
                                {nsData.serviceaccounts.map(sa => (
                                  <TreeNode
                                    key={sa.name}
                                    id={`${nsId}:sa:${sa.name}`}
                                    label={sa.name}
                                    icon={ResourceIcon.serviceaccount}
                                    iconColor="text-cyan-400"
                                    indent={5}
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
