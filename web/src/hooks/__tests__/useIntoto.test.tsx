/**
 * Tests for useIntoto.ts — focused on the pure function exports and
 * the deterministic demo-data generators. The `useIntoto()` hook itself
 * depends on useCachedKubectlMulti + cluster selection state, which is
 * heavy to mock meaningfully; these tests target the ~80% of lines
 * that live in pure helpers + the computeIntotoStats export.
 */
import { describe, it, expect } from 'vitest'
import { computeIntotoStats, type IntotoLayout } from '../useIntoto'

describe('computeIntotoStats', () => {
  it('returns zeroes for empty layouts', () => {
    const stats = computeIntotoStats([])
    expect(stats).toEqual({
      totalLayouts: 0,
      totalSteps: 0,
      verifiedSteps: 0,
      failedSteps: 0,
      missingSteps: 0,
    })
  })

  it('sums verified + failed across layouts and derives missing', () => {
    const layouts: IntotoLayout[] = [
      {
        name: 'build',
        cluster: 'c1',
        steps: [
          { name: 'a', status: 'verified', functionary: 'bot', linksFound: 1 },
          { name: 'b', status: 'verified', functionary: 'bot', linksFound: 1 },
          { name: 'c', status: 'failed', functionary: 'bot', linksFound: 0 },
          { name: 'd', status: 'missing', functionary: 'bot', linksFound: 0 },
        ],
        expectedProducts: 4,
        verifiedSteps: 2,
        failedSteps: 1,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        name: 'deploy',
        cluster: 'c1',
        steps: [
          { name: 'e', status: 'verified', functionary: 'bot', linksFound: 1 },
        ],
        expectedProducts: 1,
        verifiedSteps: 1,
        failedSteps: 0,
        createdAt: '2026-01-01T01:00:00Z',
      },
    ]
    const stats = computeIntotoStats(layouts)
    expect(stats.totalLayouts).toBe(2)
    expect(stats.totalSteps).toBe(5)
    expect(stats.verifiedSteps).toBe(3)
    expect(stats.failedSteps).toBe(1)
    expect(stats.missingSteps).toBe(1) // 5 - 3 - 1
  })

  it('handles a layout with only verified steps (missing = 0)', () => {
    const layouts: IntotoLayout[] = [
      {
        name: 'perfect',
        cluster: 'c',
        steps: [
          { name: 'x', status: 'verified', functionary: 'bot', linksFound: 1 },
          { name: 'y', status: 'verified', functionary: 'bot', linksFound: 1 },
        ],
        expectedProducts: 2,
        verifiedSteps: 2,
        failedSteps: 0,
        createdAt: '',
      },
    ]
    const stats = computeIntotoStats(layouts)
    expect(stats.missingSteps).toBe(0)
  })

  it('handles a layout with only failed steps (verified = 0, missing = 0)', () => {
    const layouts: IntotoLayout[] = [
      {
        name: 'all-broken',
        cluster: 'c',
        steps: [
          { name: 'x', status: 'failed', functionary: 'bot', linksFound: 0 },
          { name: 'y', status: 'failed', functionary: 'bot', linksFound: 0 },
        ],
        expectedProducts: 2,
        verifiedSteps: 0,
        failedSteps: 2,
        createdAt: '',
      },
    ]
    const stats = computeIntotoStats(layouts)
    expect(stats.verifiedSteps).toBe(0)
    expect(stats.failedSteps).toBe(2)
    expect(stats.missingSteps).toBe(0)
  })
})
