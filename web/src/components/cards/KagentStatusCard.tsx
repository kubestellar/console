import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Wrench, Cpu, Server } from 'lucide-react'
import { useKagentCRDAgents, useKagentCRDTools, useKagentCRDModels } from '../../hooks/mcp/kagent_crds'
import { useCardLoadingState } from './CardDataContext'
import { Skeleton } from '../ui/Skeleton'

interface KagentStatusCardProps {
  config?: {
    cluster?: string
  }
}

const FAILURE_THRESHOLD = 3
const SKELETON_TILE_COUNT = 3
const DEFAULT_RUNTIME = 'byo'

// Metric tile
function MetricTile({ icon: Icon, label, value, sub, accent }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  sub?: string
  accent: string
}) {
  // Semantic muted tint — adapts to both light and dark themes.
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/50">
      <div className={`p-1.5 rounded-md ${accent}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-semibold leading-tight">{value}</div>
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
    </div>
  )
}

export function KagentStatusCard({ config }: KagentStatusCardProps) {
  const { t } = useTranslation('cards')
  const {
    data: agents,
    isLoading: agentsLoading,
    isRefreshing: agentsRefreshing,
    isDemoFallback: agentDemo,
    consecutiveFailures: agentFailures,
  } = useKagentCRDAgents({ cluster: config?.cluster })

  const {
    data: tools,
    isLoading: toolsLoading,
    isRefreshing: toolsRefreshing,
    isDemoFallback: toolDemo,
    consecutiveFailures: toolFailures,
  } = useKagentCRDTools({ cluster: config?.cluster })

  const {
    data: models,
    isLoading: modelsLoading,
    isRefreshing: modelsRefreshing,
    isDemoFallback: modelDemo,
    consecutiveFailures: modelFailures,
  } = useKagentCRDModels({ cluster: config?.cluster })

  const agentItems = agents || []
  const toolItems = tools || []
  const modelItems = models || []
  const isLoading = agentsLoading || toolsLoading || modelsLoading
  const isRefreshing = agentsRefreshing || toolsRefreshing || modelsRefreshing
  const hasAnyData = agentItems.length > 0 || toolItems.length > 0 || modelItems.length > 0
  const maxFailures = Math.max(agentFailures, toolFailures, modelFailures)

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing,
    hasAnyData,
    isFailed: maxFailures >= FAILURE_THRESHOLD,
    consecutiveFailures: maxFailures,
    isDemoData: agentDemo || toolDemo || modelDemo,
  })

  // Compute stats
  const stats = useMemo(() => {
    const readyAgents = agentItems.filter(a => a.status === 'Ready').length
    const totalDiscoveredTools = toolItems.reduce((sum, tool) => sum + (tool.discoveredTools?.length || 0), 0)
    const providerCount = new Set(modelItems.map(model => model.provider)).size

    // Runtime distribution
    const runtimes: Record<string, number> = {}
    for (const agent of agentItems) {
      const runtime = agent.runtime || DEFAULT_RUNTIME
      runtimes[runtime] = (runtimes[runtime] || 0) + 1
    }

    // Cluster distribution
    const clusterData: Record<string, { agents: number; tools: number; models: number }> = {}
    for (const agent of agentItems) {
      if (!clusterData[agent.cluster]) clusterData[agent.cluster] = { agents: 0, tools: 0, models: 0 }
      clusterData[agent.cluster].agents++
    }
    for (const tool of toolItems) {
      if (!clusterData[tool.cluster]) clusterData[tool.cluster] = { agents: 0, tools: 0, models: 0 }
      clusterData[tool.cluster].tools++
    }
    for (const model of modelItems) {
      if (!clusterData[model.cluster]) clusterData[model.cluster] = { agents: 0, tools: 0, models: 0 }
      clusterData[model.cluster].models++
    }

    return { readyAgents, totalDiscoveredTools, providerCount, runtimes, clusterData }
  }, [agentItems, toolItems, modelItems])

  if (showSkeleton) {
    return (
      <div className="space-y-3 p-1">
        <div className="grid grid-cols-2 @md:grid-cols-3 gap-2">
          {Array.from({ length: SKELETON_TILE_COUNT }, (_, index) => (
            <Skeleton key={index} className="h-16 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Bot className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <div className="text-sm font-medium text-muted-foreground">{t('kagent.emptyTitle')}</div>
        <div className="text-xs text-muted-foreground mt-1 max-w-[200px]">
          {t('kagent.emptyDescription')}
        </div>
      </div>
    )
  }

  const runtimeEntries = Object.entries(stats.runtimes).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-3 p-1">
      {/* Metric tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-3 gap-2">
        <MetricTile
          icon={Bot}
          label={t('kagent.agents')}
          value={agentItems.length}
          sub={t('kagent.readyCount', { count: stats.readyAgents })}
          accent="bg-blue-500/20 text-blue-400"
        />
        <MetricTile
          icon={Wrench}
          label={t('kagent.toolServers')}
          value={toolItems.length}
          sub={t('kagent.toolCount', { count: stats.totalDiscoveredTools })}
          accent="bg-cyan-500/20 text-cyan-400"
        />
        <MetricTile
          icon={Cpu}
          label={t('kagent.modelConfigs')}
          value={modelItems.length}
          sub={t('kagent.providerCount', { count: stats.providerCount })}
          accent="bg-emerald-500/20 text-emerald-400"
        />
      </div>

      {/* Runtime distribution */}
      {runtimeEntries.length > 0 && (
        <div className="px-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{t('kagent.runtimes')}</div>
          <div className="space-y-1">
            {runtimeEntries.map(([runtime, count]) => (
              <div key={runtime} className="flex items-center gap-2">
                <div className="text-sm text-muted-foreground w-20 truncate">{runtime === DEFAULT_RUNTIME ? t('kagent.byo') : runtime}</div>
                {/* Semantic muted tint on progress track — adapts to both themes. */}
                <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500/60"
                    style={{ width: `${agentItems.length > 0 ? (count / agentItems.length) * 100 : 0}%` }}
                  />
                </div>
                <div className="text-sm text-muted-foreground w-6 text-right">{count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cluster breakdown */}
      {Object.keys(stats.clusterData).length > 0 && (
        <div className="px-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{t('kagent.clusters')}</div>
          <div className="space-y-1">
            {Object.entries(stats.clusterData).map(([cluster, counts]) => (
              <div key={cluster} className="flex items-center gap-2 text-sm">
                <Server className="w-3.5 h-3.5 text-muted-foreground/40" />
                <span className="text-muted-foreground truncate flex-1">{cluster}</span>
                <span className="text-blue-400">{t('kagent.agentCount', { count: counts.agents })}</span>
                <span className="text-cyan-400">{t('kagent.toolCount', { count: counts.tools })}</span>
                <span className="text-emerald-400">{t('kagent.modelCount', { count: counts.models })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
