import type { Source, Criterion } from './types'
import { acmmSource } from './acmm'
import { fullsendSource } from './fullsend'
import { agenticEngineeringFrameworkSource } from './agentic-engineering-framework'
import { claudeReflectSource } from './claude-reflect'

export const SOURCES: Source[] = [
  acmmSource,
  fullsendSource,
  agenticEngineeringFrameworkSource,
  claudeReflectSource,
]

export const SOURCES_BY_ID: Record<string, Source> = Object.fromEntries(
  SOURCES.map((s) => [s.id, s]),
)

export const ALL_CRITERIA: Criterion[] = SOURCES.flatMap((s) => s.criteria)

export const ACMM_LEVELS = acmmSource.levels ?? []

export * from './types'
