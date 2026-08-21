import { describe, expect, it } from 'vitest'
import { acmmSource } from './acmm'
import type { CriterionCategory } from './types'

const VALID_CATEGORIES = [
  'feedback-loop',
  'readiness',
  'autonomy',
  'observability',
  'governance',
  'self-tuning',
  'prerequisite',
  'learning',
  'traceability',
] as const satisfies readonly CriterionCategory[]

describe('acmm criteria data', () => {
  it('uses unique criterion ids', () => {
    const ids = acmmSource.criteria.map((criterion) => criterion.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has non-empty required fields', () => {
    for (const criterion of acmmSource.criteria) {
      expect(criterion.id.trim()).toBeTruthy()
      expect(criterion.source).toBe('acmm')
      expect(criterion.name.trim()).toBeTruthy()
      expect(criterion.description.trim()).toBeTruthy()
      expect(criterion.rationale.trim()).toBeTruthy()
      expect(criterion.detection).toBeDefined()
    }
  })

  it('uses valid level and category values', () => {
    for (const criterion of acmmSource.criteria) {
      expect(Number.isInteger(criterion.level)).toBe(true)
      expect(criterion.level).toBeGreaterThanOrEqual(0)
      expect(criterion.level).toBeLessThanOrEqual(6)
      expect(VALID_CATEGORIES).toContain(criterion.category)
    }
  })
})
