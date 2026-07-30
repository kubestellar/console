import type { DynamicCardColumn } from '../../lib/dynamic-cards/types'

// ============================================================================
// Inline AI Assist Result Types
// ============================================================================
//
// Types and validators for partial card edits returned by the InlineAIAssist
// component. These are the smaller siblings of the full AiCardT1Result /
// AiCardT2Result types in cardFactoryAiTypes.ts — assist responses can omit
// most fields, since they patch an in-progress card definition rather than
// replacing it.

export interface T1AssistResult {
  title?: string
  description?: string
  layout?: 'list' | 'stats' | 'stats-and-list'
  width?: number
  columns?: DynamicCardColumn[]
  data?: Record<string, unknown>[]
}

export interface T2AssistResult {
  title?: string
  description?: string
  width?: number
  sourceCode?: string
}

export function validateT1AssistResult(data: unknown): { valid: true; result: T1AssistResult } | { valid: false; error: string } {
  const obj = data as Record<string, unknown>
  if (!obj.columns && !obj.data && !obj.title) return { valid: false, error: 'Response must include title, columns, or data' }
  return { valid: true, result: obj as T1AssistResult }
}

export function validateT2AssistResult(data: unknown): { valid: true; result: T2AssistResult } | { valid: false; error: string } {
  const obj = data as Record<string, unknown>
  if (!obj.sourceCode && !obj.title) return { valid: false, error: 'Response must include sourceCode or title' }
  return { valid: true, result: obj as T2AssistResult }
}
