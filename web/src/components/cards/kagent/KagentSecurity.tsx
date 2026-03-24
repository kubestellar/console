import { useMemo } from 'react'
import { Shield, ShieldCheck, ShieldAlert, AlertTriangle, Lock } from 'lucide-react'
import { useKagentCRDAgents, useKagentCRDTools } from '../../../hooks/mcp/kagent_crds'
import { useCardLoadingState } from '../CardDataContext'
import { useTranslation } from 'react-i18next'

export function KagentSecurity({ config }: { config?: Record<string, unknown> }) {
  const { t: _t } = useTranslation()
  const cluster = config?.cluster as string | undefined
  const {
    data: agents,
    isLoading: agentsLoading,
    isDemoFallback: agentsDemo,
  } = useKagentCRDAgents({ cluster })
  const {
    data: tools,
    isLoading: toolsLoading,
    isDemoFallback: toolsDemo,
  } = useKagentCRDTools({ cluster })

  const hasData = agents.length > 0 || tools.length > 0
  useCardLoadingState({
    isLoading: (agentsLoading || toolsLoading) && !hasData,
    hasAnyData: hasData,
    isDemoData: agentsDemo || toolsDemo,
  })

  const stats = useMemo(() => {
    const totalAgents = agents.length
    const declarative = agents.filter(a => a.agentType === 'Declarative').length
    const byo = agents.filter(a => a.agentType === 'BYO').length
    const declarativePct = totalAgents > 0 ? Math.round((declarative / totalAgents) * 100) : 0

    // Agents with tool bindings (toolCount > 0 means they have tool access requiring approval consideration)
    const agentsWithTools = agents.filter(a => a.toolCount > 0).length

    // Model config refs (agents with modelConfigRef means they have API key configured)
    const agentsWithModel = agents.filter(a => a.modelConfigRef).length
    const modelAuthPct = totalAgents > 0 ? Math.round((agentsWithModel / totalAgents) * 100) : 0

    // Tool servers with URLs (remote servers that may need credential config)
    const remoteTools = tools.filter(t => t.kind === 'RemoteMCPServer').length
    const readyTools = tools.filter(t => t.status === 'Ready').length

    return {
      totalAgents,
      declarative,
      byo,
      declarativePct,
      agentsWithTools,
      agentsWithModel,
      modelAuthPct,
      remoteTools,
      readyTools,
      totalTools: tools.length,
    }
  }, [agents, tools])

  const byoAgents = useMemo(() =>
    agents.filter(a => a.agentType === 'BYO'),
  [agents])

  if ((agentsLoading || toolsLoading) && !hasData) {
    return (
      <div className="h-full flex flex-col min-h-card p-4 animate-pulse space-y-4">
        <div className="h-24 bg-secondary rounded-lg" />
        <div className="h-16 bg-secondary rounded-lg" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card p-3 space-y-3">
      {/* Agent Type Coverage */}
      <div className="rounded-lg border border-border bg-secondary p-3">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-blue-400" />
          <span className="text-sm text-foreground font-medium">Agent Type Coverage</span>
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${stats.declarativePct >= 80 ? 'bg-green-500' : stats.declarativePct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${stats.declarativePct}%` }}
            />
          </div>
          <span className="text-lg font-bold text-white">{stats.declarativePct}%</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded bg-green-400/10 py-1.5">
            <div className="text-sm font-bold text-green-400">{stats.declarative}</div>
            <div className="text-xs text-muted-foreground">Declarative</div>
          </div>
          <div className="rounded bg-yellow-400/10 py-1.5">
            <div className="text-sm font-bold text-yellow-400">{stats.byo}</div>
            <div className="text-xs text-muted-foreground">BYO</div>
          </div>
        </div>
      </div>

      {/* Model Auth Status */}
      <div className="rounded-lg border border-border bg-secondary p-3">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="w-4 h-4 text-blue-400" />
          <span className="text-sm text-foreground font-medium">Model Auth Status</span>
        </div>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${stats.modelAuthPct >= 80 ? 'bg-green-500' : stats.modelAuthPct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${stats.modelAuthPct}%` }}
            />
          </div>
          <span className="text-sm font-bold text-white">{stats.modelAuthPct}%</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {stats.agentsWithModel}/{stats.totalAgents} agents with model config
        </div>
      </div>

      {/* Tool Server Status */}
      <div className="px-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Tool Servers</div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded bg-cyan-400/10 py-1.5">
            <div className="text-sm font-bold text-cyan-400">{stats.readyTools}/{stats.totalTools}</div>
            <div className="text-xs text-muted-foreground">Ready</div>
          </div>
          <div className="rounded bg-purple-400/10 py-1.5">
            <div className="text-sm font-bold text-purple-400">{stats.remoteTools}</div>
            <div className="text-xs text-muted-foreground">Remote</div>
          </div>
        </div>
      </div>

      {/* BYO Agent Warnings */}
      {byoAgents.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-xs text-yellow-400 font-medium">BYO Agents (Less Controlled)</span>
          </div>
          <div className="space-y-1">
            {byoAgents.map(agent => (
              <div key={`${agent.cluster}-${agent.name}`} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-yellow-400/5 border border-yellow-400/10">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="w-3 h-3 text-yellow-400" />
                  <span className="text-foreground">{agent.name}</span>
                </div>
                <span className="text-muted-foreground truncate max-w-[80px]">{agent.cluster}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Declarative */}
      {byoAgents.length === 0 && stats.totalAgents > 0 && (
        <div className="flex items-center gap-2 text-xs text-green-400 bg-green-400/5 rounded-lg p-3 border border-green-400/10">
          <ShieldCheck className="w-4 h-4" />
          <span>All {stats.totalAgents} agents are Declarative (fully managed)</span>
        </div>
      )}

      {stats.totalAgents === 0 && stats.totalTools === 0 && (
        <div className="text-center py-6 text-muted-foreground text-xs">No kagent resources found</div>
      )}
    </div>
  )
}
