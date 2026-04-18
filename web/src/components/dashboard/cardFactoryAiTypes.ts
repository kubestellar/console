import type { DynamicCardColumn } from '../../lib/dynamic-cards/types'

// ============================================================================
// AI Card Generation Result Types
// ============================================================================
//
// Types and validators for AI-generated card definitions returned by the
// AiGenerationPanel. T1 = declarative (column-based), T2 = custom code.

export interface AiCardT1Result {
  title: string
  description: string
  layout: 'list' | 'stats' | 'stats-and-list'
  defaultWidth: number
  defaultLimit: number
  columns: DynamicCardColumn[]
  searchFields: string[]
  staticData: Record<string, unknown>[]
}

export interface AiCardT2Result {
  title: string
  description: string
  defaultWidth: number
  sourceCode: string
}

export type AiMode = 'tier1' | 'tier2'

export function validateT1Result(data: unknown): { valid: true; result: AiCardT1Result } | { valid: false; error: string } {
  const obj = data as Record<string, unknown>
  if (!obj.title || typeof obj.title !== 'string') return { valid: false, error: 'Missing or invalid "title"' }
  if (!obj.columns || !Array.isArray(obj.columns)) return { valid: false, error: 'Missing or invalid "columns" array' }
  if (!['list', 'stats', 'stats-and-list'].includes(obj.layout as string)) {
    (obj as Record<string, unknown>).layout = 'list' // default
  }
  return { valid: true, result: obj as unknown as AiCardT1Result }
}

export function validateT2Result(data: unknown): { valid: true; result: AiCardT2Result } | { valid: false; error: string } {
  const obj = data as Record<string, unknown>
  if (!obj.title || typeof obj.title !== 'string') return { valid: false, error: 'Missing or invalid "title"' }
  if (!obj.sourceCode || typeof obj.sourceCode !== 'string') return { valid: false, error: 'Missing or invalid "sourceCode"' }
  return { valid: true, result: obj as unknown as AiCardT2Result }
}
