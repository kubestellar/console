import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, ChevronDown, Server, Box, Layers, Database, Network, HardDrive, Search, AlertTriangle, XCircle } from 'lucide-react'
import { useClusterHealth, usePodIssues, useDeploymentIssues, useGPUNodes, useNodes, useNamespaces, useDeployments, useServices, usePVCs, useEvents } from '../../../hooks/useMCP'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { Gauge } from '../../charts/Gauge'
import { useTranslation } from 'react-i18next'

// Resource tree lens/view options
type TreeLens = 'all' | 'issues' | 'nodes' | 'workloads' | 'storage' | 'network'

interface Props {
  data: Record<string, unknown>
}

export function ClusterDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const clusterName = (data.cluster as string) || ''
  const { drillToNamespace, drillToPod, drillToGPUNode, drillToEvents } = useDrillDownActions()

  // Tree view state
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['cluster', 'nodes', 'namespaces']))
  const [searchFilter, setSearchFilter] = useState('')
  const [activeLens, setActiveLens] = useState<TreeLens>('all')
  const [showResourceTree, setShowResourceTree] = useState(false)

  // Safeguard timeout to prevent infinite loading - show content after 5 seconds max
  const [loadingTimedOut, setLoadingTimedOut] = useState(false)
  useEffect(() => {
    setLoadingTimedOut(false) // Reset on cluster change
    const timer = setTimeout(() => setLoadingTimedOut(true), 5000)
    return () => clearTimeout(timer)
  }, [clusterName])

  const { health, isLoading: healthLoading } = useClusterHealth(clusterName)
  // Only show loading spinner if health is loading AND we haven't timed out
  const isLoading = healthLoading && !loadingTimedOut
  const { issues: podIssues } = usePodIssues(clusterName)
  const { issues: deploymentIssues } = useDeploymentIssues()
  const { nodes: allGPUNodes } = useGPUNodes()
  const { nodes: allNodes } = useNodes(clusterName)
  const { namespaces: allNamespaces } = useNamespaces(clusterName)
  const { deployments: allDeployments } = useDeployments(clusterName)
  const { services: allServices } = useServices(clusterName)
  const { pvcs: allPVCs } = usePVCs(clusterName)
  const { events: clusterEvents, isLoading: eventsLoading } = useEvents(clusterName, undefined, 10)

  // Toggle section expansion
  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  // Filter data for this cluster - ALL useMemo hooks must be before any early returns
  const clusterGPUNodes = useMemo(() =>
    allGPUNodes.filter(n => n.cluster === clusterName || n.cluster.includes(clusterName.split('/')[0])),
    [allGPUNodes, clusterName]
  )

  const clusterDeploymentIssues = useMemo(() =>
    deploymentIssues.filter(d => d.cluster === clusterName || d.cluster?.includes(clusterName.split('/')[0])),
    [deploymentIssues, clusterName]
  )

  // Get unique namespaces from issues
  const namespaces = useMemo(() => {
    const ns = new Set<string>()
    podIssues.forEach(p => ns.add(p.namespace))
    clusterDeploymentIssues.forEach(d => ns.add(d.namespace))
    return Array.from(ns).sort()
  }, [podIssues, clusterDeploymentIssues])

  // Group GPUs by type
  const gpuByType = useMemo(() => {
    const map: Record<string, { total: number; allocated: number; nodes: number }> = {}
    clusterGPUNodes.forEach(node => {
      const type = node.gpuType || 'Unknown'
      if (!map[type]) {
        map[type] = { total: 0, allocated: 0, nodes: 0 }
      }
      map[type].total += node.gpuCount
      map[type].allocated += node.gpuAllocated
      map[type].nodes += 1
    })
    return map
  }, [clusterGPUNodes])

  // Filter resources based on search and lens
  const filteredNodes = useMemo(() => {
    let nodes = allNodes || []
    if (searchFilter) {
      nodes = nodes.filter(n => n.name.toLowerCase().includes(searchFilter.toLowerCase()))
    }
    if (activeLens === 'issues') {
      nodes = nodes.filter(n => n.status !== 'Ready')
    }
    if (activeLens === 'nodes' || activeLens === 'all') {
      return nodes
    }
    return activeLens === 'issues' ? nodes : []
  }, [allNodes, searchFilter, activeLens])

  const filteredNamespaces = useMemo(() => {
    let ns = allNamespaces || []
    if (searchFilter) {
      ns = ns.filter(n => n.toLowerCase().includes(searchFilter.toLowerCase()))
    }
    // Filter out system namespaces unless explicitly searching
    // But keep them if that's all we have
    if (!searchFilter) {
      const nonSystemNs = ns.filter(n => !n.startsWith('kube-') && n !== 'default')
      // Only filter if we have non-system namespaces, otherwise show all
      if (nonSystemNs.length > 0) {
        ns = nonSystemNs
      }
    }
    return ns
  }, [allNamespaces, searchFilter])

  const filteredDeployments = useMemo(() => {
    let deps = allDeployments || []
    if (searchFilter) {
      deps = deps.filter(d => d.name.toLowerCase().includes(searchFilter.toLowerCase()) || d.namespace.toLowerCase().includes(searchFilter.toLowerCase()))
    }
    if (activeLens === 'issues') {
      deps = deps.filter(d => d.readyReplicas < d.replicas || d.status === 'failed')
    }
    if (activeLens === 'workloads' || activeLens === 'all' || activeLens === 'issues') {
      return deps
    }
    return []
  }, [allDeployments, searchFilter, activeLens])

  const filteredServices = useMemo(() => {
    let svcs = allServices || []
    if (searchFilter) {
      svcs = svcs.filter(s => s.name.toLowerCase().includes(searchFilter.toLowerCase()) || s.namespace.toLowerCase().includes(searchFilter.toLowerCase()))
    }
    if (activeLens === 'network' || activeLens === 'all') {
      return svcs
    }
    return []
  }, [allServices, searchFilter, activeLens])

  const filteredPVCs = useMemo(() => {
    let pvcs = allPVCs || []
    if (searchFilter) {
      pvcs = pvcs.filter(p => p.name.toLowerCase().includes(searchFilter.toLowerCase()) || p.namespace.toLowerCase().includes(searchFilter.toLowerCase()))
    }
    if (activeLens === 'issues') {
      pvcs = pvcs.filter(p => p.status !== 'Bound')
    }
    if (activeLens === 'storage' || activeLens === 'all' || activeLens === 'issues') {
      return pvcs
    }
    return []
  }, [allPVCs, searchFilter, activeLens])

  // Count issues for each category
  const issueCounts = useMemo(() => ({
    nodes: (allNodes || []).filter(n => n.status !== 'Ready').length,
    deployments: (allDeployments || []).filter(d => d.readyReplicas < d.replicas).length,
    pods: podIssues.length,
    pvcs: (allPVCs || []).filter(p => p.status !== 'Bound').length,
    total: 0, // computed below
  }), [allNodes, allDeployments, podIssues, allPVCs])
  issueCounts.total = issueCounts.nodes + issueCounts.deployments + issueCounts.pods + issueCounts.pvcs

  // Guard against missing cluster name (after ALL hooks)
  if (!clusterName) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No cluster selected
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        {/* Skeleton: Overview Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="p-4 rounded-lg bg-card/50 border border-border">
              <div className="h-4 w-16 bg-secondary rounded mb-2" />
              <div className="h-8 w-20 bg-secondary rounded" />
              <div className="h-3 w-12 bg-secondary/50 rounded mt-2" />
            </div>
          ))}
        </div>

        {/* Skeleton: Quick Actions */}
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-secondary rounded-lg" />
        </div>

        {/* Skeleton: Issues Section */}
        <div>
          <div className="h-6 w-32 bg-secondary rounded mb-4" />
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="p-3 rounded-lg bg-card/30 border border-border">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="h-4 w-40 bg-secondary rounded" />
                    <div className="h-3 w-24 bg-secondary/50 rounded" />
                  </div>
                  <div className="h-6 w-16 bg-secondary rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const totalGPUs = clusterGPUNodes.reduce((sum, n) => sum + n.gpuCount, 0)
  const allocatedGPUs = clusterGPUNodes.reduce((sum, n) => sum + n.gpuAllocated, 0)

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="flex items-center gap-2 mb-2">
            {/* Derive health status from actual data: all nodes ready = healthy */}
            <StatusIndicator status={
              health?.reachable === false ? 'unreachable' :
              // If we have node data, derive healthy from readyNodes vs nodeCount
              (health?.nodeCount && health.nodeCount > 0)
                ? (health.readyNodes === health.nodeCount ? 'healthy' : 'warning')
                : (health?.healthy ? 'healthy' : 'error')
            } />
            <span className="text-sm text-muted-foreground">{t('common.status')}</span>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {health?.reachable === false ? 'Offline' :
              (health?.nodeCount && health.nodeCount > 0)
                ? (health.readyNodes === health.nodeCount ? 'Healthy' : 'Degraded')
                : (health?.healthy ? 'Healthy' : 'Unknown')}
          </div>
        </div>

        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">{t('common.nodes')}</div>
          <div className="text-2xl font-bold text-foreground">{health?.nodeCount || 0}</div>
          <div className="text-xs text-green-400">{health?.readyNodes || 0} ready</div>
        </div>

        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">{t('common.pods')}</div>
          <div className="text-2xl font-bold text-foreground">{health?.podCount || 0}</div>
        </div>

        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">{t('common.gpus')}</div>
          <div className="text-2xl font-bold text-foreground">{totalGPUs}</div>
          <div className="text-xs text-yellow-400">{allocatedGPUs} allocated</div>
        </div>
      </div>

      {/* GPU Type Breakdown */}
      {Object.keys(gpuByType).length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-3">{t('common.gpuTypes')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(gpuByType).map(([type, info]) => (
              <div key={type} className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <div className="text-sm font-medium text-purple-400">{type}</div>
                <div className="text-xl font-bold text-foreground mt-1">{info.total} GPUs</div>
                <div className="text-xs text-muted-foreground">
                  {info.allocated} allocated • {info.nodes} node{info.nodes !== 1 ? 's' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Events Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-foreground">{t('drilldown.fields.recentEvents')}</h3>
          <button
            onClick={() => drillToEvents(clusterName)}
            className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
          >
            View All →
          </button>
        </div>
        {eventsLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="p-3 rounded-lg bg-card/30 border border-border">
                <div className="h-4 w-32 bg-secondary rounded mb-2" />
                <div className="h-3 w-full bg-secondary/50 rounded" />
              </div>
            ))}
          </div>
        ) : clusterEvents.length === 0 ? (
          <div className="p-4 rounded-lg bg-card/30 border border-border text-center text-muted-foreground text-sm">
            No recent events
          </div>
        ) : (
          <div className="space-y-2">
            {clusterEvents.slice(0, 5).map((event, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg border-l-4 cursor-pointer hover:bg-card/50 transition-colors ${
                  event.type === 'Warning'
                    ? 'bg-yellow-500/10 border-l-yellow-500'
                    : 'bg-card/30 border-l-green-500'
                }`}
                onClick={() => drillToEvents(clusterName)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusIndicator status={event.type === 'Warning' ? 'warning' : 'healthy'} size="sm" />
                    <span className="font-medium text-foreground text-sm">{event.reason}</span>
                  </div>
                  {event.count > 1 && (
                    <span className="text-xs px-2 py-0.5 rounded bg-card text-muted-foreground">
                      x{event.count}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {event.namespace}/{event.object}
                </div>
                <p className="text-xs text-foreground mt-1 line-clamp-1">{event.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Issues Section */}
      {(podIssues.length > 0 || clusterDeploymentIssues.length > 0) && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Issues ({podIssues.length + clusterDeploymentIssues.length})
          </h3>

          {/* Pod Issues */}
          {podIssues.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Pod Issues</h4>
              <div className="space-y-2">
                {podIssues.map((issue, i) => (
                  <div
                    key={i}
                    onClick={() => drillToPod(clusterName, issue.namespace, issue.name, { ...issue })}
                    className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-foreground">{issue.name}</span>
                        <div className="text-xs text-muted-foreground mt-1">
                          {issue.namespace} • {issue.restarts} restarts
                        </div>
                        {issue.issues.length > 0 && (
                          <div className="text-xs text-red-400 mt-1">{issue.issues.join(', ')}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400">{issue.status}</span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deployment Issues */}
          {clusterDeploymentIssues.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Deployment Issues</h4>
              <div className="space-y-2">
                {clusterDeploymentIssues.map((issue, i) => (
                  <div
                    key={i}
                    onClick={() => drillToNamespace(clusterName, issue.namespace)}
                    className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 cursor-pointer hover:bg-orange-500/20 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-foreground">{issue.name}</span>
                        <div className="text-xs text-muted-foreground mt-1">{issue.namespace}</div>
                        {issue.message && (
                          <div className="text-xs text-orange-400 mt-1">{issue.message}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="text-xs px-2 py-1 rounded bg-orange-500/20 text-orange-400">
                          {issue.readyReplicas}/{issue.replicas} ready
                        </span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Namespaces with Issues */}
      {namespaces.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">Namespaces with Activity</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {namespaces.map(ns => {
              const nsIssues = podIssues.filter(p => p.namespace === ns).length +
                clusterDeploymentIssues.filter(d => d.namespace === ns).length
              return (
                <button
                  key={ns}
                  onClick={() => drillToNamespace(clusterName, ns)}
                  className="p-3 rounded-lg bg-card/50 border border-border text-left hover:bg-card hover:border-primary/50 transition-colors"
                >
                  <div className="font-medium text-foreground text-sm truncate">{ns}</div>
                  {nsIssues > 0 && (
                    <div className="text-xs text-red-400 mt-1">{nsIssues} issues</div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* GPU Nodes */}
      {clusterGPUNodes.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">
            GPU Nodes ({clusterGPUNodes.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {clusterGPUNodes.map((node, i) => (
              <div
                key={i}
                onClick={() => drillToGPUNode(clusterName, node.name, { ...node })}
                className="p-4 rounded-lg bg-card/50 border border-border flex items-center justify-between cursor-pointer hover:bg-card hover:border-primary/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground text-sm truncate">{node.name}</div>
                  <div className="text-xs text-muted-foreground">{node.gpuType}</div>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <Gauge
                    value={node.gpuAllocated}
                    max={node.gpuCount}
                    size="sm"
                  />
                  <div className="text-sm text-muted-foreground whitespace-nowrap">
                    {node.gpuAllocated}/{node.gpuCount} GPUs
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resource Tree Section */}
      <div className="border-t border-border pt-6">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setShowResourceTree(!showResourceTree)}
            className="flex items-center gap-2 text-lg font-semibold text-foreground hover:text-primary transition-colors"
          >
            {showResourceTree ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            <Layers className="w-5 h-5 text-purple-400" />
            Resource Tree
            {issueCounts.total > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400">
                {issueCounts.total} issues
              </span>
            )}
          </button>
        </div>

        {showResourceTree && (
          <div className="space-y-4">
            {/* Search and Filters */}
            <div className="flex flex-col md:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder={t('common.searchResources')}
                  className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
              </div>

              {/* Lens/View Buttons */}
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'all' as TreeLens, label: 'All', icon: Layers },
                  { id: 'issues' as TreeLens, label: 'Issues', icon: AlertTriangle, count: issueCounts.total },
                  { id: 'nodes' as TreeLens, label: 'Nodes', icon: Server, count: filteredNodes.length },
                  { id: 'workloads' as TreeLens, label: 'Workloads', icon: Box, count: filteredDeployments.length },
                  { id: 'storage' as TreeLens, label: 'Storage', icon: HardDrive, count: filteredPVCs.length },
                  { id: 'network' as TreeLens, label: 'Network', icon: Network, count: filteredServices.length },
                ].map(lens => (
                  <button
                    key={lens.id}
                    onClick={() => setActiveLens(lens.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      activeLens === lens.id
                        ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                        : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <lens.icon className="w-3.5 h-3.5" />
                    {lens.label}
                    {lens.count !== undefined && lens.count > 0 && (
                      <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
                        lens.id === 'issues' ? 'bg-red-500/20 text-red-400' : 'bg-secondary text-muted-foreground'
                      }`}>
                        {lens.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Tree Content */}
            <div className="bg-card/30 rounded-lg border border-border p-4">
              {/* Cluster Root */}
              <div className="relative">
                {/* Cluster Header */}
                <div
                  onClick={() => toggleSection('cluster')}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
                >
                  {expandedSections.has('cluster') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <Server className="w-4 h-4 text-cyan-400" />
                  <span className="font-medium text-foreground">{clusterName}</span>
                  <StatusIndicator status={
                    health?.reachable === false ? 'unreachable' :
                    (health?.nodeCount && health.nodeCount > 0)
                      ? (health.readyNodes === health.nodeCount ? 'healthy' : 'warning')
                      : (health?.healthy ? 'healthy' : 'error')
                  } />
                </div>

                {expandedSections.has('cluster') && (
                  <div className="ml-6 border-l-2 border-cyan-500/30 pl-4 mt-2 space-y-2">
                    {/* Nodes Branch */}
                    {(activeLens === 'all' || activeLens === 'nodes' || activeLens === 'issues') && filteredNodes.length > 0 && (
                      <div>
                        <div
                          onClick={() => toggleSection('nodes')}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
                        >
                          {expandedSections.has('nodes') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <Server className="w-4 h-4 text-blue-400" />
                          <span className="text-sm font-medium text-foreground">{t('common.nodes')}</span>
                          <span className="text-xs text-muted-foreground">({filteredNodes.length})</span>
                          {issueCounts.nodes > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-400">
                              {issueCounts.nodes} not ready
                            </span>
                          )}
                        </div>

                        {expandedSections.has('nodes') && (
                          <div className="ml-6 border-l-2 border-blue-500/30 pl-4 mt-1 space-y-1">
                            {filteredNodes.slice(0, 20).map((node, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group"
                              >
                                <div className={`w-2 h-2 rounded-full ${node.status === 'Ready' ? 'bg-green-400' : 'bg-red-400'}`} />
                                <span className="text-sm text-foreground">{node.name}</span>
                                <span className={`text-xs ${node.status === 'Ready' ? 'text-green-400' : 'text-red-400'}`}>
                                  {node.status}
                                </span>
                                {node.roles?.length > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    [{node.roles.join(', ')}]
                                  </span>
                                )}
                                <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                              </div>
                            ))}
                            {filteredNodes.length > 20 && (
                              <div className="text-xs text-muted-foreground p-2">
                                +{filteredNodes.length - 20} more nodes...
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Namespaces Branch */}
                    {(activeLens === 'all' || activeLens === 'workloads') && filteredNamespaces.length > 0 && (
                      <div>
                        <div
                          onClick={() => toggleSection('namespaces')}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
                        >
                          {expandedSections.has('namespaces') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <Database className="w-4 h-4 text-purple-400" />
                          <span className="text-sm font-medium text-foreground">Namespaces</span>
                          <span className="text-xs text-muted-foreground">({filteredNamespaces.length})</span>
                        </div>

                        {expandedSections.has('namespaces') && (
                          <div className="ml-6 border-l-2 border-purple-500/30 pl-4 mt-1 space-y-1">
                            {filteredNamespaces.slice(0, 15).map((ns, i) => {
                              const nsKey = `ns-${ns}`
                              const nsPodIssues = podIssues.filter(p => p.namespace === ns).length
                              const nsDeploymentIssues = clusterDeploymentIssues.filter(d => d.namespace === ns).length
                              const totalIssues = nsPodIssues + nsDeploymentIssues

                              return (
                                <div key={i}>
                                  <div
                                    onClick={() => toggleSection(nsKey)}
                                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
                                  >
                                    {expandedSections.has(nsKey) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                    <span className="text-sm text-foreground">{ns}</span>
                                    {totalIssues > 0 && (
                                      <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-400">
                                        {totalIssues}
                                      </span>
                                    )}
                                  </div>

                                  {expandedSections.has(nsKey) && (
                                    <div className="ml-6 border-l-2 border-muted/30 pl-4 mt-1 space-y-1">
                                      {/* Deployments in namespace */}
                                      {filteredDeployments.filter(d => d.namespace === ns).slice(0, 5).map((dep, j) => (
                                        <div
                                          key={j}
                                          onClick={() => drillToNamespace(clusterName, dep.namespace)}
                                          className="flex items-center gap-2 p-1.5 rounded hover:bg-secondary/50 cursor-pointer group"
                                        >
                                          <Box className="w-3 h-3 text-green-400" />
                                          <span className="text-xs text-foreground">{dep.name}</span>
                                          <span className={`text-[10px] ${dep.readyReplicas === dep.replicas ? 'text-green-400' : 'text-yellow-400'}`}>
                                            {dep.readyReplicas}/{dep.replicas}
                                          </span>
                                          <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                                        </div>
                                      ))}

                                      {/* Services in namespace */}
                                      {filteredServices.filter(s => s.namespace === ns).slice(0, 3).map((svc, j) => (
                                        <div
                                          key={j}
                                          onClick={() => drillToNamespace(clusterName, svc.namespace)}
                                          className="flex items-center gap-2 p-1.5 rounded hover:bg-secondary/50 cursor-pointer group"
                                        >
                                          <Network className="w-3 h-3 text-blue-400" />
                                          <span className="text-xs text-foreground">{svc.name}</span>
                                          <span className="text-[10px] text-muted-foreground">{svc.type}</span>
                                          <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                                        </div>
                                      ))}

                                      {/* View all in namespace */}
                                      <button
                                        onClick={() => drillToNamespace(clusterName, ns)}
                                        className="text-xs text-purple-400 hover:text-purple-300 p-1.5 transition-colors"
                                      >
                                        View all in {ns} →
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                            {filteredNamespaces.length > 15 && (
                              <div className="text-xs text-muted-foreground p-2">
                                +{filteredNamespaces.length - 15} more namespaces...
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Deployments with Issues (when issues lens active) */}
                    {activeLens === 'issues' && issueCounts.deployments > 0 && (
                      <div>
                        <div
                          onClick={() => toggleSection('deployment-issues')}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
                        >
                          {expandedSections.has('deployment-issues') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <AlertTriangle className="w-4 h-4 text-orange-400" />
                          <span className="text-sm font-medium text-foreground">Deployment Issues</span>
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-orange-500/20 text-orange-400">
                            {issueCounts.deployments}
                          </span>
                        </div>

                        {expandedSections.has('deployment-issues') && (
                          <div className="ml-6 border-l-2 border-orange-500/30 pl-4 mt-1 space-y-1">
                            {filteredDeployments.filter(d => d.readyReplicas < d.replicas).map((dep, i) => (
                              <div
                                key={i}
                                onClick={() => drillToNamespace(clusterName, dep.namespace)}
                                className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group"
                              >
                                <XCircle className="w-3 h-3 text-orange-400" />
                                <span className="text-sm text-foreground">{dep.name}</span>
                                <span className="text-xs text-muted-foreground">{dep.namespace}</span>
                                <span className="text-xs text-orange-400">{dep.readyReplicas}/{dep.replicas}</span>
                                <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Pod Issues (when issues lens active) */}
                    {activeLens === 'issues' && issueCounts.pods > 0 && (
                      <div>
                        <div
                          onClick={() => toggleSection('pod-issues')}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
                        >
                          {expandedSections.has('pod-issues') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <AlertTriangle className="w-4 h-4 text-red-400" />
                          <span className="text-sm font-medium text-foreground">Pod Issues</span>
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-400">
                            {issueCounts.pods}
                          </span>
                        </div>

                        {expandedSections.has('pod-issues') && (
                          <div className="ml-6 border-l-2 border-red-500/30 pl-4 mt-1 space-y-1">
                            {podIssues.slice(0, 10).map((issue, i) => (
                              <div
                                key={i}
                                onClick={() => drillToPod(clusterName, issue.namespace, issue.name, { ...issue })}
                                className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group"
                              >
                                <XCircle className="w-3 h-3 text-red-400" />
                                <span className="text-sm text-foreground">{issue.name}</span>
                                <span className="text-xs text-muted-foreground">{issue.namespace}</span>
                                <span className="text-xs text-red-400">{issue.status}</span>
                                <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                              </div>
                            ))}
                            {podIssues.length > 10 && (
                              <div className="text-xs text-muted-foreground p-2">
                                +{podIssues.length - 10} more pod issues...
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Storage Resources */}
                    {(activeLens === 'storage' || (activeLens === 'all' && filteredPVCs.length > 0)) && filteredPVCs.length > 0 && (
                      <div>
                        <div
                          onClick={() => toggleSection('storage')}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
                        >
                          {expandedSections.has('storage') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <HardDrive className="w-4 h-4 text-emerald-400" />
                          <span className="text-sm font-medium text-foreground">{t('common.pvcs')}</span>
                          <span className="text-xs text-muted-foreground">({filteredPVCs.length})</span>
                          {issueCounts.pvcs > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-yellow-500/20 text-yellow-400">
                              {issueCounts.pvcs} pending
                            </span>
                          )}
                        </div>

                        {expandedSections.has('storage') && (
                          <div className="ml-6 border-l-2 border-emerald-500/30 pl-4 mt-1 space-y-1">
                            {filteredPVCs.slice(0, 10).map((pvc, i) => (
                              <div
                                key={i}
                                onClick={() => drillToNamespace(clusterName, pvc.namespace)}
                                className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group"
                              >
                                <div className={`w-2 h-2 rounded-full ${pvc.status === 'Bound' ? 'bg-green-400' : 'bg-yellow-400'}`} />
                                <span className="text-sm text-foreground">{pvc.name}</span>
                                <span className="text-xs text-muted-foreground">{pvc.namespace}</span>
                                <span className={`text-xs ${pvc.status === 'Bound' ? 'text-green-400' : 'text-yellow-400'}`}>
                                  {pvc.status}
                                </span>
                                {pvc.capacity && <span className="text-xs text-muted-foreground">{pvc.capacity}</span>}
                                <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                              </div>
                            ))}
                            {filteredPVCs.length > 10 && (
                              <div className="text-xs text-muted-foreground p-2">
                                +{filteredPVCs.length - 10} more PVCs...
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Network Resources */}
                    {activeLens === 'network' && filteredServices.length > 0 && (
                      <div>
                        <div
                          onClick={() => toggleSection('network')}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
                        >
                          {expandedSections.has('network') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <Network className="w-4 h-4 text-blue-400" />
                          <span className="text-sm font-medium text-foreground">{t('common.services')}</span>
                          <span className="text-xs text-muted-foreground">({filteredServices.length})</span>
                        </div>

                        {expandedSections.has('network') && (
                          <div className="ml-6 border-l-2 border-blue-500/30 pl-4 mt-1 space-y-1">
                            {filteredServices.slice(0, 15).map((svc, i) => (
                              <div
                                key={i}
                                onClick={() => drillToNamespace(clusterName, svc.namespace)}
                                className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group"
                              >
                                <Network className="w-3 h-3 text-blue-400" />
                                <span className="text-sm text-foreground">{svc.name}</span>
                                <span className="text-xs text-muted-foreground">{svc.namespace}</span>
                                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">{svc.type}</span>
                                <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                              </div>
                            ))}
                            {filteredServices.length > 15 && (
                              <div className="text-xs text-muted-foreground p-2">
                                +{filteredServices.length - 15} more services...
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Empty state for filters */}
                    {filteredNodes.length === 0 && filteredDeployments.length === 0 && filteredServices.length === 0 && filteredPVCs.length === 0 && (
                      <div className="text-center text-muted-foreground text-sm py-4">
                        No resources match the current filter
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
