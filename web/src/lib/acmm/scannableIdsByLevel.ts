/**
 * Scannable ACMM criterion IDs grouped by level.
 *
 * SINGLE SOURCE OF TRUTH consumed by:
 *   - web/src/lib/acmm/computeLevel.ts   (frontend dashboard)
 *   - web/netlify/functions/acmm-badge.mts (shields.io badge endpoint)
 *
 * Derived from the criteria definitions in sources/acmm.ts by filtering out
 * items where `scannable === false`. For L2, the four individual instruction-
 * file criteria (claude-md, copilot-instructions, agents-md, cursor-rules)
 * are collapsed into a single virtual "acmm:agent-instructions" OR-group so
 * that any one file satisfies the Instructed gate.
 *
 * When adding or renaming criteria in acmm.ts, regenerate this list by
 * running through the criteria with `scannable !== false` and grouping by
 * level.  Only levels 2–6 are gated; L0 (prerequisites) and L1 (Assisted)
 * are not part of the threshold walk.
 */

import { acmmSource } from './sources/acmm'

/** IDs of the individual instruction-file criteria that form the L2 OR-group. */
export const AGENT_INSTRUCTION_FILE_IDS = new Set([
  'acmm:claude-md',
  'acmm:copilot-instructions',
  'acmm:agents-md',
  'acmm:cursor-rules',
])

/** Minimum level included in the threshold walk. */
const WALK_MIN_LEVEL = 2
/** Maximum level included in the threshold walk. */
const WALK_MAX_LEVEL = 6

/**
 * Build the canonical map of scannable criterion IDs per level.
 *
 * For L2, the four individual instruction-file IDs are replaced by the single
 * virtual "acmm:agent-instructions" so that the badge and dashboard agree on
 * the denominator.
 */
function buildScannableIdsByLevel(): Record<number, string[]> {
  const result: Record<number, string[]> = {}

  for (let n = WALK_MIN_LEVEL; n <= WALK_MAX_LEVEL; n++) {
    const scannable = acmmSource.criteria
      .filter((c) => c.source === 'acmm' && c.level === n && c.scannable !== false)

    if (n === 2) {
      // Replace individual instruction-file entries with the virtual OR-group
      const rest = scannable
        .filter((c) => !AGENT_INSTRUCTION_FILE_IDS.has(c.id))
        .map((c) => c.id)
      result[n] = ['acmm:agent-instructions', ...rest]
    } else {
      result[n] = scannable.map((c) => c.id)
    }
  }

  return result
}

/**
 * Scannable criterion IDs per level (L2–L6).
 *
 * Consumed by both the frontend `computeLevel` and the Netlify badge function
 * to ensure identical level calculations.
 */
export const SCANNABLE_IDS_BY_LEVEL: Record<number, string[]> = buildScannableIdsByLevel()
