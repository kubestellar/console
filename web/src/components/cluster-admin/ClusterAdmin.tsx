import { useCallback } from 'react'
import { useClusters } from '../../hooks/useMCP'
import { useCachedPodIssues, useCachedWarningEvents, useCachedNodes } from '../../hooks/useCachedData'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards'
import { getDefaultCards } from '../../config/dashboards'

const STORAGE_KEY = 'kubestellar-cluster-admin-cards'
const DEFAULT_CARDS = getDefaultCards('cluster-admin')

export function ClusterAdmin() {
  const { clusters, isLoading, isRefreshing, lastUpdated, refetch, error } = useClusters()
  const { issues: podIssues } = useCachedPodIssues()
  const { events: warningEvents } = useCachedWarningEvents()
  const { nodes } = useCachedNodes()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

  const reachable = clusters.filter(c => c.reachable !== false)
  const healthy = reachable.filter(c => c.healthy === true)
  const degraded = reachable.filter(c => c.healthy === false)
  const offline = clusters.filter(c => c.reachable === false)
  const hasData = clusters.length > 0
  const isDemoData = !hasData && !isLoading

  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'clusters': return { value: reachable.length, sublabel: 'reachable', isDemo: isDemoData }
      case 'healthy': return { value: healthy.length, sublabel: 'healthy', isDemo: isDemoData }
      case 'degraded': return { value: degraded.length, sublabel: 'degraded', isDemo: isDemoData }
      case 'offline': return { value: offline.length, sublabel: 'offline', isDemo: isDemoData }
      case 'nodes': return { value: nodes.length, sublabel: 'total nodes', isDemo: isDemoData }
      case 'warnings': return { value: warningEvents.length, sublabel: 'warnings', isDemo: isDemoData }
      case 'pod_issues': return { value: podIssues.length, sublabel: 'pod issues', isDemo: isDemoData }
      case 'alerts_firing': return { value: '-', sublabel: 'firing', isDemo: isDemoData }
      default: return { value: '-' }
    }
  }, [reachable, healthy, degraded, offline, nodes, warningEvents, podIssues, isDemoData])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  return (
    <DashboardPage
      title="Cluster Admin"
      subtitle="Multi-cluster operations, health, and infrastructure management"
      icon="ShieldAlert"
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
        description: 'Add cards to manage cluster health, node operations, upgrades, and security across your infrastructure.',
      }}
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
