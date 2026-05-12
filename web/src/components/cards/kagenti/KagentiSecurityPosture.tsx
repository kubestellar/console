import { useMemo } from 'react'
import { Shield, ShieldAlert, ShieldCheck, Lock, Unlock, Bot } from 'lucide-react'
import { useKagentiCards, useKagentiAgents, useKagentiTools } from '../../../hooks/useMCP'
import { useCardLoadingState } from '../CardDataContext'
import { Skeleton } from '../../ui/Skeleton'
import { useDemoMode } from '../../../hooks/useDemoMode'

interface KagentiSecurityPostureProps {
  config?: { cluster?: string }
}

// issue 6446 — `identityBinding` is a string enum (`'strict' | 'permissive'
// | 'none'`). Treating any truthy string as "bound" inflates the count
// because the sentinel value `'none'` is truthy. Only these values count
// as "bound". Hoisted to module scope so the useMemo dep array stays
// stable.
const BOUND_IDENTITY_STATES = new Set(['strict', 'permissive'])

export function KagentiSecurityPosture({ config }: KagentiSecurityPostureProps) {
  const { isDemoMode } = useDemoMode()
  const {
    data: cards,
    isLoading: cardsLoading,
    isRefreshing: cardsRefreshing,
    consecutiveFailures: cardFailures,
    isDemoFallback: cardsDemoFallback,
  } = useKagentiCards({ cluster: config?.cluster })

  const {
    data: agents,
    isLoading: agentsLoading,
    isRefreshing: agentsRefreshing,
    consecutiveFailures: agentFailures,
    isDemoFallback: agentsDemoFallback,
  } = useKagentiAgents({ cluster: config?.cluster })

  const {
    data: tools,
    isLoading: toolsLoading,
    isRefreshing: toolsRefreshing,
    consecutiveFailures: toolFailures,
    isDemoFallback: toolsDemoFallback,
  } = useKagentiTools({ cluster: config?.cluster })

  const isLoading = cardsLoading || agentsLoading || toolsLoading
  const hasAnyData = cards.length > 0 || agents.length > 0 || tools.length > 0
  const maxFailures = Math.max(cardFailures, agentFailures, toolFailures)

  // issue 6447 — Demo state must reflect BOTH global demo mode AND any
  // per-hook demo fallback (the card shows fallback demo data when the
  // backend is unreachable). Before this fix, the yellow outline / Demo
  // badge was missing whenever the global demo mode was off but one of
  // the hooks had fallen back to demo data. See
  // memory/console-isDemoData-wiring.md for the canonical pattern.
  const anyDemoFallback =
    cardsDemoFallback || agentsDemoFallback || toolsDemoFallback

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing: cardsRefreshing || agentsRefreshing || toolsRefreshing,
    hasAnyData,
    isFailed: maxFailures >= 3,
    consecutiveFailures: maxFailures,
    isDemoData: isDemoMode || anyDemoFallback,
  })

  const security = useMemo(() => {
    const isBound = (v: string | undefined) =>
      !!v && BOUND_IDENTITY_STATES.has(v)
    const boundCards = cards.filter(c => isBound(c.identityBinding))
    const unboundCards = cards.filter(c => !isBound(c.identityBinding))
    const credentialedTools = tools.filter(t => t.hasCredential)
    const uncredentialedTools = tools.filter(t => !t.hasCredential)

    const totalAgents = agents.length
    const agentsWithCards = new Set(cards.map(c => `${c.cluster}/${c.agentName}`))
    const agentsWithIdentity = agents.filter(a => agentsWithCards.has(`${a.cluster}/${a.name}`)).length

    // Compute a simple score (0-100)
    let score = 0
    let checks = 0
    if (totalAgents > 0) {
      score += (agentsWithIdentity / totalAgents) * 40
      checks++
    }
    if (cards.length > 0) {
      score += (boundCards.length / cards.length) * 30
      checks++
    }
    if (tools.length > 0) {
      score += (credentialedTools.length / tools.length) * 30
      checks++
    }
    if (checks > 0) score = Math.round(score)

    return {
      boundCards: boundCards.length,
      unboundCards: unboundCards.length,
      credentialedTools: credentialedTools.length,
      uncredentialedTools: uncredentialedTools.length,
      agentsWithIdentity,
      totalAgents,
      score,
    }
  }, [cards, agents, tools])

  if (showSkeleton) {
    return (
      <div className="space-y-3 p-1">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Shield className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <div className="text-sm font-medium text-muted-foreground">No Security Data</div>
        <div className="text-xs text-muted-foreground/60 mt-1">Deploy kagenti agents to see security posture</div>
      </div>
    )
  }

  const scoreColor = security.score >= 80 ? 'text-green-400' : security.score >= 50 ? 'text-yellow-400' : 'text-red-400'
  const scoreBg = security.score >= 80 ? 'bg-green-500/10 border-green-500/20' : security.score >= 50 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-red-500/10 border-red-500/20'

  return (
    <div className="space-y-3 p-1">
      {/* Score */}
      <div className={`flex items-center gap-3 p-3 rounded-lg border ${scoreBg}`}>
        <ShieldCheck className={`w-8 h-8 ${scoreColor}`} />
        <div>
          <div className={`text-2xl font-bold ${scoreColor}`}>{security.score}%</div>
          <div className="text-xs text-muted-foreground">Security Score</div>
        </div>
      </div>

      {/* Identity binding */}
      <div className="px-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-1.5">SPIFFE Identity Binding</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
            <span className="flex-1 text-muted-foreground">Bound agents</span>
            <span className="text-green-400 font-medium">{security.boundCards}</span>
          </div>
          {security.unboundCards > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <ShieldAlert className="w-3.5 h-3.5 text-yellow-400" />
              <span className="flex-1 text-muted-foreground">Unbound agents</span>
              <span className="text-yellow-400 font-medium">{security.unboundCards}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs">
            <Bot className="w-3.5 h-3.5 text-purple-400" />
            <span className="flex-1 text-muted-foreground">Agents with identity</span>
            <span className="text-muted-foreground">{security.agentsWithIdentity}/{security.totalAgents}</span>
          </div>
        </div>
      </div>

      {/* Tool credentials */}
      <div className="px-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-1.5">Tool Credentials</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <Lock className="w-3.5 h-3.5 text-green-400" />
            <span className="flex-1 text-muted-foreground">With credentials</span>
            <span className="text-green-400 font-medium">{security.credentialedTools}</span>
          </div>
          {security.uncredentialedTools > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <Unlock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="flex-1 text-muted-foreground">Without credentials</span>
              <span className="text-muted-foreground">{security.uncredentialedTools}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
