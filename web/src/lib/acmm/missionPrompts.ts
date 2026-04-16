/**
 * Shared AI mission prompt builders for the ACMM dashboard cards.
 *
 * Both ACMMRecommendations (top-N missing loops) and ACMMFeedbackLoops
 * (full inventory) launch the same kind of mission for a missing
 * criterion: "audit the repo, then add the minimum thing that satisfies
 * this detection rule." Keeping the prompts in one place ensures the
 * two cards produce identical agent behavior.
 */

import type { Criterion, DetectionHint, SourceId } from './sources/types'
import type { Recommendation } from './computeRecommendations'

const SOURCE_LABELS: Record<SourceId, string> = {
  acmm: 'ACMM',
  fullsend: 'Fullsend',
  'agentic-engineering-framework': 'AEF',
  'claude-reflect': 'Reflect',
}

export function detectionLabel(hint: DetectionHint): string {
  const patterns = Array.isArray(hint.pattern) ? hint.pattern : [hint.pattern]
  return patterns.join(' · ')
}

function buildPromptForCriterion(c: Criterion, repo: string, reason: string): string {
  const ref = c.referencePath ? `\n- Reference implementation: ${c.referencePath} in kubestellar/console` : ''
  return `Add the "${c.name}" ACMM criterion to ${repo} so the ACMM dashboard detects it.

Source: ${SOURCE_LABELS[c.source]}
Criterion ID: ${c.id}
What this criterion does: ${c.description}
Why it matters: ${reason}

Detection rule (must match at least one after your change):
- Type: ${c.detection.type}
- Pattern: ${detectionLabel(c.detection)}${ref}

Please:
1. Audit the existing repo for any similar artifact that could already satisfy this detection (don't duplicate).
2. If missing, create/commit the minimum file(s) that match the detection pattern and follow our project conventions.
3. Return a short summary of what was added and why.
Do not push or open a PR automatically — stop after the commit so I can review.`
}

/**
 * Build a mission prompt from a Recommendation (used by ACMMRecommendations).
 * Recommendations carry a synthesized `reason` from computeRecommendations.
 */
export function singleRecommendationPrompt(rec: Recommendation, repo: string): string {
  return buildPromptForCriterion(rec.criterion, repo, rec.reason)
}

/**
 * Build a mission prompt from a bare Criterion (used by ACMMFeedbackLoops
 * where the user picks any missing criterion, not just the prioritized
 * top-N). Falls back to the criterion's own rationale as the "why".
 */
export function singleCriterionPrompt(c: Criterion, repo: string): string {
  return buildPromptForCriterion(c, repo, c.rationale)
}

export function allRecommendationsPrompt(recs: Recommendation[], repo: string): string {
  const list = recs
    .map((r, i) => `${i + 1}. ${r.criterion.name} (${SOURCE_LABELS[r.criterion.source]}) — detection: ${detectionLabel(r.criterion.detection)}`)
    .join('\n')
  return `Implement the missing ACMM criteria for ${repo}:

${list}

For each item:
- Check whether an equivalent artifact already exists under a non-standard path (don't duplicate).
- If truly missing, add the minimum change that matches the detection pattern and follows the repo's conventions.
- Return a brief summary of what changed for each criterion.
Do not push or open a PR automatically — stop after commits so I can review.`
}

/** Mission prompt for finishing all missing criteria at a given ACMM
 *  level — the gamification "complete this level to unlock the next"
 *  flow. Used by the sticky footer in the Feedback Loops Inventory. */
export function levelCompletionPrompt(criteria: Criterion[], earnedLevel: number, repo: string): string {
  const list = criteria
    .map((c, i) => `${i + 1}. ${c.name} (${SOURCE_LABELS[c.source]}) — detection: ${detectionLabel(c.detection)}`)
    .join('\n')
  return `Finish ACMM Level ${earnedLevel} for ${repo} by implementing the remaining missing criteria:

${list}

Why this matters: completing L${earnedLevel} unlocks L${earnedLevel + 1} on the ACMM dashboard and bumps the README badge.

For each item:
- Check whether an equivalent artifact already exists under a non-standard path (don't duplicate).
- If truly missing, add the minimum change that matches the detection pattern and follows the repo's conventions.
- Return a brief summary of what changed for each criterion.
Do not push or open a PR automatically — stop after commits so I can review.`
}
