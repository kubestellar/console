/**
 * Structural + data-integrity tests for the ACMM sources index.
 *
 * These files are pure data modules — the "test" is that every source
 * is well-formed, every criterion has the required fields, and the
 * composite arrays (ALL_CRITERIA, SOURCES_BY_ID) stay in sync with
 * the individual source exports. Cheap to write, high coverage gain.
 */
import { describe, it, expect } from 'vitest'
import {
  SOURCES,
  SOURCES_BY_ID,
  ALL_CRITERIA,
  ACMM_LEVELS,
} from '../index'
import { acmmSource } from '../acmm'
import { fullsendSource } from '../fullsend'
import { agenticEngineeringFrameworkSource } from '../agentic-engineering-framework'
import { claudeReflectSource } from '../claude-reflect'

const VALID_CATEGORIES = [
  'feedback-loop',
  'readiness',
  'autonomy',
  'observability',
  'governance',
  'self-tuning',
]
const VALID_SOURCES = ['acmm', 'fullsend', 'agentic-engineering-framework', 'claude-reflect']

describe('ACMM sources index', () => {
  it('SOURCES contains exactly four sources', () => {
    expect(SOURCES.length).toBe(4)
  })

  it('SOURCES_BY_ID keys match each source.id', () => {
    for (const src of SOURCES) {
      expect(SOURCES_BY_ID[src.id]).toBe(src)
    }
  })

  it('ALL_CRITERIA equals the union of every source.criteria list', () => {
    const expected = SOURCES.flatMap(s => s.criteria).length
    expect(ALL_CRITERIA.length).toBe(expected)
  })

  it('ACMM_LEVELS is populated only from the acmm source', () => {
    expect(ACMM_LEVELS.length).toBe(acmmSource.levels?.length ?? 0)
    expect(ACMM_LEVELS.length).toBeGreaterThan(0)
  })
})

describe('Each source is well-formed', () => {
  for (const source of [
    acmmSource,
    fullsendSource,
    agenticEngineeringFrameworkSource,
    claudeReflectSource,
  ]) {
    describe(`source "${source.id}"`, () => {
      it('has id, name, and a non-empty criteria list', () => {
        expect(source.id).toBeTruthy()
        expect(source.name).toBeTruthy()
        expect(source.criteria.length).toBeGreaterThan(0)
      })

      it('uses a known source id on every criterion', () => {
        for (const c of source.criteria) {
          expect(VALID_SOURCES).toContain(c.source)
        }
      })

      it('criterion.source matches the containing source.id', () => {
        for (const c of source.criteria) {
          expect(c.source).toBe(source.id)
        }
      })

      it('every criterion has an id, name, description, rationale, and detection hint', () => {
        for (const c of source.criteria) {
          expect(c.id).toBeTruthy()
          expect(c.name).toBeTruthy()
          expect(c.description).toBeTruthy()
          expect(c.rationale).toBeTruthy()
          expect(c.detection).toBeDefined()
          expect(['path', 'glob', 'any-of']).toContain(c.detection.type)
        }
      })

      it('every criterion category is one of the known categories', () => {
        for (const c of source.criteria) {
          expect(VALID_CATEGORIES).toContain(c.category)
        }
      })

      it('no duplicate criterion ids within the source', () => {
        const ids = source.criteria.map(c => c.id)
        expect(new Set(ids).size).toBe(ids.length)
      })
    })
  }
})

describe('ACMM-specific invariants', () => {
  it('every ACMM criterion has a level in 1..5', () => {
    for (const c of acmmSource.criteria) {
      if (c.source === 'acmm') {
        expect(c.level).toBeGreaterThanOrEqual(1)
        expect(c.level).toBeLessThanOrEqual(5)
      }
    }
  })

  it('acmm.levels defines 5 entries with n=1..5', () => {
    expect(acmmSource.levels?.map(l => l.n)).toEqual([1, 2, 3, 4, 5])
  })

  it('every level has a name, role, characteristic, and anti-pattern', () => {
    for (const lvl of acmmSource.levels ?? []) {
      expect(lvl.name).toBeTruthy()
      expect(lvl.role).toBeTruthy()
      expect(lvl.characteristic).toBeTruthy()
      expect(lvl.antiPattern).toBeTruthy()
    }
  })
})

describe('Cross-source de-dup sanity', () => {
  it('no criterion id collisions across sources', () => {
    const allIds = ALL_CRITERIA.map(c => c.id)
    expect(new Set(allIds).size).toBe(allIds.length)
  })
})
