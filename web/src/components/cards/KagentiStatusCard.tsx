import { useMemo } from 'react'
import { Bot, Hammer, Wrench, Server } from 'lucide-react'
import { useKagentiAgents, useKagentiBuilds, useKagentiTools } from '../../hooks/useMCP'
import { useCardLoadingState } from './CardDataContext'
import { Skeleton } from '../ui/Skeleton'

interface KagentiStatusCardProps {
  config?: {
    cluster?: string
  }
}

// Status badge component
function StatusDot({ status }: { status: string }) {
  const color =
    status === 'Running' || status === 'Ready' || status === 'Succeeded' ? 'bg-emerald-400' :
    status === 'Building' || status === 'Pending' ? 'bg-amber-400' :
    status === 'Failed' ? 'bg-red-400' : 'bg-zinc-400'
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} />
}

// Metric tile
function MetricTile({ icon: Icon, label, value, sub, accent }: {
  icon: React.ElementType
  label: string
  value: number
  sub?: string
  accent: string
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/5">
      <div className={`p-1.5 rounded-md ${accent}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-semibold leading-tight">{value}</div>
        <div className="text-[10px] text-muted-foreground truncate">{label}</div>
        {sub && <div className="text-[10px] text-muted-foreground/60">{sub}</div>}
      </div>
    </div>
  )
}

export function KagentiStatusCard({ config }: KagentiStatusCardProps) {
  const {
    data: agents,
    isLoading: agentsLoading,
    consecutiveFailures: agentFailures,
  } = useKagentiAgents({ cluster: config?.cluster })

  const {
    data: builds,
    isLoading: buildsLoading,
    consecutiveFailures: buildFailures,
  } = useKagentiBuilds({ cluster: config?.cluster })

  const {
    data: tools,
    isLoading: toolsLoading,
    consecutiveFailures: toolFailures,
  } = useKagentiTools({ cluster: config?.cluster })

  const isLoading = agentsLoading || buildsLoading || toolsLoading
  const hasAnyData = agents.length > 0 || builds.length > 0 || tools.length > 0
  const maxFailures = Math.max(agentFailures, buildFailures, toolFailures)

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    hasAnyData,
    isFailed: maxFailures >= 3,
    consecutiveFailures: maxFailures,
  })

  // Compute stats
  const stats = useMemo(() => {
    const readyAgents = agents.filter(a => a.status === 'Running' || a.status === 'Ready').length
    const activeBuilds = builds.filter(b => b.status === 'Building' || b.status === 'Pending').length

    // Framework distribution
    const frameworks: Record<string, number> = {}
    for (const a of agents) {
      if (a.framework) {
        frameworks[a.framework] = (frameworks[a.framework] || 0) + 1
      }
    }

    // Cluster distribution
    const clusterAgents: Record<string, { agents: number; tools: number }> = {}
    for (const a of agents) {
      if (!clusterAgents[a.cluster]) clusterAgents[a.cluster] = { agents: 0, tools: 0 }
      clusterAgents[a.cluster].agents++
    }
    for (const t of tools) {
      if (!clusterAgents[t.cluster]) clusterAgents[t.cluster] = { agents: 0, tools: 0 }
      clusterAgents[t.cluster].tools++
    }

    return { readyAgents, activeBuilds, frameworks, clusterAgents }
  }, [agents, builds, tools])

  // Recent builds for list view
  const recentBuilds = useMemo(() => {
    return [...builds]
      .sort((a, b) => (b.startTime || '').localeCompare(a.startTime || ''))
      .slice(0, 5)
  }, [builds])

  if (showSkeleton) {
    return (
      <div className="space-y-3 p-1">
        <div className="grid grid-cols-3 gap-2">
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
        <div className="text-sm font-medium text-muted-foreground">No Kagenti Agents Found</div>
        <div className="text-xs text-muted-foreground/60 mt-1 max-w-[200px]">
          Install the kagenti-operator to deploy AI agents on your clusters
        </div>
      </div>
    )
  }

  const maxFramework = Object.entries(stats.frameworks).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-3 p-1">
      {/* Metric tiles */}
      <div className="grid grid-cols-3 gap-2">
        <MetricTile
          icon={Bot}
          label="Agents"
          value={agents.length}
          sub={`${stats.readyAgents} ready`}
          accent="bg-violet-500/20 text-violet-400"
        />
        <MetricTile
          icon={Wrench}
          label="MCP Tools"
          value={tools.length}
          accent="bg-cyan-500/20 text-cyan-400"
        />
        <MetricTile
          icon={Hammer}
          label="Builds"
          value={builds.length}
          sub={stats.activeBuilds > 0 ? `${stats.activeBuilds} active` : undefined}
          accent="bg-blue-500/20 text-blue-400"
        />
      </div>

      {/* Framework distribution */}
      {maxFramework.length > 0 && (
        <div className="px-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5">Frameworks</div>
          <div className="space-y-1">
            {maxFramework.slice(0, 4).map(([fw, count]) => (
              <div key={fw} className="flex items-center gap-2">
                <div className="text-xs text-muted-foreground w-20 truncate">{fw}</div>
                <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-violet-500/60"
                    style={{ width: `${(count / agents.length) * 100}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground/60 w-6 text-right">{count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cluster breakdown */}
      {Object.keys(stats.clusterAgents).length > 0 && (
        <div className="px-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5">Clusters</div>
          <div className="space-y-1">
            {Object.entries(stats.clusterAgents).map(([cluster, counts]) => (
              <div key={cluster} className="flex items-center gap-2 text-xs">
                <Server className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-muted-foreground truncate flex-1">{cluster}</span>
                <span className="text-violet-400">{counts.agents} agents</span>
                <span className="text-cyan-400">{counts.tools} tools</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent builds */}
      {recentBuilds.length > 0 && (
        <div className="px-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5">Recent Builds</div>
          <div className="space-y-1">
            {recentBuilds.map(b => (
              <div key={`${b.cluster}-${b.namespace}-${b.name}`} className="flex items-center gap-2 text-xs">
                <StatusDot status={b.status} />
                <span className="truncate flex-1 text-muted-foreground">{b.name}</span>
                <span className="text-muted-foreground/50">{b.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
