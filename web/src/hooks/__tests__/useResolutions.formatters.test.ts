import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  detectIssueSignature,
  findSimilarResolutionsStandalone,
  generateResolutionPromptContext,
  calculateSignatureSimilarity,
  useResolutions,
  type IssueSignature,
  type Resolution,
  type SimilarResolution,
} from '../useResolutions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResolution(overrides: Partial<Resolution> = {}): Resolution {
  return {
    id: `res-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    missionId: 'mission-1',
    userId: 'user-1',
    title: 'Fix CrashLoopBackOff',
    visibility: 'private',
    issueSignature: {
      type: 'CrashLoopBackOff',
      resourceKind: 'Pod',
    },
    resolution: {
      summary: 'Increase memory limits',
      steps: ['kubectl edit deployment', 'Set memory to 512Mi'],
    },
    context: {},
    effectiveness: { timesUsed: 5, timesSuccessful: 4 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function seedLocalStorage(
  personal: Resolution[] = [],
  shared: Resolution[] = [],
): void {
  if (personal.length > 0) {
    localStorage.setItem('kc_resolutions', JSON.stringify(personal))
  }
  if (shared.length > 0) {
    localStorage.setItem('kc_shared_resolutions', JSON.stringify(shared))
  }
}

// ---------------------------------------------------------------------------
// generateResolutionPromptContext
// ---------------------------------------------------------------------------

describe('generateResolutionPromptContext', () => {
  it('returns empty string for empty input', () => {
    expect(generateResolutionPromptContext([])).toBe('')
  })

  it('includes resolution title and summary', () => {
    const similar: SimilarResolution[] = [
      {
        resolution: makeResolution({ title: 'Fix OOM issue', resolution: { summary: 'Bump memory', steps: [] } }),
        similarity: 0.9,
        source: 'personal',
      },
    ]

    const ctx = generateResolutionPromptContext(similar)
    expect(ctx).toContain('Fix OOM issue')
    expect(ctx).toContain('Bump memory')
  })

  it('labels personal resolutions as "Your history"', () => {
    const similar: SimilarResolution[] = [
      {
        resolution: makeResolution(),
        similarity: 0.9,
        source: 'personal',
      },
    ]

    const ctx = generateResolutionPromptContext(similar)
    expect(ctx).toContain('Your history')
  })

  it('labels shared resolutions as "Team knowledge"', () => {
    const similar: SimilarResolution[] = [
      {
        resolution: makeResolution({ visibility: 'shared' }),
        similarity: 0.9,
        source: 'shared',
      },
    ]

    const ctx = generateResolutionPromptContext(similar)
    expect(ctx).toContain('Team knowledge')
  })

  it('shows success rate when timesUsed > 0', () => {
    const similar: SimilarResolution[] = [
      {
        resolution: makeResolution({
          effectiveness: { timesUsed: 10, timesSuccessful: 8 },
        }),
        similarity: 0.9,
        source: 'personal',
      },
    ]

    const ctx = generateResolutionPromptContext(similar)
    expect(ctx).toContain('80% success rate')
  })

  it('shows "new resolution" when timesUsed is 0', () => {
    const similar: SimilarResolution[] = [
      {
        resolution: makeResolution({
          effectiveness: { timesUsed: 0, timesSuccessful: 0 },
        }),
        similarity: 0.9,
        source: 'personal',
      },
    ]

    const ctx = generateResolutionPromptContext(similar)
    expect(ctx).toContain('new resolution')
  })

  it('limits output to 3 resolutions even when given more', () => {
    const similar: SimilarResolution[] = Array.from({ length: 5 }, (_, i) => ({
      resolution: makeResolution({ id: `res-${i}`, title: `Resolution ${i}` }),
      similarity: 0.9 - i * 0.1,
      source: 'personal' as const,
    }))

    const ctx = generateResolutionPromptContext(similar)
    expect(ctx).toContain('Resolution 0')
    expect(ctx).toContain('Resolution 2')
    expect(ctx).not.toContain('Resolution 3')
    expect(ctx).not.toContain('Resolution 4')
  })

  it('includes steps when present', () => {
    const similar: SimilarResolution[] = [
      {
        resolution: makeResolution({
          resolution: {
            summary: 'Fix it',
            steps: ['Step A', 'Step B', 'Step C'],
          },
        }),
        similarity: 0.9,
        source: 'personal',
      },
    ]

    const ctx = generateResolutionPromptContext(similar)
    expect(ctx).toContain('Step A')
    expect(ctx).toContain('Step B')
    expect(ctx).toContain('Step C')
  })
})
// ---------------------------------------------------------------------------
// useResolutions hook
// ---------------------------------------------------------------------------

describe('useResolutions', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('generatePromptContext returns empty string for no matches', () => {
    const { result } = renderHook(() => useResolutions())
    expect(result.current.generatePromptContext([])).toBe('')
  })

  it('generatePromptContext formats personal source label', () => {
    const { result } = renderHook(() => useResolutions())
    const similar: SimilarResolution[] = [
      {
        resolution: makeResolution({
          title: 'OOM Fix',
          resolution: { summary: 'Raise limits', steps: ['step 1', 'step 2', 'step 3'] },
          effectiveness: { timesUsed: 5, timesSuccessful: 4 },
        }),
        similarity: 0.95,
        source: 'personal',
      },
    ]

    const ctx = result.current.generatePromptContext(similar)
    expect(ctx).toContain('Personal')
    expect(ctx).toContain('OOM Fix')
    expect(ctx).toContain('80% success')
    expect(ctx).toContain('Raise limits')
  })

  it('generatePromptContext labels shared source as Org', () => {
    const { result } = renderHook(() => useResolutions())
    const similar: SimilarResolution[] = [
      {
        resolution: makeResolution({
          title: 'Team Fix',
          resolution: { summary: 'Team solution', steps: [] },
          effectiveness: { timesUsed: 0, timesSuccessful: 0 },
        }),
        similarity: 0.8,
        source: 'shared',
      },
    ]

    const ctx = result.current.generatePromptContext(similar)
    expect(ctx).toContain('Org')
    expect(ctx).toContain('not yet tested')
  })

  it('generatePromptContext truncates steps with ellipsis when more than 2', () => {
    const { result } = renderHook(() => useResolutions())
    const similar: SimilarResolution[] = [
      {
        resolution: makeResolution({
          resolution: {
            summary: 'Multi-step fix',
            steps: ['First', 'Second', 'Third', 'Fourth'],
          },
          effectiveness: { timesUsed: 1, timesSuccessful: 1 },
        }),
        similarity: 0.9,
        source: 'personal',
      },
    ]

    const ctx = result.current.generatePromptContext(similar)
    expect(ctx).toContain('First')
    expect(ctx).toContain('Second')
    expect(ctx).toContain('...')
    // Third and Fourth should NOT appear since hook limits to first 2
    expect(ctx).not.toContain('Third')
    expect(ctx).not.toContain('Fourth')
  })

})
