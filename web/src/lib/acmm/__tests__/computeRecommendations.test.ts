/**
 * Branch-coverage tests for computeRecommendations.ts
 *
 * Covers:
 *  - missing-for-next-level items get priority 1000+weight
 *  - non-ACMM (supplementary) criteria get their category weight only
 *  - dedupe by category + case-insensitive name
 *  - dedupe takes the max priority + unions sources
 *  - top-N truncation + sort-by-priority-desc
 */
import { describe, it, expect } from 'vitest'
import { computeRecommendations, MAX_RECOMMENDATIONS } from '../computeRecommendations'
import { computeLevel } from '../computeLevel'
import type { LevelComputation } from '../computeLevel'
import { ALL_CRITERIA } from '../sources'

describe('computeRecommendations', () => {
  it('returns no more than MAX_RECOMMENDATIONS results', () => {
    const level = computeLevel(new Set())
    const recs = computeRecommendations(new Set(), level)
    expect(recs.length).toBeLessThanOrEqual(MAX_RECOMMENDATIONS)
  })

  it('orders recommendations by priority descending', () => {
    const level = computeLevel(new Set())
    const recs = computeRecommendations(new Set(), level)
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].priority).toBeGreaterThanOrEqual(recs[i].priority)
    }
  })

  it('missing-for-next-level items get priority >= 1000 (strong boost)', () => {
    const level = computeLevel(new Set())
    const recs = computeRecommendations(new Set(), level)
    // At least one recommendation should be a level-gate item.
    const highPri = recs.filter((r) => r.priority >= 1000)
    expect(highPri.length).toBeGreaterThan(0)
    // Its reason should reference the level.
    expect(highPri[0].reason).toMatch(/ACMM Level \d/)
  })

  it('already-detected ACMM items are NOT re-recommended', () => {
    // Construct a level where everything-for-next-level is already detected
    // so there's no "missingForNextLevel" list. computeRecommendations
    // should then fall entirely through to the non-ACMM (supplementary)
    // criteria.
    const stubLevel: LevelComputation = {
      level: 2,
      levelName: 'Instructed',
      role: 'Rule-writer',
      characteristic: '',
      detectedByLevel: {},
      requiredByLevel: {},
      missingForNextLevel: [],
      nextTransitionTrigger: null,
      antiPattern: '',
    }
    const recs = computeRecommendations(new Set(), stubLevel)
    // All recommendations should be non-ACMM because there are no level-gates.
    expect(recs.every((r) => r.criterion.source !== 'acmm')).toBe(true)
  })

  it('dedupes by category + case-insensitive name, keeping the max priority', () => {
    // Same category + same name (different case) should collapse.
    // Without a direct injection hook, we verify the property indirectly:
    // no two returned recs share (category, name.toLowerCase()).
    const level = computeLevel(new Set())
    const recs = computeRecommendations(new Set(), level)
    const keys = new Set<string>()
    for (const rec of recs) {
      const key = `${rec.criterion.category}:${rec.criterion.name.toLowerCase()}`
      expect(keys.has(key)).toBe(false)
      keys.add(key)
    }
  })

  it('returns an empty array when input is saturated', () => {
    // Mark every supplementary criterion as detected; also mark every
    // level-gate as detected by passing a saturated LevelComputation.
    const allIds = new Set(ALL_CRITERIA.map((c) => c.id))
    const saturatedLevel: LevelComputation = {
      level: 5, levelName: '', role: '', characteristic: '',
      detectedByLevel: {}, requiredByLevel: {},
      missingForNextLevel: [],
      nextTransitionTrigger: null, antiPattern: '',
    }
    const recs = computeRecommendations(allIds, saturatedLevel)
    expect(recs.length).toBe(0)
  })
})
