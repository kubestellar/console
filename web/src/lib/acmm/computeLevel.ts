import { acmmSource } from './sources/acmm'
import type { Criterion } from './sources/types'

const MIN_LEVEL = 1
const MAX_LEVEL = 6
/** Minimum fraction of scannable criteria at a level to consider it "passed" */
const LEVEL_COMPLETION_THRESHOLD = 0.7
/** Level 0 = prerequisites (soft indicator, not gating) */
const PREREQUISITE_LEVEL = 0

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
 *  displayed in the UI but excluded from threshold calculations). */
function scannableCriteriaForLevel(level: number): Criterion[] {
  return ACMM_CRITERIA.filter(
    (c) => c.level === level && c.scannable !== false,
  )
}

/** Return ALL criteria for a given level (including non-scannable). */
function allCriteriaForLevel(level: number): Criterion[] {
  return ACMM_CRITERIA.filter((c) => c.level === level)
}

function levelDef(n: number) {
  return ACMM_LEVELS.find((l) => l.n === n)
}

export function computeLevel(detectedIds: Set<string>): LevelComputation {
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
    const ratio = detected / required
    if (ratio >= LEVEL_COMPLETION_THRESHOLD) {
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
