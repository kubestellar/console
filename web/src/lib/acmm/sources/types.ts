export type SourceId = 'acmm' | 'fullsend' | 'agentic-engineering-framework' | 'claude-reflect'

export type CriterionCategory =
  | 'feedback-loop'
  | 'readiness'
  | 'autonomy'
  | 'observability'
  | 'governance'
  | 'self-tuning'
  | 'prerequisite'
  | 'learning'
  | 'traceability'

export interface DetectionHint {
  type: 'path' | 'glob' | 'any-of'
  pattern: string | string[]
}

/** Cross-cutting dimension — items tagged with this participate in the
 *  cross-cutting overlay view regardless of their maturity level. */
export type CrossCuttingDimension = 'learning' | 'traceability'

export interface Criterion {
  id: string
  source: SourceId
  /** Maturity level (0 = prerequisite, 1–6 = maturity levels). */
  level?: number
  category: CriterionCategory
  name: string
  description: string
  rationale: string
  /** Three-sentence blurb: what it is, why it matters, how an AI mission implements it. */
  details?: string
  detection: DetectionHint
  referencePath?: string
  frequency?: string
  /** Items without file-based detection show in the checklist but don't
   *  affect the maturity score. Default: true. */
  scannable?: boolean
  /** Cross-cutting dimension — items tagged here are also shown in the
   *  Learning & Feedback or Traceability & Audit overlay view. */
  crossCutting?: CrossCuttingDimension
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
