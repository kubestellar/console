/**
 * ACMM Recommendations Card
 *
 * Shows the user's current role, the next transition trigger, and the
 * top prioritized recommendations (missing feedback loops) merged from
 * all registered sources.
 */

import { useCardLoadingState } from './CardDataContext'
import { CardSkeleton } from '../../lib/cards/CardComponents'
import { useACMM } from '../acmm/ACMMProvider'
import type { SourceId } from '../../lib/acmm/sources/types'

const SOURCE_LABELS: Record<SourceId, string> = {
  acmm: 'ACMM',
  fullsend: 'Fullsend',
  'agentic-engineering-framework': 'AEF',
  'claude-reflect': 'Reflect',
}

export function ACMMRecommendations() {
  const { scan } = useACMM()
  const { level, recommendations, isLoading, isRefreshing, isDemoData, isFailed, consecutiveFailures, lastRefresh } = scan

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
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">
          Top recommendations
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
