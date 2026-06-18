import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useClusterHealth, usePodIssues, useDeploymentIssues, useGPUNodes, useNodes, useNamespaces, useNamespaceStats, useDeployments, useServices, useEvents, useClusters, type ClusterInfo } from '../../../hooks/useMCP'
import { useCachedPVCs } from '../../../hooks/useCachedData'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { LOADING_TIMEOUT_MS } from '../../../lib/constants/network'
import { ClusterOverview, type TreeLens } from './ClusterDrillDown.overview'
import { ClusterEventsTab } from './ClusterDrillDown.events'
import { ClusterResourcesTab } from './ClusterDrillDown.resources'

type ClusterTab = 'events' | 'resources'

/** Scroll delay (ms) to let the DOM update after switching tabs */
const SCROLL_AFTER_TAB_SWITCH_MS = 100

interface Props {
  data: Record<string, unknown>
}

export function ClusterDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const clusterName = (data.cluster as string) || ''
  const { deduplicatedClusters } = useClusters()
  const { drillToNamespace, drillToPod, drillToGPUNode, drillToEvents, drillToNode } = useDrillDownActions()
  const clusterInfo = useMemo(
    () => deduplicatedClusters.find((cluster: ClusterInfo) => cluster.name === clusterName || cluster.aliases?.includes(clusterName)),
    [clusterName, deduplicatedClusters],
  )
  const effectiveClusterName = clusterInfo?.name || clusterName
  const clusterDisplayName = clusterInfo?.name || clusterName

  // Tree view state
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['cluster', 'nodes', 'namespaces']))
  const [searchFilter, setSearchFilter] = useState('')
  const [activeLens, setActiveLens] = useState<TreeLens>('all')
  const [activeTab, setActiveTab] = useState<ClusterTab>('events')
  const resourceTreeRef = useRef<HTMLDivElement>(null)
  const resourceTreeScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (resourceTreeScrollTimeoutRef.current) {
        clearTimeout(resourceTreeScrollTimeoutRef.current)
      }
    }
  }, [])

  /**
   * Navigate to the Resource Tree tab with a given lens active.
   *
   * Scrolls the tab container (not an inner branch) into view so the user
   * sees the lens buttons and the filtered branch together — keeping this
   * flow consistent with clicking a lens button directly inside the tab.
   */
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
    // Allow DOM to update before scrolling
    resourceTreeScrollTimeoutRef.current = setTimeout(() => {
      resourceTreeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      resourceTreeScrollTimeoutRef.current = null
    }, SCROLL_AFTER_TAB_SWITCH_MS)
  }, [])

  // Safeguard timeout to prevent infinite loading - show content after 5 seconds max
  const [loadingTimedOut, setLoadingTimedOut] = useState(false)
  useEffect(() => {
    setLoadingTimedOut(false) // Reset on cluster change
    const timer = setTimeout(() => setLoadingTimedOut(true), LOADING_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [effectiveClusterName])

  const { health, isLoading: healthLoading } = useClusterHealth(effectiveClusterName)
  // Only show loading spinner if health is loading AND we haven't timed out
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
      map[type].total += node.gpuCount || 0
      map[type].allocated += node.gpuAllocated || 0
      map[type].nodes += 1
    })
    return map
  }, [clusterGPUNodes])

  // Filter resources based on search and lens
  const filteredNodes = useMemo(() => {
    let nodes = allNodes || []
    if (normalizedSearchFilter) {
      nodes = nodes.filter(n => n.name.toLowerCase().includes(normalizedSearchFilter))
    }
    if (activeLens === 'issues') {
      nodes = nodes.filter(n => n.status !== 'Ready')
    }
    if (activeLens === 'nodes' || activeLens === 'all') {
      return nodes
    }
    return activeLens === 'issues' ? nodes : []
  }, [activeLens, allNodes, normalizedSearchFilter])

  const filteredNamespaceStats = useMemo(() => {
    const statsByName = new Map(namespaceStats.map(ns => [ns.name, ns]))
    const mergedNamespaceNames = Array.from(new Set([
      ...namespaceStats.map(ns => ns.name),
      ...(allNamespaces || []),
    ]))

    let namespaces = mergedNamespaceNames.map(name => statsByName.get(name) || {
      name,
      podCount: 0,
      runningPods: 0,
      pendingPods: 0,
      failedPods: 0,
    })

    if (normalizedSearchFilter) {
      namespaces = namespaces.filter(ns => ns.name.toLowerCase().includes(normalizedSearchFilter))
    }

    // Filter out system namespaces unless explicitly searching
    // But keep them if that's all we have
    if (!normalizedSearchFilter) {
      const nonSystemNs = namespaces.filter(ns => !ns.name.startsWith('kube-') && ns.name !== 'default')
      if (nonSystemNs.length > 0) {
        namespaces = nonSystemNs
      }
    }

    return namespaces
  }, [allNamespaces, namespaceStats, normalizedSearchFilter])

  const filteredNamespaces = useMemo(
    () => filteredNamespaceStats.map(ns => ns.name),
    [filteredNamespaceStats],
  )

  const filteredDeployments = useMemo(() => {
    let deps = allDeployments || []
    if (normalizedSearchFilter) {
      deps = deps.filter(d => d.name.toLowerCase().includes(normalizedSearchFilter) || d.namespace.toLowerCase().includes(normalizedSearchFilter))
    }
    if (activeLens === 'issues') {
      deps = deps.filter(d => d.readyReplicas < d.replicas || d.status === 'failed')
    }
    if (activeLens === 'workloads' || activeLens === 'all' || activeLens === 'issues') {
      return deps
    }
    return []
  }, [activeLens, allDeployments, normalizedSearchFilter])

  const unhealthyDeployments = useMemo(() => {
    return filteredDeployments.filter(d => d.readyReplicas < d.replicas)
  }, [filteredDeployments])

  const filteredServices = useMemo(() => {
    let svcs = allServices || []
    if (normalizedSearchFilter) {
      svcs = svcs.filter(s => s.name.toLowerCase().includes(normalizedSearchFilter) || s.namespace.toLowerCase().includes(normalizedSearchFilter))
    }
    if (activeLens === 'network' || activeLens === 'all') {
      return svcs
    }
    return []
  }, [activeLens, allServices, normalizedSearchFilter])

  const filteredPVCs = useMemo(() => {
    let pvcs = allPVCs || []
    if (normalizedSearchFilter) {
      pvcs = pvcs.filter(p => p.name.toLowerCase().includes(normalizedSearchFilter) || p.namespace.toLowerCase().includes(normalizedSearchFilter))
    }
    if (activeLens === 'issues') {
      pvcs = pvcs.filter(p => p.status !== 'Bound')
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

  const hasVisibleResourceData =
    filteredNodes.length > 0 ||
    filteredNamespaces.length > 0 ||
    filteredDeployments.length > 0 ||
    filteredServices.length > 0 ||
    filteredPVCs.length > 0

  // Count issues for each category
  const issueCounts = useMemo(() => {
    const nodes = (allNodes || []).filter(n => n.status !== 'Ready').length
    const deployments = (allDeployments || []).filter(d => d.readyReplicas < d.replicas).length
    const pods = podIssues.length
    const pvcs = (allPVCs || []).filter(p => p.status !== 'Bound').length
    return {
      nodes,
      deployments,
      pods,
      pvcs,
      total: nodes + deployments + pods + pvcs,
    }
  }, [allDeployments, allNodes, allPVCs, podIssues])

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


  const totalGPUs = clusterGPUNodes.reduce((sum, n) => sum + (n.gpuCount || 0), 0)
  const allocatedGPUs = clusterGPUNodes.reduce((sum, n) => sum + (n.gpuAllocated || 0), 0)

  return (
    <div className="space-y-6">
      <ClusterOverview
        health={health}
        navigateToResourceTree={navigateToResourceTree}
        gpuByType={gpuByType}
        clusterGPUNodes={clusterGPUNodes}
        totalGPUs={totalGPUs}
        allocatedGPUs={allocatedGPUs}
        podIssues={podIssues}
        clusterDeploymentIssues={clusterDeploymentIssues}
        namespaces={namespaces}
        effectiveClusterName={effectiveClusterName}
        drillToPod={drillToPod}
        drillToNamespace={drillToNamespace}
        drillToGPUNode={drillToGPUNode}
      />

      {/* Tabs for Events and Resources */}
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
                    : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border'
                )}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded-full',
                    activeTab === tab.id
                      ? 'bg-primary/20 text-primary'
                      : tab.id === 'resources' ? 'bg-red-500/20 text-red-400' : 'bg-secondary text-muted-foreground'
                  )}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Events Tab */}
        {activeTab === 'events' && (
          <ClusterEventsTab
            eventsLoading={eventsLoading}
            clusterEvents={clusterEvents}
            effectiveClusterName={effectiveClusterName}
            drillToEvents={drillToEvents}
          />
        )}

        {/* Resources Tab */}
        {activeTab === 'resources' && (
          <ClusterResourcesTab
            searchFilter={searchFilter}
            setSearchFilter={setSearchFilter}
            activeLens={activeLens}
            setActiveLens={setActiveLens}
            expandedSections={expandedSections}
            toggleSection={toggleSection}
            filteredNodes={filteredNodes}
            filteredNamespaces={filteredNamespaces}
            filteredNamespaceStats={filteredNamespaceStats}
            filteredDeployments={filteredDeployments}
            filteredServices={filteredServices}
            filteredPVCs={filteredPVCs}
            issueCounts={issueCounts}
            unhealthyDeployments={unhealthyDeployments}
            podIssues={podIssues}
            namespaceResources={namespaceResources}
            hasVisibleResourceData={hasVisibleResourceData}
            health={health}
            clusterDisplayName={clusterDisplayName}
            effectiveClusterName={effectiveClusterName}
            drillToNode={drillToNode}
            drillToNamespace={drillToNamespace}
            drillToPod={drillToPod}
          />
        )}
      </div>
    </div>
  )
}
