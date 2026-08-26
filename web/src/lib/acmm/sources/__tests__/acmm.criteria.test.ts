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

const patternsOf = (c: Criterion): string[] =>
  Array.isArray(c.detection.pattern) ? c.detection.pattern : [c.detection.pattern]

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

    it('referencePath, when set, is one of the criterion detection patterns', () => {
      for (const c of CRITERIA) {
        if (c.referencePath !== undefined) {
          expect(
            patternsOf(c).includes(c.referencePath),
            `${c.id} referencePath "${c.referencePath}" is not a detection pattern`,
          ).toBe(true)
        }
      }
    })

    it('covers both cross-cutting dimensions', () => {
      const dims = new Set(CRITERIA.map(c => c.crossCutting).filter(Boolean))
      expect(dims).toEqual(VALID_CROSS_CUTTING)
    })
  })

  describe('detection pattern shape', () => {
    it('path detections use a single string pattern', () => {
      for (const c of CRITERIA) {
        if (c.detection.type === 'path') {
          expect(Array.isArray(c.detection.pattern), `${c.id} path must be a string`).toBe(false)
        }
      }
    })

    it('glob detections always contain a wildcard', () => {
      for (const c of CRITERIA) {
        if (c.detection.type === 'glob') {
          for (const p of patternsOf(c)) {
            expect(p.includes('*'), `${c.id} glob pattern "${p}" has no wildcard`).toBe(true)
          }
        }
      }
    })

    it('patterns are repo-relative and free of surrounding whitespace', () => {
      for (const c of CRITERIA) {
        for (const p of patternsOf(c)) {
          expect(p, `${c.id} pattern "${p}" has surrounding whitespace`).toBe(p.trim())
          expect(p.startsWith('./'), `${c.id} pattern "${p}" is not repo-relative`).toBe(false)
          expect(p.startsWith('/'), `${c.id} pattern "${p}" is not repo-relative`).toBe(false)
        }
      }
    })

    it('any-of pattern lists have no duplicate entries', () => {
      for (const c of CRITERIA) {
        const patterns = patternsOf(c)
        expect(new Set(patterns).size, `${c.id} has duplicate patterns`).toBe(patterns.length)
      }
    })
  })

  describe('level/category coherence', () => {
    it('only L0 criteria use the prerequisite category', () => {
      for (const c of CRITERIA) {
        if (c.category === 'prerequisite') {
          expect(c.level, `${c.id} is prerequisite but not at L0`).toBe(0)
        }
      }
    })

    it('every maturity level present has at least one scannable criterion', () => {
      const levels = new Set(CRITERIA.map(c => c.level))
      for (const level of levels) {
        const scannable = CRITERIA.filter(c => c.level === level && c.scannable !== false)
        expect(scannable.length, `level ${level} has no scannable criteria`).toBeGreaterThan(0)
      }
    })
  })

  describe('display copy', () => {
    it('names are unique', () => {
      const names = CRITERIA.map(c => c.name)
      const dupes = names.filter((n, i) => names.indexOf(n) !== i)
      expect(dupes).toEqual([])
    })

    it('descriptions end with sentence punctuation', () => {
      for (const c of CRITERIA) {
        expect(/[.!?]$/.test(c.description), `${c.id} description lacks final punctuation`).toBe(true)
      }
    })
  })
})
