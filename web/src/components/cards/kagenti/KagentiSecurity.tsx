import { useMemo } from 'react'
import { Shield, ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react'
import { useKagentiCards, type KagentiCard } from '../../../hooks/mcp/kagenti'
import { useCardLoadingState } from '../CardDataContext'
import { useTranslation } from 'react-i18next'

export function KagentiSecurity({ config }: { config?: Record<string, unknown> }) {
  const { t: _t } = useTranslation()
  const cluster = config?.cluster as string | undefined
  const { data: cards, isLoading } = useKagentiCards({ cluster })

  useCardLoadingState({
    isLoading,
    hasAnyData: cards.length > 0,
  })

  const stats = useMemo(() => {
    const total = cards.length
    const strict = cards.filter((c: KagentiCard) => c.identityBinding === 'strict').length
    const permissive = cards.filter((c: KagentiCard) => c.identityBinding === 'permissive').length
    const unbound = cards.filter((c: KagentiCard) => c.identityBinding === 'none').length
    const bound = strict + permissive
    const pct = total > 0 ? Math.round((bound / total) * 100) : 0
    return { total, strict, permissive, unbound, bound, pct }
  }, [cards])

  const unboundAgents = useMemo(() =>
    cards.filter((c: KagentiCard) => c.identityBinding === 'none'),
  [cards])

  if (isLoading) {
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
          <Shield className="w-4 h-4 text-violet-400" />
          <span className="text-sm text-foreground font-medium">SPIFFE Identity Coverage</span>
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${stats.pct >= 80 ? 'bg-emerald-500' : stats.pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${stats.pct}%` }}
            />
          </div>
          <span className="text-lg font-bold text-white">{stats.pct}%</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded bg-emerald-400/10 py-1.5">
            <div className="text-sm font-bold text-emerald-400">{stats.strict}</div>
            <div className="text-xs text-muted-foreground">Strict</div>
          </div>
          <div className="rounded bg-amber-400/10 py-1.5">
            <div className="text-sm font-bold text-amber-400">{stats.permissive}</div>
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
              <div key={`${agent.cluster}-${agent.name}`} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-red-400/5 border border-red-400/10">
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
        <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/5 rounded-lg p-3 border border-emerald-400/10">
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
