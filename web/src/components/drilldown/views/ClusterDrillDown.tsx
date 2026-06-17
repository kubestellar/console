import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { StatusBadge } from '../../ui/StatusBadge'
import { useClusterHealth, usePodIssues, useDeploymentIssues, useGPUNodes, useNodes, useNamespaces, useNamespaceStats, useDeployments, useServices, useEvents, useClusters, type ClusterInfo } from '../../../hooks/useMCP'
import { useCachedPVCs } from '../../../hooks/useCachedData'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { Gauge } from '../../charts/Gauge'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { LOADING_TIMEOUT_MS } from '../../../lib/constants/network'
import { ClusterDrillDownEventsTab } from './ClusterDrillDownEventsTab'
import { ClusterDrillDownResourceTree, type TreeLens } from './ClusterDrillDownResourceTree'
type ClusterTab = 'events' | 'resources'
const SCROLL_AFTER_TAB_SWITCH_MS = 100
interface Props {
  data: Record<string, unknown>
}
export function ClusterDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const clusterName = (data.cluster as string) || ''
  const { deduplicatedClusters } = useClusters()
  const { drillToNamespace, drillToPod, drillToGPUNode, drillToEvents, drillToNode } = useDrillDownActions()
  const clusterInfo = useMemo(() => deduplicatedClusters.find((cluster: ClusterInfo) => cluster.name === clusterName || cluster.aliases?.includes(clusterName)), [clusterName, deduplicatedClusters])
  const effectiveClusterName = clusterInfo?.name || clusterName
  const clusterDisplayName = clusterInfo?.name || clusterName
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['cluster', 'nodes', 'namespaces']))
  const [searchFilter, setSearchFilter] = useState('')
  const [activeLens, setActiveLens] = useState<TreeLens>('all')
  const [activeTab, setActiveTab] = useState<ClusterTab>('events')
  const resourceTreeRef = useRef<HTMLDivElement>(null)
  const resourceTreeScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (resourceTreeScrollTimeoutRef.current) clearTimeout(resourceTreeScrollTimeoutRef.current)
  }, [])
  const navigateToResourceTree = useCallback((lens: TreeLens) => {
    setActiveTab('resources')
    setActiveLens(lens)
    setExpandedSections(prev => {
      const next = new Set(prev)
      next.add('cluster')
      if (lens === 'nodes') next.add('nodes')
      if (lens === 'workloads') next.add('namespaces')
      return next
    })
    if (resourceTreeScrollTimeoutRef.current) {
      clearTimeout(resourceTreeScrollTimeoutRef.current)
    }
    resourceTreeScrollTimeoutRef.current = setTimeout(() => {
      resourceTreeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      resourceTreeScrollTimeoutRef.current = null
    }, SCROLL_AFTER_TAB_SWITCH_MS)
  }, [])
  const [loadingTimedOut, setLoadingTimedOut] = useState(false)
  useEffect(() => {
    setLoadingTimedOut(false)
    const timer = setTimeout(() => setLoadingTimedOut(true), LOADING_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [effectiveClusterName])
  const { health, isLoading: healthLoading } = useClusterHealth(effectiveClusterName)
  const isLoading = healthLoading && !loadingTimedOut
  const { issues: podIssues } = usePodIssues(effectiveClusterName)
  const { issues: deploymentIssues } = useDeploymentIssues(effectiveClusterName)
  const { nodes: allGPUNodes } = useGPUNodes(effectiveClusterName)
  const { nodes: allNodes } = useNodes(effectiveClusterName)
  const { namespaces: allNamespaces } = useNamespaces(effectiveClusterName)
  const { stats: namespaceStats } = useNamespaceStats(effectiveClusterName)
  const { deployments: allDeployments } = useDeployments(effectiveClusterName)
  const { services: allServices } = useServices(effectiveClusterName)
  const { pvcs: allPVCs } = useCachedPVCs(effectiveClusterName)
  const { events: clusterEvents, isLoading: eventsLoading } = useEvents(effectiveClusterName, undefined, 10)
  const toggleSection = (section: string) => setExpandedSections(prev => {
    const next = new Set(prev)
    if (next.has(section)) next.delete(section)
    else next.add(section)
    return next
  })
  const clusterLookupNames = useMemo(() => {
    const names = new Set<string>()
    if (clusterName) names.add(clusterName)
    if (effectiveClusterName) names.add(effectiveClusterName)
    ;(clusterInfo?.aliases || []).forEach((alias: string) => names.add(alias))
    return names
  }, [clusterInfo?.aliases, clusterName, effectiveClusterName])
  const clusterPrefix = useMemo(() => effectiveClusterName.split('/')[0], [effectiveClusterName])
  const normalizedSearchFilter = useMemo(() => searchFilter.trim().toLowerCase(), [searchFilter])
  const clusterGPUNodes = useMemo(() => {
    if (!effectiveClusterName) return []
    return (allGPUNodes || []).filter(node => clusterLookupNames.has(node.cluster) || node.cluster.includes(clusterPrefix))
  }, [allGPUNodes, clusterLookupNames, effectiveClusterName, clusterPrefix])
  const clusterDeploymentIssues = useMemo(() => {
    if (!effectiveClusterName) return []
    return (deploymentIssues || []).filter(issue => clusterLookupNames.has(issue.cluster || '') || issue.cluster?.includes(clusterPrefix))
  }, [clusterLookupNames, effectiveClusterName, clusterPrefix, deploymentIssues])
  const namespaces = useMemo(() => {
    const namespaceSet = new Set<string>()
    podIssues.forEach(issue => namespaceSet.add(issue.namespace))
    clusterDeploymentIssues.forEach(issue => namespaceSet.add(issue.namespace))
    return Array.from(namespaceSet).sort()
  }, [podIssues, clusterDeploymentIssues])
  const gpuByType = useMemo(() => {
    const map: Record<string, { total: number; allocated: number; nodes: number }> = {}
    clusterGPUNodes.forEach(node => {
      const type = node.gpuType || 'Unknown'
      if (!map[type]) {
        map[type] = { total: 0, allocated: 0, nodes: 0 }
      }
      map[type].total += node.gpuCount || 0
      map[type].allocated += node.gpuAllocated || 0
      map[type].nodes += 1
    })
    return map
  }, [clusterGPUNodes])
  const filteredNodes = useMemo(() => {
    let nodes = allNodes || []
    if (normalizedSearchFilter) {
      nodes = nodes.filter(node => node.name.toLowerCase().includes(normalizedSearchFilter))
    }
    if (activeLens === 'issues') {
      nodes = nodes.filter(node => node.status !== 'Ready')
    }
    if (activeLens === 'nodes' || activeLens === 'all') {
      return nodes
    }
    return activeLens === 'issues' ? nodes : []
  }, [activeLens, allNodes, normalizedSearchFilter])
  const filteredNamespaceStats = useMemo(() => {
    const statsByName = new Map(namespaceStats.map(namespace => [namespace.name, namespace]))
    const mergedNamespaceNames = Array.from(new Set([
      ...namespaceStats.map(namespace => namespace.name),
      ...(allNamespaces || []),
    ]))
    let namespacesWithStats = mergedNamespaceNames.map(name => statsByName.get(name) || {
      name,
      podCount: 0,
      runningPods: 0,
      pendingPods: 0,
      failedPods: 0,
    })
    if (normalizedSearchFilter) {
      namespacesWithStats = namespacesWithStats.filter(namespace => namespace.name.toLowerCase().includes(normalizedSearchFilter))
    }
    if (!normalizedSearchFilter) {
      const nonSystemNamespaces = namespacesWithStats.filter(namespace => !namespace.name.startsWith('kube-') && namespace.name !== 'default')
      if (nonSystemNamespaces.length > 0) {
        namespacesWithStats = nonSystemNamespaces
      }
    }
    return namespacesWithStats
  }, [allNamespaces, namespaceStats, normalizedSearchFilter])
  const filteredDeployments = useMemo(() => {
    let deployments = allDeployments || []
    if (normalizedSearchFilter) {
      deployments = deployments.filter(deployment => deployment.name.toLowerCase().includes(normalizedSearchFilter) || deployment.namespace.toLowerCase().includes(normalizedSearchFilter))
    }
    if (activeLens === 'issues') {
      deployments = deployments.filter(deployment => deployment.readyReplicas < deployment.replicas || deployment.status === 'failed')
    }
    if (activeLens === 'workloads' || activeLens === 'all' || activeLens === 'issues') {
      return deployments
    }
    return []
  }, [activeLens, allDeployments, normalizedSearchFilter])
  const unhealthyDeployments = useMemo(() => filteredDeployments.filter(deployment => deployment.readyReplicas < deployment.replicas), [filteredDeployments])
  const filteredServices = useMemo(() => {
    let services = allServices || []
    if (normalizedSearchFilter) {
      services = services.filter(service => service.name.toLowerCase().includes(normalizedSearchFilter) || service.namespace.toLowerCase().includes(normalizedSearchFilter))
    }
    if (activeLens === 'network' || activeLens === 'all') {
      return services
    }
    return []
  }, [activeLens, allServices, normalizedSearchFilter])
  const filteredPVCs = useMemo(() => {
    let pvcs = allPVCs || []
    if (normalizedSearchFilter) {
      pvcs = pvcs.filter(pvc => pvc.name.toLowerCase().includes(normalizedSearchFilter) || pvc.namespace.toLowerCase().includes(normalizedSearchFilter))
    }
    if (activeLens === 'issues') {
      pvcs = pvcs.filter(pvc => pvc.status !== 'Bound')
    }
    if (activeLens === 'storage' || activeLens === 'all' || activeLens === 'issues') {
      return pvcs
    }
    return []
  }, [activeLens, allPVCs, normalizedSearchFilter])
  const namespaceResources = useMemo(() => {
    const podIssueCounts: Record<string, number> = {}
    const deploymentIssueCounts: Record<string, number> = {}
    podIssues.forEach(issue => {
      podIssueCounts[issue.namespace] = (podIssueCounts[issue.namespace] || 0) + 1
    })
    clusterDeploymentIssues.forEach(issue => {
      deploymentIssueCounts[issue.namespace] = (deploymentIssueCounts[issue.namespace] || 0) + 1
    })
    return {
      podIssueCounts,
      deploymentIssueCounts,
    }
  }, [clusterDeploymentIssues, podIssues])
  const hasVisibleResourceData = filteredNodes.length > 0 || filteredNamespaceStats.length > 0 || filteredDeployments.length > 0 || filteredServices.length > 0 || filteredPVCs.length > 0
  const issueCounts = useMemo(() => {
    const nodes = (allNodes || []).filter(node => node.status !== 'Ready').length
    const deployments = (allDeployments || []).filter(deployment => deployment.readyReplicas < deployment.replicas).length
    const pods = podIssues.length
    const pvcs = (allPVCs || []).filter(pvc => pvc.status !== 'Bound').length
    return {
      nodes,
      deployments,
      pods,
      pvcs,
      total: nodes + deployments + pods + pvcs,
    }
  }, [allDeployments, allNodes, allPVCs, podIssues])
  if (!clusterName) return <div className="flex items-center justify-center h-64 text-muted-foreground">No cluster selected</div>
  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="p-4 rounded-lg bg-card/50 border border-border">
              <div className="h-4 w-16 bg-secondary rounded mb-2" />
              <div className="h-8 w-20 bg-secondary rounded" />
              <div className="h-3 w-12 bg-secondary/50 rounded mt-2" />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-secondary rounded-lg" />
        </div>
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
  const totalGPUs = clusterGPUNodes.reduce((sum, node) => sum + (node.gpuCount || 0), 0)
  const allocatedGPUs = clusterGPUNodes.reduce((sum, node) => sum + (node.gpuAllocated || 0), 0)
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <StatusIndicator status={
              health?.reachable === false ? 'unreachable' :
                (health?.nodeCount && health.nodeCount > 0)
                  ? (health.readyNodes === health.nodeCount ? 'healthy' : 'warning')
                  : (health?.healthy ? 'healthy' : 'error')
            } />
            <span className="text-sm text-muted-foreground">{t('common.status')}</span>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {health?.reachable === false ? t('common.offline', 'Offline') :
              (health?.nodeCount && health.nodeCount > 0)
                ? (health.readyNodes === health.nodeCount ? t('common.healthy', 'Healthy') : t('common.degraded', 'Degraded'))
                : (health?.healthy ? t('common.healthy', 'Healthy') : t('common.unknown', 'Unknown'))}
          </div>
        </div>
        <button
          onClick={() => navigateToResourceTree('nodes')}
          className="p-4 rounded-lg bg-card/50 border border-border text-left hover:bg-card hover:border-primary/50 transition-colors cursor-pointer w-full"
        >
          <div className="text-sm text-muted-foreground mb-2">{t('common.nodes')}</div>
          <div className="text-2xl font-bold text-foreground">{health?.nodeCount || 0}</div>
          <div className="text-xs text-green-400">{health?.readyNodes || 0} ready</div>
        </button>
        <button
          onClick={() => navigateToResourceTree('workloads')}
          className="p-4 rounded-lg bg-card/50 border border-border text-left hover:bg-card hover:border-primary/50 transition-colors cursor-pointer w-full"
        >
          <div className="text-sm text-muted-foreground mb-2">{t('common.pods')}</div>
          <div className="text-2xl font-bold text-foreground">{health?.podCount || 0}</div>
        </button>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">{t('common.gpus')}</div>
          <div className="text-2xl font-bold text-foreground">{totalGPUs}</div>
          <div className="text-xs text-yellow-400">{allocatedGPUs} allocated</div>
        </div>
      </div>
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
      {(podIssues.length > 0 || clusterDeploymentIssues.length > 0) && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Issues ({podIssues.length + clusterDeploymentIssues.length})
          </h3>
          {podIssues.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Pod Issues</h4>
              <div className="space-y-2">
                {podIssues.map((issue, i) => (
                  <div
                    key={i}
                    onClick={() => drillToPod(effectiveClusterName, issue.namespace, issue.name, { ...issue })}
                    className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-foreground">{issue.name}</span>
                        <div className="text-xs text-muted-foreground mt-1">
                          {issue.namespace} • {issue.restarts} restarts
                        </div>
                        {(issue.issues || []).length > 0 && (
                          <div className="text-xs text-red-400 mt-1">{(issue.issues || []).join(', ')}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <StatusBadge color="red" size="xs">{issue.status}</StatusBadge>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {clusterDeploymentIssues.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Deployment Issues</h4>
              <div className="space-y-2">
                {clusterDeploymentIssues.map((issue, i) => (
                  <div
                    key={i}
                    onClick={() => drillToNamespace(effectiveClusterName, issue.namespace)}
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
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <StatusBadge color="orange" size="xs">
                          {issue.readyReplicas}/{issue.replicas} ready
                        </StatusBadge>
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
      {namespaces.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">Namespaces with Activity</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {namespaces.map(namespace => {
              const namespaceIssues = podIssues.filter(issue => issue.namespace === namespace).length +
                clusterDeploymentIssues.filter(issue => issue.namespace === namespace).length
              return (
                <button
                  key={namespace}
                  onClick={() => drillToNamespace(effectiveClusterName, namespace)}
                  className="p-3 rounded-lg bg-card/50 border border-border text-left hover:bg-card hover:border-primary/50 transition-colors"
                >
                  <div className="font-medium text-foreground text-sm truncate">{namespace}</div>
                  {namespaceIssues > 0 && (
                    <div className="text-xs text-red-400 mt-1">{namespaceIssues} issues</div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {clusterGPUNodes.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">GPU Nodes ({clusterGPUNodes.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {clusterGPUNodes.map((node, i) => (
              <div
                key={i}
                onClick={() => drillToGPUNode(effectiveClusterName, node.name, { ...node })}
                className="p-4 rounded-lg bg-card/50 border border-border flex items-center justify-between cursor-pointer hover:bg-card hover:border-primary/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground text-sm truncate">{node.name}</div>
                  <div className="text-xs text-muted-foreground">{node.gpuType}</div>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <Gauge value={node.gpuAllocated} max={node.gpuCount} size="sm" />
                  <div className="text-sm text-muted-foreground whitespace-nowrap">
                    {node.gpuAllocated}/{node.gpuCount} GPUs
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div ref={resourceTreeRef} className="border-t border-border pt-4">
        <div className="border-b border-border mb-4">
          <div className="flex gap-0">
            {([
              { id: 'events' as ClusterTab, label: t('drilldown.fields.recentEvents'), count: clusterEvents.length },
              { id: 'resources' as ClusterTab, label: 'Resource Tree', count: issueCounts.total > 0 ? issueCounts.total : undefined },
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'text-primary border-primary'
                    : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border',
                )}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded-full',
                    activeTab === tab.id
                      ? 'bg-primary/20 text-primary'
                      : tab.id === 'resources' ? 'bg-red-500/20 text-red-400' : 'bg-secondary text-muted-foreground',
                  )}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        {activeTab === 'events' && <ClusterDrillDownEventsTab clusterEvents={clusterEvents} eventsLoading={eventsLoading} onViewAll={() => drillToEvents(effectiveClusterName)} />}
        {activeTab === 'resources' && (
          <ClusterDrillDownResourceTree
            activeLens={activeLens}
            clusterDisplayName={clusterDisplayName}
            effectiveClusterName={effectiveClusterName}
            expandedSections={expandedSections}
            filteredNamespaceStats={filteredNamespaceStats}
            filteredNodes={filteredNodes}
            filteredPVCs={filteredPVCs}
            filteredServices={filteredServices}
            hasVisibleResourceData={hasVisibleResourceData}
            health={health}
            issueCounts={issueCounts}
            namespaceResources={namespaceResources}
            onDrillToNamespace={drillToNamespace}
            onDrillToNode={drillToNode}
            onDrillToPod={drillToPod}
            podIssues={podIssues}
            searchFilter={searchFilter}
            setActiveLens={setActiveLens}
            setSearchFilter={setSearchFilter}
            toggleSection={toggleSection}
            unhealthyDeployments={unhealthyDeployments}
          />
        )}
      </div>
    </div>
  )
}
