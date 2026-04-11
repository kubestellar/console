import { useEffect, useRef } from 'react'
import { useClusters } from '../../hooks/useMCP'
import { useCachedPodIssues, useCachedWarningEvents, useCachedNodes } from '../../hooks/useCachedData'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards'
import { getDefaultCards } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'
import { getClusterHealthState, isClusterUnreachable } from '../clusters/utils'

const STORAGE_KEY = 'kubestellar-cluster-admin-cards'
const DEFAULT_CARDS = getDefaultCards('cluster-admin')

export function ClusterAdmin() {
  const { clusters: rawClusters, isLoading, isRefreshing, lastUpdated, refetch, error } = useClusters()
  const { issues: rawPodIssues, isLoading: isLoadingPodIssues } = useCachedPodIssues()
  const { events: rawWarningEvents, isLoading: isLoadingWarnings } = useCachedWarningEvents()
  const { nodes: rawNodes, isLoading: isLoadingNodes } = useCachedNodes()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

  // Guard all arrays against undefined to prevent crashes when APIs return 404/500/empty
  const clusters = rawClusters || []
  const podIssues = rawPodIssues || []
  const warningEvents = rawWarningEvents || []
  const nodes = rawNodes || []

  // Stale-while-revalidate: remember the last non-zero values for Nodes/Warnings
  // so refreshes don't flash 0 → final value (issue #6485). During a refresh,
  // the underlying hooks briefly return empty arrays before the new fetch resolves.
  const lastNodeCountRef = useRef(0)
  const lastWarningCountRef = useRef(0)
  const lastPodIssueCountRef = useRef(0)
  useEffect(() => {
    if (!isLoadingNodes && nodes.length > 0) lastNodeCountRef.current = nodes.length
  }, [isLoadingNodes, nodes.length])
  useEffect(() => {
    if (!isLoadingWarnings && warningEvents.length > 0) lastWarningCountRef.current = warningEvents.length
  }, [isLoadingWarnings, warningEvents.length])
  useEffect(() => {
    if (!isLoadingPodIssues && podIssues.length > 0) lastPodIssueCountRef.current = podIssues.length
  }, [isLoadingPodIssues, podIssues.length])
  const displayNodeCount = nodes.length > 0 ? nodes.length : lastNodeCountRef.current
  const displayWarningCount = warningEvents.length > 0 ? warningEvents.length : lastWarningCountRef.current
  const displayPodIssueCount = podIssues.length > 0 ? podIssues.length : lastPodIssueCountRef.current

  // Use the centralised health state machine so these counts always agree
  // with the main cluster grid, sidebar stats and filter tabs (#5928).
  const reachable = clusters.filter(c => !isClusterUnreachable(c))
  const healthy = reachable.filter(c => getClusterHealthState(c) === 'healthy')
  const degraded = reachable.filter(c => getClusterHealthState(c) === 'unhealthy')
  const offline = clusters.filter(c => isClusterUnreachable(c))
  const hasData = clusters.length > 0
  const isDemoData = !hasData && !isLoading

  const getDashboardStatValue = (blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'clusters': return { value: reachable.length, sublabel: 'reachable', isDemo: isDemoData }
      case 'healthy': return { value: healthy.length, sublabel: 'healthy', isDemo: isDemoData }
      case 'degraded': return { value: degraded.length, sublabel: 'degraded', isDemo: isDemoData }
      case 'offline': return { value: offline.length, sublabel: 'offline', isDemo: isDemoData }
      case 'nodes': return { value: displayNodeCount, sublabel: 'total nodes', isDemo: isDemoData }
      case 'warnings': return { value: displayWarningCount, sublabel: 'warnings', isDemo: isDemoData }
      case 'pod_issues': return { value: displayPodIssueCount, sublabel: 'pod issues', isDemo: isDemoData }
      default: return { value: '-' }
    }
  }

  const getStatValue = (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId)

  return (
    <DashboardPage
      title="Cluster Admin"
      subtitle="Multi-cluster operations, health, and infrastructure management"
      icon="ShieldAlert"
      rightExtra={<RotatingTip page="cluster-admin" />}
      storageKey={STORAGE_KEY}
      defaultCards={DEFAULT_CARDS}
      statsType="cluster-admin"
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      lastUpdated={lastUpdated}
      hasData={hasData}
      isDemoData={isDemoData}
      emptyState={{
        title: 'Cluster Admin Dashboard',
        description: 'Add cards to manage cluster health, node operations, upgrades, and security across your infrastructure.' }}
    >
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
          <div className="font-medium">Error loading cluster data</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      )}
    </DashboardPage>
  )
}
