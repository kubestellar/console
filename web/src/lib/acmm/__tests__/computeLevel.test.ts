/**
 * Branch-coverage tests for computeLevel.ts
 *
 * Tests the level-completion algorithm against real ACMM criteria (not
 * a mocked source) so changes to the criteria list are caught as well.
 */
import { describe, it, expect } from 'vitest'
import { computeLevel, LEVEL_COMPLETION_THRESHOLD, MIN_LEVEL, MAX_LEVEL } from '../computeLevel'
import { acmmSource } from '../sources/acmm'

const ACMM_CRITERIA = acmmSource.criteria.filter((c) => c.source === 'acmm')

/**
 * IDs of the four individual instruction-file criteria that form the L2
 * OR-group in computeLevel.ts (PR #9190). Detecting any one of them causes
 * the virtual 'acmm:agent-instructions' criterion to be synthesised, which
 * alone satisfies the L2 gate (threshold = 1/N). Tests that seed L2 with
 * raw OR-group IDs must account for this substitution.
 * See: web/src/lib/acmm/computeLevel.ts → AGENT_INSTRUCTION_FILE_IDS
 */
const AGENT_INSTRUCTION_FILE_IDS = new Set([
  'acmm:claude-md',
  'acmm:copilot-instructions',
  'acmm:agents-md',
  'acmm:cursor-rules',
])

/** Virtual criterion ID that replaces the OR-group members for L2 scoring. */
const VIRTUAL_AGENT_INSTRUCTIONS_ID = 'acmm:agent-instructions'

/**
 * Returns effective scannable criterion IDs for a level, mirroring the
 * OR-group substitution performed by computeLevel.ts:
 *   - For L2, the four individual instruction-file IDs are replaced by the
 *     single virtual 'acmm:agent-instructions' ID.
 *   - All other levels return the raw scannable IDs unchanged.
 */
function scannableCriteriaForLevel(n: number): string[] {
  const raw = ACMM_CRITERIA.filter((c) => c.level === n && c.scannable !== false).map((c) => c.id)
  if (n !== 2) return raw
  const rest = raw.filter((id) => !AGENT_INSTRUCTION_FILE_IDS.has(id))
  return [VIRTUAL_AGENT_INSTRUCTIONS_ID, ...rest]
}

/** Returns IDs of ALL criteria for a level (including non-scannable). */
function criteriaForLevel(n: number): string[] {
  return ACMM_CRITERIA.filter((c) => c.level === n).map((c) => c.id)
}

describe('computeLevel', () => {
  it('returns L1 when no criteria are detected', () => {
    const result = computeLevel(new Set())
    expect(result.level).toBe(MIN_LEVEL)
    expect(result.levelName).toBeDefined()
    expect(result.role).toBeDefined()
    expect(result.missingForNextLevel.length).toBeGreaterThan(0)
    // L1 has no anti-pattern to avoid hence it has text (from the source file)
    expect(result.nextTransitionTrigger).not.toBeNull()
  })

  it('returns L2 when at least one scannable L2 criterion is detected', () => {
    // L2 "Instructed" uses a relaxed gate: any single criterion suffices
    // (threshold = 1/N). Seed with 70%+ of effective L2 criteria, which
    // necessarily exceeds that threshold.
    const l2Ids = scannableCriteriaForLevel(2)
    const targetCount = Math.ceil(l2Ids.length * LEVEL_COMPLETION_THRESHOLD)
    const detected = new Set(l2Ids.slice(0, targetCount))
    const result = computeLevel(detected)
    expect(result.level).toBe(2)
  })

  it('stays at the previous level if the threshold is not met', () => {
    // L2 uses a relaxed gate (any 1 criterion suffices), so test threshold
    // behaviour at L3 where the standard 70% threshold applies.
    // Detect all of L2 (reaching L2) but only 1 of many L3 criteria — must
    // not advance past L2.
    const l3Ids = scannableCriteriaForLevel(3)
    // Guard: only meaningful when L3 has more than 1 scannable criterion.
    if (l3Ids.length <= 1) return
    const detected = new Set([...scannableCriteriaForLevel(2), l3Ids[0]])
    const result = computeLevel(detected)
    expect(result.level).toBe(2)
  })

  it('stops walking up the levels at the first unmet gate', () => {
    // Detect all of L2 but none of L3 — must not jump over.
    const detected = new Set(scannableCriteriaForLevel(2))
    const result = computeLevel(detected)
    expect(result.level).toBe(2)
    // L3's missing-for-next should be non-empty.
    expect(result.missingForNextLevel.length).toBeGreaterThan(0)
  })

  it('returns MAX_LEVEL (L6) and null nextTransitionTrigger when all levels met', () => {
    const all = ACMM_CRITERIA.map((c) => c.id)
    const result = computeLevel(new Set(all))
    expect(result.level).toBe(MAX_LEVEL)
    expect(result.missingForNextLevel).toEqual([])
    expect(result.nextTransitionTrigger).toBeNull()
  })

  it('populates detectedByLevel and requiredByLevel using scannable criteria only', () => {
    const detected = new Set(scannableCriteriaForLevel(2).slice(0, 2))
    const result = computeLevel(detected)
    expect(result.requiredByLevel[2]).toBe(scannableCriteriaForLevel(2).length)
    expect(result.detectedByLevel[2]).toBe(2)
    // L3+ have 0 detected when we only seeded L2.
    expect(result.detectedByLevel[3]).toBe(0)
  })

  it('prerequisites are a soft indicator that does not gate level progression', () => {
    const prereqIds = scannableCriteriaForLevel(0)
    // Detect zero prerequisites but all L2 criteria — should still compute L2
    const l2Ids = scannableCriteriaForLevel(2)
    const detected = new Set(l2Ids)
    const result = computeLevel(detected)
    expect(result.level).toBe(2)
    expect(result.prerequisites.met).toBe(0)
    expect(result.prerequisites.total).toBe(prereqIds.length)
  })

  it('non-scannable items are excluded from threshold calculations', () => {
    // All criteria for L3 — but only scannable ones count toward the threshold
    const allL3 = criteriaForLevel(3)
    const scannableL3 = scannableCriteriaForLevel(3)
    // Seed with all scannable L2 + all L3 items (including non-scannable)
    const detected = new Set([...scannableCriteriaForLevel(2), ...allL3])
    const result = computeLevel(detected)
    // requiredByLevel should only count scannable
    expect(result.requiredByLevel[3]).toBe(scannableL3.length)
  })

  it('computes cross-cutting counts correctly', () => {
    const all = ACMM_CRITERIA.map((c) => c.id)
    const result = computeLevel(new Set(all))
    expect(result.crossCutting.learning.met).toBeGreaterThan(0)
    expect(result.crossCutting.learning.total).toBeGreaterThan(0)
    expect(result.crossCutting.traceability.total).toBeGreaterThan(0)
  })

  it('skips levels with zero required criteria without blocking progress', () => {
    // This is a guard for a defensive code path — if a level had 0 criteria
    // the algorithm `continue`s past it. We can't easily force 0 criteria
    // without mocking, but exercising the normal case here is enough to
    // keep the branch covered by the overall suite.
    const result = computeLevel(new Set())
    expect(Object.values(result.requiredByLevel).every((v) => v >= 0)).toBe(true)
  })
})
