import { describe, it, expect } from 'vitest'
import CRITERIA from '../acmm.criteria'
import type { Criterion } from '../types'

const VALID_CATEGORIES = new Set([
  'feedback-loop',
  'readiness',
  'autonomy',
  'observability',
  'governance',
  'self-tuning',
  'prerequisite',
  'learning',
  'traceability',
])

const VALID_DETECTION_TYPES = new Set(['path', 'glob', 'any-of'])
const VALID_CROSS_CUTTING = new Set(['learning', 'traceability'])

describe('acmm.criteria (CRITERIA export)', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(CRITERIA)).toBe(true)
    expect(CRITERIA.length).toBeGreaterThan(0)
  })

  describe('required-field presence', () => {
    it.each(CRITERIA.map(c => [c.id, c] as [string, Criterion]))(
      'criterion %s has all required fields',
      (_id, c) => {
        expect(typeof c.id).toBe('string')
        expect(c.id.length).toBeGreaterThan(0)
        expect(c.source).toBe('acmm')
        expect(typeof c.category).toBe('string')
        expect(c.category.length).toBeGreaterThan(0)
        expect(typeof c.name).toBe('string')
        expect(c.name.length).toBeGreaterThan(0)
        expect(typeof c.description).toBe('string')
        expect(c.description.length).toBeGreaterThan(0)
        expect(typeof c.rationale).toBe('string')
        expect(c.rationale.length).toBeGreaterThan(0)
        expect(c.detection).toBeDefined()
      },
    )
  })

  describe('id uniqueness and namespacing', () => {
    it('has no duplicate ids', () => {
      const ids = CRITERIA.map(c => c.id)
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
      expect(dupes).toEqual([])
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('all ids are namespaced with acmm: prefix', () => {
      for (const c of CRITERIA) {
        expect(c.id.startsWith('acmm:'), `${c.id} missing acmm: prefix`).toBe(true)
      }
    })

    it('ids use kebab-case after the prefix', () => {
      const suffixRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
      for (const c of CRITERIA) {
        const suffix = c.id.slice('acmm:'.length)
        expect(suffixRe.test(suffix), `${c.id} suffix "${suffix}" not kebab-case`).toBe(true)
      }
    })
  })

  describe('level enum validity', () => {
    it('every criterion has a numeric level in [0, 6]', () => {
      for (const c of CRITERIA) {
        expect(typeof c.level).toBe('number')
        expect(Number.isInteger(c.level)).toBe(true)
        expect(c.level!).toBeGreaterThanOrEqual(0)
        expect(c.level!).toBeLessThanOrEqual(6)
      }
    })

    it('spans multiple maturity levels', () => {
      const levels = new Set(CRITERIA.map(c => c.level))
      expect(levels.size).toBeGreaterThanOrEqual(5)
    })
  })

  describe('category enum validity', () => {
    it('every category is from the CriterionCategory union', () => {
      for (const c of CRITERIA) {
        expect(VALID_CATEGORIES.has(c.category), `${c.id} has invalid category "${c.category}"`).toBe(true)
      }
    })

    it('L0 (prerequisites) criteria all use the prerequisite category', () => {
      const l0 = CRITERIA.filter(c => c.level === 0)
      expect(l0.length).toBeGreaterThan(0)
      for (const c of l0) {
        expect(c.category, `${c.id} at L0 is not prerequisite`).toBe('prerequisite')
      }
    })
  })

  describe('detection hints', () => {
    it('every detection.type is one of path|glob|any-of', () => {
      for (const c of CRITERIA) {
        expect(VALID_DETECTION_TYPES.has(c.detection.type), `${c.id} bad detection.type`).toBe(true)
      }
    })

    it('every detection.pattern is a non-empty string or non-empty array of non-empty strings', () => {
      for (const c of CRITERIA) {
        const p = c.detection.pattern
        if (Array.isArray(p)) {
          expect(p.length, `${c.id} has empty pattern array`).toBeGreaterThan(0)
          for (const s of p) {
            expect(typeof s).toBe('string')
            expect(s.length, `${c.id} has empty pattern string`).toBeGreaterThan(0)
          }
        } else {
          expect(typeof p).toBe('string')
          expect(p.length, `${c.id} has empty pattern string`).toBeGreaterThan(0)
        }
      }
    })

    it('any-of detections use an array pattern', () => {
      for (const c of CRITERIA) {
        if (c.detection.type === 'any-of') {
          expect(Array.isArray(c.detection.pattern), `${c.id} any-of must be array`).toBe(true)
        }
      }
    })
  })

  describe('optional fields', () => {
    it('crossCutting, when set, is a valid dimension', () => {
      for (const c of CRITERIA) {
        if (c.crossCutting !== undefined) {
          expect(VALID_CROSS_CUTTING.has(c.crossCutting), `${c.id} bad crossCutting`).toBe(true)
        }
      }
    })

    it('scannable, when set, is a boolean', () => {
      for (const c of CRITERIA) {
        if (c.scannable !== undefined) {
          expect(typeof c.scannable).toBe('boolean')
        }
      }
    })

    it('details, when set, is a non-empty string', () => {
      for (const c of CRITERIA) {
        if (c.details !== undefined) {
          expect(typeof c.details).toBe('string')
          expect(c.details.length).toBeGreaterThan(0)
        }
      }
    })

    it('referencePath, when set, is a non-empty string', () => {
      for (const c of CRITERIA) {
        if (c.referencePath !== undefined) {
          expect(typeof c.referencePath).toBe('string')
          expect(c.referencePath.length).toBeGreaterThan(0)
        }
      }
    })

    it('frequency, when set, is a non-empty string', () => {
      for (const c of CRITERIA) {
        if (c.frequency !== undefined) {
          expect(typeof c.frequency).toBe('string')
          expect(c.frequency.length).toBeGreaterThan(0)
        }
      }
    })
  })
})
