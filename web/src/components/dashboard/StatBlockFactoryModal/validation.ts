import type { StatBlockColor } from '../../../lib/stats/types'
import type { StatAssistResult, AiStatBlockResult } from './types'
import { AVAILABLE_COLORS } from './utils'

export function validateStatAssistResult(data: unknown): { valid: true; result: StatAssistResult } | { valid: false; error: string } {
  const obj = data as Record<string, unknown>
  if (!obj.blocks && !obj.title) return { valid: false, error: 'Response must include title or blocks' }
  return { valid: true, result: obj as StatAssistResult }
}

const VALID_COLORS = new Set(AVAILABLE_COLORS)

export function validateStatBlockResult(
  data: unknown,
): { valid: true; result: AiStatBlockResult } | { valid: false; error: string } {
  const obj = data as Record<string, unknown>
  if (!obj.title || typeof obj.title !== 'string') {
    return { valid: false, error: 'Missing or invalid "title"' }
  }
  if (!obj.blocks || !Array.isArray(obj.blocks) || obj.blocks.length === 0) {
    return { valid: false, error: 'Missing or empty "blocks" array' }
  }

  // Auto-correct invalid colors to 'purple'
  for (const block of obj.blocks as Record<string, unknown>[]) {
    if (!block.color || !VALID_COLORS.has(block.color as StatBlockColor)) {
      block.color = 'purple'
    }
  }

  return { valid: true, result: obj as unknown as AiStatBlockResult }
}
