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
  const detailsBlock = c.details ? `\nContext: ${c.details}\n` : ''
  return `Add the "${c.name}" ACMM criterion to ${repo} so the ACMM dashboard detects it.

Source: ${SOURCE_LABELS[c.source]}
Criterion ID: ${c.id}
What this criterion does: ${c.description}
Why it matters: ${reason}
${detailsBlock}
Detection rule (must match at least one after your change):
- Type: ${c.detection.type}
- Pattern: ${detectionLabel(c.detection)}${ref}

Please:
1. Audit the repo for any existing artifact that satisfies this detection (don't duplicate).
2. If found, tell me what you found and ask if I want to modify it or skip.
3. If missing, create a feature branch, add the minimum file(s) that match the detection pattern.
4. Run build and lint to verify no regressions before committing or pushing.
5. Show me a summary of what you created, then ask:
   1. "Should I push this branch and open a PR?"
   2. "Should I make changes first?"
6. If I say yes, push the branch and open a PR. Return the PR URL.`
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
1. Check whether an equivalent artifact already exists (don't duplicate).
2. If truly missing, add the minimum change that matches the detection pattern.
3. After each item, briefly confirm what was added.

When all items are done, run build and lint to verify no regressions, then ask:
  1. "Should I push and open a PR with all changes?"
  2. "Should I make adjustments first?"`
}

/** Mission prompt for reaching a target ACMM level by implementing
 *  ALL missing criteria from L1 through that level — the cumulative
 *  "level up" flow used by the section break buttons in the Feedback
 *  Loops Inventory. */
export function cumulativeLevelUpPrompt(criteria: Criterion[], targetLevel: number, repo: string): string {
  const list = criteria
    .map((c, i) => `${i + 1}. [L${c.level}] ${c.name} (${SOURCE_LABELS[c.source]}) — detection: ${detectionLabel(c.detection)}`)
    .join('\n')
  return `Reach ACMM Level ${targetLevel} for ${repo} by implementing all missing criteria from L1 through L${targetLevel}:

${list}

Why this matters: completing all criteria through L${targetLevel} earns the L${targetLevel} badge on the ACMM dashboard and the README badge.

For each item:
1. Check whether an equivalent artifact already exists (don't duplicate).
2. If truly missing, add the minimum change that matches the detection pattern.
3. After each item, briefly confirm what was added.

When all items are done, run build and lint to verify no regressions, then ask:
  1. "Should I push and open a PR with all changes?"
  2. "Should I make adjustments first?"`
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
1. Check whether an equivalent artifact already exists (don't duplicate).
2. If truly missing, add the minimum change that matches the detection pattern.
3. After each item, briefly confirm what was added.

When all items are done, run build and lint to verify no regressions, then ask:
  1. "Should I push and open a PR with all changes?"
  2. "Should I make adjustments first?"`
}
