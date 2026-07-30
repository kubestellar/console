import { describe, it, expect } from 'vitest'
import { acmmSource } from '../acmm'

const VALID_CATEGORIES = new Set([
  'feedback-loop', 'readiness', 'autonomy', 'observability',
  'governance', 'self-tuning', 'prerequisite', 'learning', 'traceability',
])

describe('acmmSource', () => {
  it('has required source metadata fields', () => {
    expect(acmmSource.id).toBe('acmm')
    expect(acmmSource.name).toBe('AI Codebase Maturity Model')
    expect(acmmSource.url).toBeTruthy()
    expect(acmmSource.citation).toBeTruthy()
    expect(acmmSource.definesLevels).toBe(true)
    expect(acmmSource.levels).toBeDefined()
    expect(acmmSource.criteria).toBeDefined()
  })

  describe('levels', () => {
    it('has 7 levels (0-6)', () => {
      expect(acmmSource.levels).toHaveLength(7)
    })

    it('levels are ordered 0 through 6', () => {
      const levels = acmmSource.levels!
      for (let i = 0; i < levels.length; i++) {
        expect(levels[i].n).toBe(i)
      }
    })

    it('each level has required fields', () => {
      for (const level of acmmSource.levels!) {
        expect(typeof level.n).toBe('number')
        expect(level.name).toBeTruthy()
        expect(typeof level.characteristic).toBe('string')
        expect(typeof level.transitionTrigger).toBe('string')
        expect(typeof level.antiPattern).toBe('string')
      }
    })

    it('each level except L0 has a role', () => {
      const levels = acmmSource.levels!
      expect(levels[0].role).toBe('')
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i].role).toBeTruthy()
      }
    })
  })

  describe('criteria', () => {
    it('has a non-empty criteria array', () => {
      expect(acmmSource.criteria.length).toBeGreaterThan(0)
    })

    it('each criterion has required fields', () => {
      for (const c of acmmSource.criteria) {
        expect(c.id).toBeTruthy()
        expect(c.source).toBe('acmm')
        expect(typeof c.level).toBe('number')
        expect(c.category).toBeTruthy()
        expect(c.name).toBeTruthy()
        expect(c.description).toBeTruthy()
        expect(c.rationale).toBeTruthy()
        expect(c.detection).toBeDefined()
      }
    })

    it('all criterion levels are in range 0-6', () => {
      for (const c of acmmSource.criteria) {
        expect(c.level).toBeGreaterThanOrEqual(0)
        expect(c.level).toBeLessThanOrEqual(6)
      }
    })

    it('has no duplicate criterion IDs', () => {
      const ids = acmmSource.criteria.map(c => c.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('all criterion IDs start with acmm:', () => {
      for (const c of acmmSource.criteria) {
        expect(c.id.startsWith('acmm:')).toBe(true)
      }
    })

    it('all categories are from the expected set', () => {
      for (const c of acmmSource.criteria) {
        expect(VALID_CATEGORIES.has(c.category)).toBe(true)
      }
    })

    it('scannable criteria have a detection field', () => {
      const scannableCriteria = acmmSource.criteria.filter(c => c.scannable === true)
      for (const c of scannableCriteria) {
        expect(c.detection).toBeDefined()
        expect(c.detection.type).toBeTruthy()
      }
    })

    it('all criteria have valid detection types', () => {
      for (const c of acmmSource.criteria) {
        expect(['path', 'glob', 'any-of']).toContain(c.detection.type)
        const patterns = Array.isArray(c.detection.pattern)
          ? c.detection.pattern
          : [c.detection.pattern]
        expect(patterns.length).toBeGreaterThan(0)
      }
    })

    it('has criteria across multiple levels', () => {
      const levelsUsed = new Set(acmmSource.criteria.map(c => c.level))
      expect(levelsUsed.size).toBeGreaterThanOrEqual(5)
    })
  })
})
