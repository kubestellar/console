/**
 * ACMM Recommendations Card
 *
 * Shows the user's current role, the next transition trigger, and the
 * top prioritized recommendations (missing criteria) merged from
 * all registered sources.
 */

import { Sparkles, Zap } from 'lucide-react'
import { useCardLoadingState } from './CardDataContext'
import { CardSkeleton } from '../../lib/cards/CardComponents'
import { useACMM } from '../acmm/ACMMProvider'
import { TargetBalanceCharts } from '../acmm/TargetBalanceCharts'
import { useMissions } from '../../hooks/useMissions'
import { SOURCES_BY_ID } from '../../lib/acmm/sources'
import type { Recommendation } from '../../lib/acmm/computeRecommendations'
import type { SourceId } from '../../lib/acmm/sources/types'
import {
  detectionLabel,
  singleRecommendationPrompt,
  allRecommendationsPrompt,
} from '../../lib/acmm/missionPrompts'

const SOURCE_LABELS: Record<SourceId, string> = {
  acmm: 'ACMM',
  fullsend: 'Fullsend',
  'agentic-engineering-framework': 'AEF',
  'claude-reflect': 'Reflect',
}

/** Static role names per level — used to render the "You are a/an X" line
 *  that updates as the slider moves, not just on scan complete. */
const ROLE_BY_LEVEL: Record<number, string> = {
  1: 'Executor',
  2: 'Rule-writer',
  3: 'Analyst',
  4: 'Governor',
  5: 'Strategist',
}
const LEVEL_TICKS = [1, 2, 3, 4, 5] as const

export function ACMMRecommendations() {
  const { scan, repo, targetLevel, setTargetLevel } = useACMM()
  const { level, recommendations, isLoading, isRefreshing, isDemoData, isFailed, consecutiveFailures, lastRefresh } = scan
  const { startMission } = useMissions()
  // Use the slider's targetLevel for the role label so the card stays in
  // sync with the projection. Falls back to detected role + role string
  // when slider is at the detected level so we keep the original copy.
  const displayedRole = targetLevel === level.level ? level.role : (ROLE_BY_LEVEL[targetLevel] ?? level.role)

  function launchOne(rec: Recommendation) {
    startMission({
      title: `Add ACMM criterion: ${rec.criterion.name}`,
      description: `Add "${rec.criterion.name}" to ${repo}`,
      type: 'custom',
      initialPrompt: singleRecommendationPrompt(rec, repo),
      context: { repo, criterionId: rec.criterion.id },
    })
  }

  function launchAll() {
    if (recommendations.length === 0) return
    startMission({
      title: `Add ${recommendations.length} missing ACMM criteria`,
      description: `Implement all top ACMM recommendations for ${repo}`,
      type: 'custom',
      initialPrompt: allRecommendationsPrompt(recommendations, repo),
      context: { repo, criterionIds: recommendations.map((r) => r.criterion.id) },
    })
  }

  const hasData = scan.data.detectedIds.length > 0
  const { showSkeleton } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  })

  if (showSkeleton) {
    return <CardSkeleton type="list" rows={4} />
  }

  return (
    <div className="h-full flex flex-col p-2 gap-3 overflow-y-auto">
      {/* Projected AI/Human balance at the slider's targetLevel. Synthetic
          curves — labeled in the sub-component as "Projected" so users
          don't read them as historical data. */}
      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
          Projected balance at L{targetLevel}
        </div>
        <TargetBalanceCharts level={targetLevel} />
      </div>

      {/* Level slider — drag to explore other levels. Filters the
          Feedback Loops Inventory card via shared context. */}
      <div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
          <span>Explore level</span>
          <span className="font-mono text-foreground">L{targetLevel}</span>
        </div>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={targetLevel}
          onChange={(e) => setTargetLevel(Number(e.target.value))}
          className="w-full accent-primary"
          aria-label="Target ACMM level"
        />
        <div className="flex items-center justify-between text-[9px] text-muted-foreground mt-0.5">
          {LEVEL_TICKS.map((n) => (
            <span
              key={n}
              className={n === targetLevel ? 'text-primary font-bold' : ''}
            >
              L{n}
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
          You are {/^[aeiou]/i.test(displayedRole) ? 'an' : 'a'}
        </div>
        <div className="text-xl font-bold text-primary">{displayedRole}</div>
        <p className="text-xs text-muted-foreground mt-1 leading-snug">{level.characteristic}</p>
      </div>

      {level.antiPattern && (
        <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <div className="text-[10px] text-yellow-400 uppercase tracking-wide">Anti-pattern</div>
          <div className="text-xs text-foreground mt-0.5">{level.antiPattern}</div>
        </div>
      )}

      {level.nextTransitionTrigger && (
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
          <div className="text-[10px] text-primary uppercase tracking-wide">Next transition</div>
          <div className="text-xs text-foreground mt-0.5">{level.nextTransitionTrigger}</div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Top recommendations
          </div>
          {recommendations.length > 0 && (
            <button
              type="button"
              onClick={launchAll}
              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
              title={`Ask the selected agent to add all ${recommendations.length} missing criteria to ${repo}`}
            >
              <Sparkles className="w-2.5 h-2.5" />
              Ask agent for help with all ({recommendations.length})
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          {recommendations.map((rec) => (
            <div
              key={rec.criterion.id}
              className="p-2 rounded-md bg-muted/20 border border-border/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-medium flex-1">{rec.criterion.name}</div>
                <div className="flex gap-1 flex-shrink-0">
                  {rec.sources.map((s) => {
                    const src = SOURCES_BY_ID[s]
                    const badge = (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary hover:bg-primary/30"
                        title={src?.citation}
                      >
                        {SOURCE_LABELS[s]}
                      </span>
                    )
                    return src?.url ? (
                      <a key={s} href={src.url} target="_blank" rel="noopener noreferrer" className="no-underline">
                        {badge}
                      </a>
                    ) : (
                      <span key={s}>{badge}</span>
                    )
                  })}
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                {rec.criterion.description}
              </div>
              <div className="text-[10px] text-muted-foreground/80 mt-1 italic leading-snug">
                {rec.reason}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <code className="text-[9px] font-mono text-muted-foreground/70 truncate flex-1" title={`Detection (${rec.criterion.detection.type})`}>
                  {detectionLabel(rec.criterion.detection)}
                </code>
                <button
                  type="button"
                  onClick={() => launchOne(rec)}
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex-shrink-0"
                  title={`Ask the selected agent to add the "${rec.criterion.name}" criterion to ${repo}`}
                >
                  <Zap className="w-2.5 h-2.5" />
                  Ask agent for help
                </button>
              </div>
            </div>
          ))}
          {recommendations.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-4">
              Nothing to recommend — this repo covers all registered criteria.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ACMMRecommendations
