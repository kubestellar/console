import { useMemo } from 'react'
import { Shield, ShieldAlert, ShieldCheck, Lock, Unlock, Bot } from 'lucide-react'
import { useKagentiCards, useKagentiAgents, useKagentiTools } from '../../../hooks/useMCP'
import { useCardLoadingState } from '../CardDataContext'
import { Skeleton } from '../../ui/Skeleton'

interface KagentiSecurityPostureProps {
  config?: { cluster?: string }
}

export function KagentiSecurityPosture({ config }: KagentiSecurityPostureProps) {
  const {
    data: cards,
    isLoading: cardsLoading,
    consecutiveFailures: cardFailures,
  } = useKagentiCards({ cluster: config?.cluster })

  const {
    data: agents,
    isLoading: agentsLoading,
    consecutiveFailures: agentFailures,
  } = useKagentiAgents({ cluster: config?.cluster })

  const {
    data: tools,
    isLoading: toolsLoading,
    consecutiveFailures: toolFailures,
  } = useKagentiTools({ cluster: config?.cluster })

  const isLoading = cardsLoading || agentsLoading || toolsLoading
  const hasAnyData = cards.length > 0 || agents.length > 0 || tools.length > 0
  const maxFailures = Math.max(cardFailures, agentFailures, toolFailures)

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    hasAnyData,
    isFailed: maxFailures >= 3,
    consecutiveFailures: maxFailures,
  })

  const security = useMemo(() => {
    const boundCards = cards.filter(c => c.identityBinding)
    const unboundCards = cards.filter(c => !c.identityBinding)
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

  const scoreColor = security.score >= 80 ? 'text-emerald-400' : security.score >= 50 ? 'text-amber-400' : 'text-red-400'
  const scoreBg = security.score >= 80 ? 'bg-emerald-500/10 border-emerald-500/20' : security.score >= 50 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-red-500/10 border-red-500/20'

  return (
    <div className="space-y-3 p-1">
      {/* Score */}
      <div className={`flex items-center gap-3 p-3 rounded-lg border ${scoreBg}`}>
        <ShieldCheck className={`w-8 h-8 ${scoreColor}`} />
        <div>
          <div className={`text-2xl font-bold ${scoreColor}`}>{security.score}%</div>
          <div className="text-[10px] text-muted-foreground">Security Score</div>
        </div>
      </div>

      {/* Identity binding */}
      <div className="px-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5">SPIFFE Identity Binding</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="flex-1 text-muted-foreground">Bound agents</span>
            <span className="text-emerald-400 font-medium">{security.boundCards}</span>
          </div>
          {security.unboundCards > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span className="flex-1 text-muted-foreground">Unbound agents</span>
              <span className="text-amber-400 font-medium">{security.unboundCards}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs">
            <Bot className="w-3.5 h-3.5 text-violet-400" />
            <span className="flex-1 text-muted-foreground">Agents with identity</span>
            <span className="text-muted-foreground">{security.agentsWithIdentity}/{security.totalAgents}</span>
          </div>
        </div>
      </div>

      {/* Tool credentials */}
      <div className="px-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5">Tool Credentials</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span className="flex-1 text-muted-foreground">With credentials</span>
            <span className="text-emerald-400 font-medium">{security.credentialedTools}</span>
          </div>
          {security.uncredentialedTools > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <Unlock className="w-3.5 h-3.5 text-zinc-400" />
              <span className="flex-1 text-muted-foreground">Without credentials</span>
              <span className="text-zinc-400">{security.uncredentialedTools}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
