import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useClusters, type ClusterInfo } from '../../../hooks/useMCP'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { Gauge } from '../../charts/Gauge'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { ClusterEventsTab } from './ClusterDrillDown.events'
import { ClusterResourceTree, type TreeLens } from './ClusterDrillDown.tree'
import { ClusterIssuesSection } from './ClusterDrillDown.issues'
import { useClusterDrillDownState } from './ClusterDrillDown.hooks'

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

  // UI state
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
   * Uses a short delay (SCROLL_AFTER_TAB_SWITCH_MS) before scrolling to allow
   * React to flush the tab switch DOM update before measuring scroll position.
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
    resourceTreeScrollTimeoutRef.current = setTimeout(() => {
      resourceTreeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      resourceTreeScrollTimeoutRef.current = null
    }, SCROLL_AFTER_TAB_SWITCH_MS)
  }, [])

  // Data fetching + computed values
  const {
    health, isLoading, eventsLoading, clusterEvents,
    podIssues, clusterDeploymentIssues, clusterGPUNodes, gpuByType, namespaces,
    filteredNodes, filteredNamespaces, filteredNamespaceStats,
    filteredPVCs, filteredServices, unhealthyDeployments,
    namespaceResources, hasVisibleResourceData, issueCounts,
  } = useClusterDrillDownState({ clusterName, clusterInfo, effectiveClusterName, activeLens, searchFilter })

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) { next.delete(section) } else { next.add(section) }
      return next
    })
  }

  // Guard against missing cluster name (after ALL hooks)
  if (!clusterName) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">No cluster selected</div>
  }

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
        <div className="flex gap-2"><div className="h-9 w-28 bg-secondary rounded-lg" /></div>
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
      {/* Overview Stats */}
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
        <button onClick={() => navigateToResourceTree('nodes')}
          className="p-4 rounded-lg bg-card/50 border border-border text-left hover:bg-card hover:border-primary/50 transition-colors cursor-pointer w-full">
          <div className="text-sm text-muted-foreground mb-2">{t('common.nodes')}</div>
          <div className="text-2xl font-bold text-foreground">{health?.nodeCount || 0}</div>
          <div className="text-xs text-green-400">{health?.readyNodes || 0} ready</div>
        </button>
        <button onClick={() => navigateToResourceTree('workloads')}
          className="p-4 rounded-lg bg-card/50 border border-border text-left hover:bg-card hover:border-primary/50 transition-colors cursor-pointer w-full">
          <div className="text-sm text-muted-foreground mb-2">{t('common.pods')}</div>
          <div className="text-2xl font-bold text-foreground">{health?.podCount || 0}</div>
        </button>
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

      {/* Issues + Namespaces with Activity */}
      <ClusterIssuesSection
        podIssues={podIssues}
        clusterDeploymentIssues={clusterDeploymentIssues}
        namespaces={namespaces}
        effectiveClusterName={effectiveClusterName}
        drillToPod={drillToPod}
        drillToNamespace={drillToNamespace}
      />

      {/* GPU Nodes */}
      {clusterGPUNodes.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">GPU Nodes ({clusterGPUNodes.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {clusterGPUNodes.map((node, i) => (
              <div key={i}
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

      {/* Tabs for Events and Resources */}
      <div ref={resourceTreeRef} className="border-t border-border pt-4">
        <div className="border-b border-border mb-4">
          <div className="flex gap-0">
            {([
              { id: 'events' as ClusterTab, label: t('drilldown.fields.recentEvents'), count: clusterEvents.length },
              { id: 'resources' as ClusterTab, label: 'Resource Tree', count: issueCounts.total > 0 ? issueCounts.total : undefined },
            ]).map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'text-primary border-primary'
                    : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border'
                )}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full',
                    activeTab === tab.id ? 'bg-primary/20 text-primary'
                      : tab.id === 'resources' ? 'bg-red-500/20 text-red-400' : 'bg-secondary text-muted-foreground'
                  )}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'events' && (
          <ClusterEventsTab
            clusterEvents={clusterEvents}
            eventsLoading={eventsLoading}
            effectiveClusterName={effectiveClusterName}
            drillToEvents={drillToEvents}
          />
        )}

        {activeTab === 'resources' && (
          <ClusterResourceTree
            activeLens={activeLens}
            setActiveLens={setActiveLens}
            searchFilter={searchFilter}
            setSearchFilter={setSearchFilter}
            expandedSections={expandedSections}
            toggleSection={toggleSection}
            filteredNodes={filteredNodes}
            filteredNamespaces={filteredNamespaces}
            filteredNamespaceStats={filteredNamespaceStats}
            filteredPVCs={filteredPVCs}
            filteredServices={filteredServices}
            issueCounts={issueCounts}
            namespaceResources={namespaceResources}
            podIssues={podIssues}
            unhealthyDeployments={unhealthyDeployments}
            health={health}
            clusterDisplayName={clusterDisplayName}
            effectiveClusterName={effectiveClusterName}
            hasVisibleResourceData={hasVisibleResourceData}
            drillToNode={drillToNode}
            drillToNamespace={drillToNamespace}
            drillToPod={drillToPod}
          />
        )}
      </div>
    </div>
  )
}
