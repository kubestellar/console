/**
 * Tests for acmm/missionPrompts.ts — pure prompt builders.
 */
import { describe, it, expect } from 'vitest'
import {
  detectionLabel,
  singleRecommendationPrompt,
  singleCriterionPrompt,
  allRecommendationsPrompt,
  levelCompletionPrompt,
} from '../missionPrompts'
import type { Criterion } from '../sources/types'
import type { Recommendation } from '../computeRecommendations'

const FAKE_CRITERION: Criterion = {
  id: 'acmm:test-suite',
  source: 'acmm',
  level: 2,
  category: 'readiness',
  name: 'Test suite',
  description: 'A comprehensive test suite with CI gating.',
  rationale: 'Tests are the foundation of safe automation.',
  detection: { type: 'any-of', pattern: ['vitest.config.ts', 'jest.config.ts'] },
  referencePath: 'web/vitest.config.ts',
}

const FAKE_CRITERION_NO_REF: Criterion = {
  ...FAKE_CRITERION,
  id: 'fullsend:ci-cd-maturity',
  source: 'fullsend',
  referencePath: undefined,
  detection: { type: 'path', pattern: '.github/workflows/' },
}

const FAKE_REC: Recommendation = {
  criterion: FAKE_CRITERION,
  priority: 1080,
  reason: 'Required for ACMM Level 2',
  sources: ['acmm'],
}

describe('detectionLabel', () => {
  it('joins array patterns with " · "', () => {
    expect(detectionLabel({ type: 'any-of', pattern: ['a.ts', 'b.ts'] }))
      .toBe('a.ts · b.ts')
  })

  it('returns string pattern as-is', () => {
    expect(detectionLabel({ type: 'path', pattern: 'CLAUDE.md' }))
      .toBe('CLAUDE.md')
  })
})

describe('singleRecommendationPrompt', () => {
  it('includes criterion name, repo, reason, detection, and reference', () => {
    const prompt = singleRecommendationPrompt(FAKE_REC, 'myorg/myrepo')
    expect(prompt).toContain('Test suite')
    expect(prompt).toContain('myorg/myrepo')
    expect(prompt).toContain('Required for ACMM Level 2')
    expect(prompt).toContain('vitest.config.ts · jest.config.ts')
    expect(prompt).toContain('Reference implementation: web/vitest.config.ts')
    expect(prompt).toContain('Source: ACMM')
    expect(prompt).toContain('Criterion ID: acmm:test-suite')
  })
})

describe('singleCriterionPrompt', () => {
  it('uses the criterion rationale as the reason', () => {
    const prompt = singleCriterionPrompt(FAKE_CRITERION, 'org/repo')
    expect(prompt).toContain('Tests are the foundation of safe automation.')
  })

  it('omits reference line when referencePath is undefined', () => {
    const prompt = singleCriterionPrompt(FAKE_CRITERION_NO_REF, 'org/repo')
    expect(prompt).not.toContain('Reference implementation')
    expect(prompt).toContain('Source: Fullsend')
  })
})

describe('allRecommendationsPrompt', () => {
  it('numbers the items and includes detection patterns', () => {
    const recs: Recommendation[] = [
      FAKE_REC,
      { ...FAKE_REC, criterion: { ...FAKE_CRITERION, name: 'Coverage gate', id: 'acmm:coverage' } },
    ]
    const prompt = allRecommendationsPrompt(recs, 'org/repo')
    expect(prompt).toContain('1. Test suite')
    expect(prompt).toContain('2. Coverage gate')
    expect(prompt).toContain('org/repo')
    expect(prompt).toContain('Should I push and open a PR with all changes?')
  })
})

describe('levelCompletionPrompt', () => {
  it('includes the level number and unlock message', () => {
    const prompt = levelCompletionPrompt([FAKE_CRITERION], 3, 'org/repo')
    expect(prompt).toContain('Finish ACMM Level 3')
    expect(prompt).toContain('completing L3 unlocks L4')
    expect(prompt).toContain('org/repo')
    expect(prompt).toContain('1. Test suite')
  })
})
