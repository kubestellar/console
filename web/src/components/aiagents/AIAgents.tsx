import { useState } from 'react'
import { useKagentiSummary } from '../../hooks/mcp/kagenti'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards'
import { useTranslation } from 'react-i18next'
import { AgentIcon } from '../agent/AgentIcon'
import { ExternalLink } from 'lucide-react'
import { Button } from '../ui/Button'
import { aiAgentsDashboardConfig } from '../../config/dashboards/ai-agents'
import { RotatingTip } from '../ui/RotatingTip'

const STORAGE_KEYS: Record<string, string> = {
  kagenti: 'kubestellar-aiagents-kagenti-cards',
  kagent: 'kubestellar-aiagents-kagent-cards' }

// Build default cards per tab from config
function getTabDefaultCards(tabId: string) {
  const tab = aiAgentsDashboardConfig.tabs?.find(t => t.id === tabId)
  if (!tab) return []
  return tab.cards.map(card => ({
    type: card.cardType,
    title: card.title,
    position: { w: card.position?.w || 4, h: card.position?.h || 2 } }))
}

export function AIAgents() {
  const { t } = useTranslation('common')
  const { summary, isLoading, isDemoData: hookIsDemoData, refetch, error } = useKagentiSummary()
  const tabs = aiAgentsDashboardConfig.tabs || []
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || 'kagenti')

  const hasData = !!summary && summary.agentCount > 0
  const isDemoData = hookIsDemoData || (!hasData && !isLoading)

  const getDashboardStatValue = (blockId: string): StatBlockValue => {
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
  }

  const getStatValue = getDashboardStatValue

  // Issue 8883: WAI-ARIA tablist keyboard navigation. ArrowLeft/Right move
  // between enabled tabs, Home/End jump to the first/last enabled tab,
  // Enter/Space activate. Roving tabindex is applied below.
  const enabledTabs = tabs.filter(t => !t.disabled)
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (enabledTabs.length === 0) return
    const currentIdx = enabledTabs.findIndex(t => t.id === activeTab)
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const delta = e.key === 'ArrowRight' ? 1 : -1
      const next = enabledTabs[(currentIdx + delta + enabledTabs.length) % enabledTabs.length]
      if (next) setActiveTab(next.id)
    } else if (e.key === 'Home') {
      e.preventDefault()
      if (enabledTabs[0]) setActiveTab(enabledTabs[0].id)
    } else if (e.key === 'End') {
      e.preventDefault()
      const last = enabledTabs[enabledTabs.length - 1]
      if (last) setActiveTab(last.id)
    }
  }

  const tabBar = tabs.length > 0 ? (
    <div className="flex items-center gap-1 mb-6 border-b border-border" role="tablist">
      {tabs.map(tab => (
        <Button
          key={tab.id}
          variant="ghost"
          size="md"
          onClick={() => !tab.disabled && setActiveTab(tab.id)}
          onKeyDown={handleTabKeyDown}
          disabled={tab.disabled}
          role="tab"
          aria-selected={activeTab === tab.id}
          tabIndex={activeTab === tab.id ? 0 : -1}
          className={`rounded-none border-b-2 -mb-px ${
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
        </Button>
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
        description: t('aiAgents.emptyStateDescription') }}
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
