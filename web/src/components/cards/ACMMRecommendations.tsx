/**
 * ACMM Recommendations Card
 *
 * Shows the user's current role, the next transition trigger, and the
 * top prioritized recommendations (missing feedback loops) merged from
 * all registered sources.
 */

import { Sparkles, Zap } from 'lucide-react'
import { useCardLoadingState } from './CardDataContext'
import { CardSkeleton } from '../../lib/cards/CardComponents'
import { useACMM } from '../acmm/ACMMProvider'
import { useMissions } from '../../hooks/useMissions'
import type { Recommendation } from '../../lib/acmm/computeRecommendations'
import type { DetectionHint, SourceId } from '../../lib/acmm/sources/types'

const SOURCE_LABELS: Record<SourceId, string> = {
  acmm: 'ACMM',
  fullsend: 'Fullsend',
  'agentic-engineering-framework': 'AEF',
  'claude-reflect': 'Reflect',
}

function detectionLabel(hint: DetectionHint): string {
  const patterns = Array.isArray(hint.pattern) ? hint.pattern : [hint.pattern]
  return patterns.join(' · ')
}

function singleRecommendationPrompt(rec: Recommendation, repo: string): string {
  const c = rec.criterion
  const ref = c.referencePath ? `\n- Reference implementation: ${c.referencePath} in kubestellar/console` : ''
  return `Add the "${c.name}" feedback loop to ${repo} so the ACMM dashboard detects it.

Source: ${SOURCE_LABELS[c.source]}
Criterion ID: ${c.id}
What this loop does: ${c.description}
Why it matters: ${rec.reason}

Detection rule (must match at least one after your change):
- Type: ${c.detection.type}
- Pattern: ${detectionLabel(c.detection)}${ref}

Please:
1. Audit the existing repo for any similar artifact that could already satisfy this detection (don't duplicate).
2. If missing, create/commit the minimum file(s) that match the detection pattern and follow our project conventions.
3. Return a short summary of what was added and why.
Do not push or open a PR automatically — stop after the commit so I can review.`
}

function allRecommendationsPrompt(recs: Recommendation[], repo: string): string {
  const list = recs
    .map((r, i) => `${i + 1}. ${r.criterion.name} (${SOURCE_LABELS[r.criterion.source]}) — detection: ${detectionLabel(r.criterion.detection)}`)
    .join('\n')
  return `Implement the missing ACMM feedback loops for ${repo}:

${list}

For each item:
- Check whether an equivalent artifact already exists under a non-standard path (don't duplicate).
- If truly missing, add the minimum change that matches the detection pattern and follows the repo's conventions.
- Return a brief summary of what changed for each loop.
Do not push or open a PR automatically — stop after commits so I can review.`
}

export function ACMMRecommendations() {
  const { scan, repo } = useACMM()
  const { level, recommendations, isLoading, isRefreshing, isDemoData, isFailed, consecutiveFailures, lastRefresh } = scan
  const { startMission } = useMissions()

  function launchOne(rec: Recommendation) {
    startMission({
      title: `Add ACMM loop: ${rec.criterion.name}`,
      description: `Add "${rec.criterion.name}" to ${repo}`,
      type: 'custom',
      initialPrompt: singleRecommendationPrompt(rec, repo),
      context: { repo, criterionId: rec.criterion.id },
    })
  }

  function launchAll() {
    if (recommendations.length === 0) return
    startMission({
      title: `Add ${recommendations.length} missing ACMM loops`,
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
      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">You are a</div>
        <div className="text-xl font-bold text-primary">{level.role}</div>
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
              title={`Launch an AI mission to implement all ${recommendations.length} recommendations`}
            >
              <Sparkles className="w-2.5 h-2.5" />
              Launch mission (all)
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
                  {rec.sources.map((s) => (
                    <span
                      key={s}
                      className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary"
                    >
                      {SOURCE_LABELS[s]}
                    </span>
                  ))}
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
                  title={'Launch an AI mission to add this loop'}
                >
                  <Zap className="w-2.5 h-2.5" />
                  Launch
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
