import { useMemo } from 'react'
import { Bot, Wrench, Cpu, Server } from 'lucide-react'
import { useKagentCRDAgents, useKagentCRDTools, useKagentCRDModels } from '../../hooks/mcp/kagent_crds'
import { useCardLoadingState } from './CardDataContext'
import { Skeleton } from '../ui/Skeleton'

interface KagentStatusCardProps {
  config?: {
    cluster?: string
  }
}

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

  const isLoading = agentsLoading || toolsLoading || modelsLoading
  const isRefreshing = agentsRefreshing || toolsRefreshing || modelsRefreshing
  const hasAnyData = agents.length > 0 || tools.length > 0 || models.length > 0
  const maxFailures = Math.max(agentFailures, toolFailures, modelFailures)

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing,
    hasAnyData,
    isFailed: maxFailures >= 3,
    consecutiveFailures: maxFailures,
    isDemoData: agentDemo || toolDemo || modelDemo,
  })

  // Compute stats
  const stats = useMemo(() => {
    const readyAgents = agents.filter(a => a.status === 'Ready').length
    const totalDiscoveredTools = tools.reduce((sum, t) => sum + (t.discoveredTools?.length || 0), 0)
    const providerCount = new Set(models.map(m => m.provider)).size

    // Runtime distribution
    const runtimes: Record<string, number> = {}
    for (const a of agents) {
      const rt = a.runtime || 'byo'
      runtimes[rt] = (runtimes[rt] || 0) + 1
    }

    // Cluster distribution
    const clusterData: Record<string, { agents: number; tools: number; models: number }> = {}
    for (const a of agents) {
      if (!clusterData[a.cluster]) clusterData[a.cluster] = { agents: 0, tools: 0, models: 0 }
      clusterData[a.cluster].agents++
    }
    for (const t of tools) {
      if (!clusterData[t.cluster]) clusterData[t.cluster] = { agents: 0, tools: 0, models: 0 }
      clusterData[t.cluster].tools++
    }
    for (const m of models) {
      if (!clusterData[m.cluster]) clusterData[m.cluster] = { agents: 0, tools: 0, models: 0 }
      clusterData[m.cluster].models++
    }

    return { readyAgents, totalDiscoveredTools, providerCount, runtimes, clusterData }
  }, [agents, tools, models])

  if (showSkeleton) {
    return (
      <div className="space-y-3 p-1">
        <div className="grid grid-cols-2 @md:grid-cols-3 gap-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
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
        <div className="text-sm font-medium text-muted-foreground">No Kagent CRDs Found</div>
        <div className="text-xs text-muted-foreground mt-1 max-w-[200px]">
          Install kagent to deploy AI agents on your clusters
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
          label="Agents"
          value={agents.length}
          sub={`${stats.readyAgents} ready`}
          accent="bg-blue-500/20 text-blue-400"
        />
        <MetricTile
          icon={Wrench}
          label="Tool Servers"
          value={tools.length}
          sub={`${stats.totalDiscoveredTools} tools`}
          accent="bg-cyan-500/20 text-cyan-400"
        />
        <MetricTile
          icon={Cpu}
          label="Model Configs"
          value={models.length}
          sub={`${stats.providerCount} provider${stats.providerCount !== 1 ? 's' : ''}`}
          accent="bg-emerald-500/20 text-emerald-400"
        />
      </div>

      {/* Runtime distribution */}
      {runtimeEntries.length > 0 && (
        <div className="px-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Runtimes</div>
          <div className="space-y-1">
            {runtimeEntries.map(([rt, count]) => (
              <div key={rt} className="flex items-center gap-2">
                <div className="text-sm text-muted-foreground w-20 truncate">{rt}</div>
                {/* Semantic muted tint on progress track — adapts to both themes. */}
                <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500/60"
                    style={{ width: `${(count / agents.length) * 100}%` }}
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
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Clusters</div>
          <div className="space-y-1">
            {Object.entries(stats.clusterData).map(([cluster, counts]) => (
              <div key={cluster} className="flex items-center gap-2 text-sm">
                <Server className="w-3.5 h-3.5 text-muted-foreground/40" />
                <span className="text-muted-foreground truncate flex-1">{cluster}</span>
                <span className="text-blue-400">{counts.agents} agents</span>
                <span className="text-cyan-400">{counts.tools} tools</span>
                <span className="text-emerald-400">{counts.models} models</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
