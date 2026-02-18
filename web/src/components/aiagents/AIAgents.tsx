import { useCallback } from 'react'
import { useKagentiSummary } from '../../hooks/mcp/kagenti'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards'
import { getDefaultCards } from '../../config/dashboards'
import { useTranslation } from 'react-i18next'

const AI_AGENTS_CARDS_KEY = 'kubestellar-aiagents-cards'

const DEFAULT_AIAGENTS_CARDS = getDefaultCards('ai-agents')

export function AIAgents() {
  const { t } = useTranslation('common')
  const { summary, isLoading, refetch, error } = useKagentiSummary()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

  const hasData = !!summary && summary.agentCount > 0
  const isDemoData = !hasData && !isLoading

  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    if (!summary) return { value: '-' }
    switch (blockId) {
      case 'agents':
        return { value: summary.agentCount, sublabel: `${summary.readyAgents} ready`, isClickable: false, isDemo: isDemoData }
      case 'tools':
        return { value: summary.toolCount, sublabel: 'MCP tools', isClickable: false, isDemo: isDemoData }
      case 'builds':
        return { value: summary.buildCount, sublabel: `${summary.activeBuilds} active`, isClickable: false, isDemo: isDemoData }
      case 'clusters':
        return { value: summary.clusterBreakdown.length, sublabel: 'with kagenti', isClickable: false, isDemo: isDemoData }
      case 'spiffe':
        const pct = summary.spiffeTotal > 0 ? Math.round((summary.spiffeBound / summary.spiffeTotal) * 100) : 0
        return { value: `${pct}%`, sublabel: 'SPIFFE coverage', isClickable: false, isDemo: isDemoData }
      default:
        return { value: '-' }
    }
  }, [summary, isDemoData])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  return (
    <DashboardPage
      title={t('aiAgents.title')}
      subtitle={t('aiAgents.subtitle')}
      icon="Bot"
      storageKey={AI_AGENTS_CARDS_KEY}
      defaultCards={DEFAULT_AIAGENTS_CARDS}
      statsType="ai-agents"
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={isLoading}
      isRefreshing={false}
      lastUpdated={null}
      hasData={hasData}
      isDemoData={isDemoData}
      emptyState={{
        title: t('aiAgents.emptyStateTitle'),
        description: t('aiAgents.emptyStateDescription'),
      }}
    >
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
          <div className="font-medium">{t('aiAgents.errorLoading')}</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      )}
    </DashboardPage>
  )
}
