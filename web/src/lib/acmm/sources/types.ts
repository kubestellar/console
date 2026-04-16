export type SourceId = 'acmm' | 'fullsend' | 'agentic-engineering-framework' | 'claude-reflect'

export type CriterionCategory =
  | 'feedback-loop'
  | 'readiness'
  | 'autonomy'
  | 'observability'
  | 'governance'
  | 'self-tuning'

export interface DetectionHint {
  type: 'path' | 'glob' | 'any-of'
  pattern: string | string[]
}

export interface Criterion {
  id: string
  source: SourceId
  level?: number
  category: CriterionCategory
  name: string
  description: string
  rationale: string
  detection: DetectionHint
  referencePath?: string
  frequency?: string
}

export interface LevelDef {
  n: number
  name: string
  role: string
  characteristic: string
  transitionTrigger: string
  antiPattern: string
}

export interface Source {
  id: SourceId
  name: string
  url: string
  citation: string
  definesLevels: boolean
  levels?: LevelDef[]
  criteria: Criterion[]
}
