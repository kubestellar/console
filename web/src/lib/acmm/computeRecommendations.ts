import { ALL_CRITERIA } from './sources'
import type { Criterion, SourceId } from './sources/types'
import type { LevelComputation } from './computeLevel'

const MAX_RECOMMENDATIONS = 5

const CATEGORY_WEIGHT: Record<string, number> = {
  'feedback-loop': 100,
  readiness: 80,
  governance: 70,
  observability: 60,
  'self-tuning': 50,
  autonomy: 40,
  prerequisite: 90,
  learning: 55,
  traceability: 65,
}

export interface Recommendation {
  criterion: Criterion
  priority: number
  reason: string
  sources: SourceId[]
}

export function computeRecommendations(
  detectedIds: Set<string>,
  level: LevelComputation,
): Recommendation[] {
  const recs: Recommendation[] = []

  // Only recommend scannable items — non-scannable ones can't be
  // auto-detected so recommending "add a file" doesn't make sense.
  for (const missing of level.missingForNextLevel) {
    if (missing.scannable === false) continue
    recs.push({
      criterion: missing,
      priority: 1000 + (CATEGORY_WEIGHT[missing.category] ?? 0),
      reason: `Required for ACMM Level ${missing.level} — ${level.nextTransitionTrigger ?? 'next level'}`,
      sources: ['acmm'],
    })
  }

  const nonLeveled = ALL_CRITERIA.filter(
    (c) => c.source !== 'acmm' && !detectedIds.has(c.id) && c.scannable !== false,
  )
  for (const criterion of nonLeveled) {
    recs.push({
      criterion,
      priority: CATEGORY_WEIGHT[criterion.category] ?? 0,
      reason: criterion.rationale,
      sources: [criterion.source],
    })
  }

  const deduped = new Map<string, Recommendation>()
  for (const rec of recs) {
    const key = `${rec.criterion.category}:${rec.criterion.name.toLowerCase()}`
    const existing = deduped.get(key)
    if (!existing) {
      deduped.set(key, rec)
    } else {
      existing.priority = Math.max(existing.priority, rec.priority)
      if (!existing.sources.includes(rec.criterion.source)) {
        existing.sources.push(rec.criterion.source)
      }
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_RECOMMENDATIONS)
}

export { MAX_RECOMMENDATIONS }
