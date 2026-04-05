import { useCallback, useState } from 'react'
import { useKagentiSummary } from '../../hooks/mcp/kagenti'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards'
import { useTranslation } from 'react-i18next'
import { AgentIcon } from '../agent/AgentIcon'
import { ExternalLink } from 'lucide-react'
import { aiAgentsDashboardConfig } from '../../config/dashboards/ai-agents'
import { RotatingTip } from '../ui/RotatingTip'

const STORAGE_KEYS: Record<string, string> = {
  kagenti: 'kubestellar-aiagents-kagenti-cards',
  kagent: 'kubestellar-aiagents-kagent-cards',
}

// Build default cards per tab from config
function getTabDefaultCards(tabId: string) {
  const tab = aiAgentsDashboardConfig.tabs?.find(t => t.id === tabId)
  if (!tab) return []
  return tab.cards.map(card => ({
    type: card.cardType,
    title: card.title,
    position: { w: card.position?.w || 4, h: card.position?.h || 2 },
  }))
}

export function AIAgents() {
  const { t } = useTranslation('common')
  const { summary, isLoading, isDemoData: hookIsDemoData, refetch, error } = useKagentiSummary()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()
  const tabs = aiAgentsDashboardConfig.tabs || []
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || 'kagenti')

  const hasData = !!summary && summary.agentCount > 0
  const isDemoData = hookIsDemoData || (!hasData && !isLoading)

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
      case 'spiffe': {
        const pct = summary.spiffeTotal > 0 ? Math.round((summary.spiffeBound / summary.spiffeTotal) * 100) : 0
        return { value: `${pct}%`, sublabel: 'SPIFFE coverage', isClickable: false, isDemo: isDemoData }
      }
      default:
        return { value: '-' }
    }
  }, [summary, isDemoData])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  const tabBar = tabs.length > 0 ? (
    <div className="flex items-center gap-1 mb-6 border-b border-border">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => !tab.disabled && setActiveTab(tab.id)}
          disabled={tab.disabled}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === tab.id
              ? 'border-purple-500 text-foreground'
              : tab.disabled
                ? 'border-transparent text-muted-foreground/40 cursor-not-allowed'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          {tab.icon && <AgentIcon provider={tab.icon} className="w-4 h-4" />}
          {tab.label}
          {tab.disabled && tab.installUrl && (
            <a
              href={tab.installUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 text-xs text-muted-foreground/60 hover:text-muted-foreground ml-1"
            >
              Install <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </button>
      ))}
    </div>
  ) : null

  return (
    <DashboardPage
      key={activeTab}
      title={t('aiAgents.title')}
      subtitle={t('aiAgents.subtitle')}
      icon="Bot"
      rightExtra={<RotatingTip page="ai-agents" />}
      storageKey={STORAGE_KEYS[activeTab] || 'kubestellar-aiagents-cards'}
      defaultCards={getTabDefaultCards(activeTab)}
      statsType="ai-agents"
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={isLoading}
      isRefreshing={false}
      lastUpdated={null}
      hasData={hasData}
      isDemoData={isDemoData}
      beforeCards={tabBar}
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
