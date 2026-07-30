import { describe, it, expect } from 'vitest'
import { computeIntotoStats } from '../useIntoto'
import type { IntotoLayout } from '../useIntoto'

function makeLayout(overrides: Partial<IntotoLayout> = {}): IntotoLayout {
  return {
    name: 'test-layout',
    cluster: 'cluster-1',
    steps: [],
    expectedProducts: 0,
    verifiedSteps: 0,
    failedSteps: 0,
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('computeIntotoStats', () => {
  it('returns all-zero stats for empty layouts array', () => {
    const stats = computeIntotoStats([])
    expect(stats).toEqual({
      totalLayouts: 0,
      totalSteps: 0,
      verifiedSteps: 0,
      failedSteps: 0,
      missingSteps: 0,
    })
  })

  it('counts totalLayouts correctly', () => {
    const layouts = [makeLayout(), makeLayout(), makeLayout()]
    expect(computeIntotoStats(layouts).totalLayouts).toBe(3)
  })

  it('sums steps across all layouts', () => {
    const layouts = [
      makeLayout({ steps: [{ name: 'a', status: 'verified', functionary: 'f', linksFound: 1 }] }),
      makeLayout({ steps: [
        { name: 'b', status: 'failed', functionary: 'f', linksFound: 0 },
        { name: 'c', status: 'missing', functionary: 'f', linksFound: 0 },
      ]}),
    ]
    expect(computeIntotoStats(layouts).totalSteps).toBe(3)
  })

  it('accumulates verifiedSteps from layout.verifiedSteps field', () => {
    const layouts = [
      makeLayout({ verifiedSteps: 3, steps: Array(5).fill({ name: 'x', status: 'verified', functionary: 'f', linksFound: 1 }) }),
      makeLayout({ verifiedSteps: 2, steps: Array(2).fill({ name: 'y', status: 'verified', functionary: 'f', linksFound: 1 }) }),
    ]
    expect(computeIntotoStats(layouts).verifiedSteps).toBe(5)
  })

  it('accumulates failedSteps from layout.failedSteps field', () => {
    const layouts = [
      makeLayout({ failedSteps: 1, steps: [{ name: 'a', status: 'failed', functionary: 'f', linksFound: 0 }] }),
      makeLayout({ failedSteps: 2, steps: Array(2).fill({ name: 'b', status: 'failed', functionary: 'f', linksFound: 0 }) }),
    ]
    expect(computeIntotoStats(layouts).failedSteps).toBe(3)
  })

  it('computes missingSteps = totalSteps - verifiedSteps - failedSteps', () => {
    const layouts = [
      makeLayout({
        steps: Array(5).fill({ name: 'x', status: 'unknown', functionary: 'f', linksFound: 0 }),
        verifiedSteps: 2,
        failedSteps: 1,
      }),
    ]
    const stats = computeIntotoStats(layouts)
    expect(stats.missingSteps).toBe(2) // 5 - 2 - 1
  })

  it('handles layout with no steps (all zeros for that layout)', () => {
    const stats = computeIntotoStats([makeLayout({ steps: [], verifiedSteps: 0, failedSteps: 0 })])
    expect(stats.totalSteps).toBe(0)
    expect(stats.missingSteps).toBe(0)
  })

  it('handles all-verified scenario', () => {
    const layouts = [makeLayout({
      steps: [
        { name: 'a', status: 'verified', functionary: 'f', linksFound: 1 },
        { name: 'b', status: 'verified', functionary: 'f', linksFound: 1 },
      ],
      verifiedSteps: 2,
      failedSteps: 0,
    })]
    const stats = computeIntotoStats(layouts)
    expect(stats.verifiedSteps).toBe(2)
    expect(stats.failedSteps).toBe(0)
    expect(stats.missingSteps).toBe(0)
  })

  it('handles multi-layout mixed scenario', () => {
    const layouts = [
      makeLayout({ steps: Array(3).fill({ name: 'x', status: 'verified', functionary: 'f', linksFound: 1 }), verifiedSteps: 3, failedSteps: 0 }),
      makeLayout({ steps: Array(2).fill({ name: 'y', status: 'failed', functionary: 'f', linksFound: 0 }), verifiedSteps: 0, failedSteps: 2 }),
      makeLayout({ steps: [{ name: 'z', status: 'missing', functionary: 'f', linksFound: 0 }], verifiedSteps: 0, failedSteps: 0 }),
    ]
    const stats = computeIntotoStats(layouts)
    expect(stats.totalLayouts).toBe(3)
    expect(stats.totalSteps).toBe(6)
    expect(stats.verifiedSteps).toBe(3)
    expect(stats.failedSteps).toBe(2)
    expect(stats.missingSteps).toBe(1)
  })
})
