import { acmmSource } from './sources/acmm'
import type { Criterion } from './sources/types'
import { SCANNABLE_IDS_BY_LEVEL, AGENT_INSTRUCTION_FILE_IDS } from './scannableIdsByLevel'

const MIN_LEVEL = 1
const MAX_LEVEL = 6
/** Minimum fraction of scannable criteria at a level to consider it "passed" */
const LEVEL_COMPLETION_THRESHOLD = 0.7
/** Level 0 = prerequisites (soft indicator, not gating) */
const PREREQUISITE_LEVEL = 0

/** Virtual criterion representing the OR group above (not in acmm.ts source). */
const VIRTUAL_AGENT_INSTRUCTIONS: Criterion = {
  id: 'acmm:agent-instructions',
  source: 'acmm',
  level: 2,
  category: 'feedback-loop',
  name: 'Agent instructions (any)',
  description: 'Any one of CLAUDE.md, AGENTS.md, .github/copilot-instructions.md, or .cursorrules.',
  rationale: 'Any vendor-neutral or vendor-specific instruction file satisfies the L2 Instructed signal.',
  detection: { type: 'any-of', pattern: ['CLAUDE.md', 'AGENTS.md', '.github/copilot-instructions.md', '.cursorrules'] },
}

export interface LevelComputation {
  level: number
  levelName: string
  role: string
  characteristic: string
  detectedByLevel: Record<number, number>
  requiredByLevel: Record<number, number>
  missingForNextLevel: Criterion[]
  nextTransitionTrigger: string | null
  antiPattern: string
  /** Prerequisite items detected vs total (soft indicator, not gating) */
  prerequisites: { met: number; total: number }
  /** Cross-cutting dimension counts */
  crossCutting: {
    learning: { met: number; total: number }
    traceability: { met: number; total: number }
  }
}

const ACMM_CRITERIA = acmmSource.criteria.filter((c) => c.source === 'acmm')
const ACMM_LEVELS = acmmSource.levels ?? []

/** Return scannable criteria for a given level (non-scannable items are
 *  displayed in the UI but excluded from threshold calculations).
 *  For L2, the four individual instruction-file criteria are replaced by the
 *  virtual OR-group criterion so any one file satisfies the level gate.
 *
 *  The set of IDs is governed by SCANNABLE_IDS_BY_LEVEL (shared with the
 *  badge endpoint) to guarantee both compute identical levels. */
function scannableCriteriaForLevel(level: number): Criterion[] {
  const ids = SCANNABLE_IDS_BY_LEVEL[level]
  if (!ids) {
    // Levels not in the threshold walk (e.g. L0 prerequisites)
    return ACMM_CRITERIA.filter((c) => c.level === level && c.scannable !== false)
  }
  // Build Criterion objects: real criteria come from the catalog; the virtual
  // "acmm:agent-instructions" is synthesised above.
  const result: Criterion[] = []
  for (const id of ids) {
    if (id === 'acmm:agent-instructions') {
      result.push(VIRTUAL_AGENT_INSTRUCTIONS)
    } else {
      const found = ACMM_CRITERIA.find((c) => c.id === id)
      if (found) result.push(found)
    }
  }
  return result
}

/** Return ALL criteria for a given level (including non-scannable). */
function allCriteriaForLevel(level: number): Criterion[] {
  return ACMM_CRITERIA.filter((c) => c.level === level)
}

function levelDef(n: number) {
  return ACMM_LEVELS.find((l) => l.n === n)
}

export function computeLevel(rawDetectedIds: Set<string>): LevelComputation {
  // Synthesise the virtual L2 OR-group criterion before the level walk.
  const detectedIds = new Set(rawDetectedIds)
  if ([...AGENT_INSTRUCTION_FILE_IDS].some((id) => detectedIds.has(id))) {
    detectedIds.add('acmm:agent-instructions')
  }

  const detectedByLevel: Record<number, number> = {}
  const requiredByLevel: Record<number, number> = {}

  // L2–L6 threshold walk (L0 prerequisites and L1 are not gated)
  for (let n = MIN_LEVEL + 1; n <= MAX_LEVEL; n++) {
    const required = scannableCriteriaForLevel(n)
    requiredByLevel[n] = required.length
    detectedByLevel[n] = required.filter((c) => detectedIds.has(c.id)).length
  }

  let currentLevel = MIN_LEVEL
  for (let n = MIN_LEVEL + 1; n <= MAX_LEVEL; n++) {
    const required = requiredByLevel[n]
    const detected = detectedByLevel[n]
    if (required === 0) continue
    // L2 "Instructed" is reached with any single criterion; higher levels use 70%
    const threshold = n === 2 ? 1 / required : LEVEL_COMPLETION_THRESHOLD
    const ratio = detected / required
    if (ratio >= threshold) {
      currentLevel = n
    } else {
      break
    }
  }

  const nextLevel = currentLevel < MAX_LEVEL ? currentLevel + 1 : null
  const missingForNextLevel = nextLevel
    ? scannableCriteriaForLevel(nextLevel).filter((c) => !detectedIds.has(c.id))
    : []

  const current = levelDef(currentLevel)
  const next = nextLevel ? levelDef(nextLevel) : null

  // Prerequisite soft indicator
  const prereqCriteria = scannableCriteriaForLevel(PREREQUISITE_LEVEL)
  const prereqMet = prereqCriteria.filter((c) => detectedIds.has(c.id)).length

  // Cross-cutting dimension counts (only scannable items)
  const learningCriteria = ACMM_CRITERIA.filter(
    (c) => c.crossCutting === 'learning' && c.scannable !== false,
  )
  const traceabilityCriteria = ACMM_CRITERIA.filter(
    (c) => c.crossCutting === 'traceability' && c.scannable !== false,
  )

  return {
    level: currentLevel,
    levelName: current?.name ?? `L${currentLevel}`,
    role: current?.role ?? '',
    characteristic: current?.characteristic ?? '',
    detectedByLevel,
    requiredByLevel,
    missingForNextLevel,
    nextTransitionTrigger: next?.transitionTrigger ?? null,
    antiPattern: current?.antiPattern ?? '',
    prerequisites: {
      met: prereqMet,
      total: prereqCriteria.length,
    },
    crossCutting: {
      learning: {
        met: learningCriteria.filter((c) => detectedIds.has(c.id)).length,
        total: learningCriteria.length,
      },
      traceability: {
        met: traceabilityCriteria.filter((c) => detectedIds.has(c.id)).length,
        total: traceabilityCriteria.length,
      },
    },
  }
}

/** Return all criteria (including non-scannable) for UI display. */
export function getAllCriteria(): Criterion[] {
  return ACMM_CRITERIA
}

/** Return all criteria grouped by level. */
export function getCriteriaByLevel(): Record<number, Criterion[]> {
  const byLevel: Record<number, Criterion[]> = {}
  for (let n = PREREQUISITE_LEVEL; n <= MAX_LEVEL; n++) {
    byLevel[n] = allCriteriaForLevel(n)
  }
  return byLevel
}

export { LEVEL_COMPLETION_THRESHOLD, MIN_LEVEL, MAX_LEVEL, PREREQUISITE_LEVEL }
