export type InvariantSeverity = 'critical' | 'major' | 'minor'

export interface VisualLoginInvariant {
  id: string
  area: string
  severity: InvariantSeverity
  description: string
  required: string[]
  forbidden: string[]
}

export interface VisualLoginInvariantRegistry {
  invariants: VisualLoginInvariant[]
}

export interface InvariantValidationResult {
  ok: boolean
  errors: string[]
  ids: string[]
}
