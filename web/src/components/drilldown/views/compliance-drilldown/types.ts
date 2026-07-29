import type { OscalControlResult } from '../../../../hooks/useTrestle'

export interface Props {
  data: Record<string, unknown>
}

export type SortField = 'controlId' | 'severity' | 'status' | 'cluster' | 'profile'
export type SortDir = 'asc' | 'desc'

export interface ControlRow extends OscalControlResult {
  cluster: string
}

export interface SummaryCounts {
  hasProvidedSummary: boolean
  passing: number
  failing: number
  other: number
  total: number
}

/** Controls per page */
export const PAGE_SIZE = 25

export const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
export const STATUS_ORDER: Record<string, number> = { fail: 0, other: 1, 'not-applicable': 2, pass: 3 }
