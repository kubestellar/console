import { acmmSource } from './sources/acmm'
import type { Criterion } from './sources/types'

const MIN_LEVEL = 1
const MAX_LEVEL = 5
const LEVEL_COMPLETION_THRESHOLD = 0.7

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
}

const ACMM_CRITERIA = acmmSource.criteria.filter((c) => c.source === 'acmm')
const ACMM_LEVELS = acmmSource.levels ?? []

function criteriaForLevel(level: number): Criterion[] {
  return ACMM_CRITERIA.filter((c) => c.level === level)
}

function levelDef(n: number) {
  return ACMM_LEVELS.find((l) => l.n === n)
}

export function computeLevel(detectedIds: Set<string>): LevelComputation {
  const detectedByLevel: Record<number, number> = {}
  const requiredByLevel: Record<number, number> = {}

  for (let n = MIN_LEVEL + 1; n <= MAX_LEVEL; n++) {
    const required = criteriaForLevel(n)
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
    ? criteriaForLevel(nextLevel).filter((c) => !detectedIds.has(c.id))
    : []

  const current = levelDef(currentLevel)
  const next = nextLevel ? levelDef(nextLevel) : null

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
  }
}

export { LEVEL_COMPLETION_THRESHOLD, MIN_LEVEL, MAX_LEVEL }
