import { Shield, ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react'
import { useKagentiCards, type KagentiCard } from '../../../hooks/mcp/kagenti'
import { useCardLoadingState } from '../CardDataContext'

export function KagentiSecurity({ config }: { config?: Record<string, unknown> }) {
  const cluster = config?.cluster as string | undefined
  const { data: cards, isLoading, isRefreshing, isDemoFallback } = useKagentiCards({ cluster })

  const hasData = cards.length > 0
  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoFallback })

  const stats = (() => {
    const total = cards.length
    const strict = cards.filter((c: KagentiCard) => c.identityBinding === 'strict').length
    const permissive = cards.filter((c: KagentiCard) => c.identityBinding === 'permissive').length
    const unbound = cards.filter((c: KagentiCard) => c.identityBinding === 'none').length
    const bound = strict + permissive
    const pct = total > 0 ? Math.round((bound / total) * 100) : 0
    return { total, strict, permissive, unbound, bound, pct }
  })()

  const unboundAgents = cards.filter((c: KagentiCard) => c.identityBinding === 'none')

  if (isLoading && !hasData) {
    return (
      <div className="h-full flex flex-col min-h-card p-4 animate-pulse space-y-4">
        <div className="h-24 bg-secondary rounded-lg" />
        <div className="h-16 bg-secondary rounded-lg" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card p-3 space-y-3">
      {/* SPIFFE Coverage */}
      <div className="rounded-lg border border-border bg-secondary p-3">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-purple-400" />
          <span className="text-sm text-foreground font-medium">SPIFFE Identity Coverage</span>
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${stats.pct >= 80 ? 'bg-green-500' : stats.pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${stats.pct}%` }}
            />
          </div>
          <span className="text-lg font-bold text-white">{stats.pct}%</span>
        </div>
        <div className="grid grid-cols-2 @md:grid-cols-3 gap-2 text-center">
          <div className="rounded bg-green-400/10 py-1.5">
            <div className="text-sm font-bold text-green-400">{stats.strict}</div>
            <div className="text-xs text-muted-foreground">Strict</div>
          </div>
          <div className="rounded bg-yellow-400/10 py-1.5">
            <div className="text-sm font-bold text-yellow-400">{stats.permissive}</div>
            <div className="text-xs text-muted-foreground">Permissive</div>
          </div>
          <div className="rounded bg-red-400/10 py-1.5">
            <div className="text-sm font-bold text-red-400">{stats.unbound}</div>
            <div className="text-xs text-muted-foreground">Unbound</div>
          </div>
        </div>
      </div>

      {/* Unbound warnings */}
      {unboundAgents.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs text-red-400 font-medium">Agents Without Identity Binding</span>
          </div>
          <div className="space-y-1">
            {unboundAgents.map((agent: KagentiCard) => (
              // issue 6449 — include namespace in the React key to avoid
              // collisions when two cards share the same name across
              // namespaces on the same cluster.
              <div key={`${agent.cluster}:${agent.namespace}:${agent.name}`} className="flex flex-wrap items-center justify-between gap-y-2 text-xs py-1 px-2 rounded bg-red-400/5 border border-red-400/10">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="w-3 h-3 text-red-400" />
                  <span className="text-foreground">{agent.agentName}</span>
                </div>
                <span className="text-muted-foreground truncate max-w-[80px]">{agent.cluster}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All bound */}
      {unboundAgents.length === 0 && stats.total > 0 && (
        <div className="flex items-center gap-2 text-xs text-green-400 bg-green-400/5 rounded-lg p-3 border border-green-400/10">
          <ShieldCheck className="w-4 h-4" />
          <span>All {stats.total} agents have SPIFFE identity binding</span>
        </div>
      )}

      {stats.total === 0 && (
        <div className="text-center py-6 text-muted-foreground text-xs">No AgentCards found</div>
      )}
    </div>
  )
}
