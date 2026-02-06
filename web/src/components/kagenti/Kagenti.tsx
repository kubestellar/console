import { useCallback, useMemo } from 'react'
import { useKagentiAgents, useKagentiBuilds, useKagentiTools } from '../../hooks/useMCP'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'

const KAGENTI_CARDS_KEY = 'kubestellar-kagenti-cards'

const DEFAULT_KAGENTI_CARDS = getDefaultCards('kagenti')

export function Kagenti() {
  const { data: agents, isLoading: agentsLoading, refetch: refetchAgents } = useKagentiAgents()
  const { data: builds, isLoading: buildsLoading } = useKagentiBuilds()
  const { data: tools, isLoading: toolsLoading } = useKagentiTools()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

  const isLoading = agentsLoading || buildsLoading || toolsLoading
  const hasRealData = agents.length > 0 || builds.length > 0 || tools.length > 0
  const isDemoData = !hasRealData && !isLoading

  const readyAgents = useMemo(() =>
    agents.filter(a => a.status === 'Running' || a.status === 'Ready').length,
    [agents],
  )
  const activeBuilds = useMemo(() =>
    builds.filter(b => b.status === 'Building' || b.status === 'Pending').length,
    [builds],
  )
  const clustersWithKagenti = useMemo(() =>
    new Set(agents.map(a => a.cluster)).size,
    [agents],
  )

  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'agents':
        return { value: agents.length, sublabel: 'total agents', isClickable: false, isDemo: isDemoData }
      case 'ready_agents':
        return { value: readyAgents, sublabel: 'ready', isClickable: false, isDemo: isDemoData }
      case 'active_builds':
        return { value: activeBuilds, sublabel: 'building', isClickable: false, isDemo: isDemoData }
      case 'tools':
        return { value: tools.length, sublabel: 'MCP tools', isClickable: false, isDemo: isDemoData }
      case 'clusters_with_kagenti':
        return { value: clustersWithKagenti, sublabel: 'clusters', isClickable: false, isDemo: isDemoData }
      default:
        return { value: '-' }
    }
  }, [agents, readyAgents, activeBuilds, tools, clustersWithKagenti, isDemoData])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue],
  )

  return (
    <DashboardPage
      title="AI Agents"
      subtitle="Kagenti agent deployment, builds, and MCP tools"
      icon="Bot"
      storageKey={KAGENTI_CARDS_KEY}
      defaultCards={DEFAULT_KAGENTI_CARDS}
      statsType="kagenti"
      getStatValue={getStatValue}
      onRefresh={refetchAgents}
      isLoading={isLoading}
      hasData={hasRealData}
      isDemoData={isDemoData}
      emptyState={{
        title: 'AI Agents Dashboard',
        description: 'Add cards to monitor kagenti agents, builds, MCP tools, and security posture across your clusters.',
      }}
    />
  )
}
