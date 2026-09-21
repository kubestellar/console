import { describe, it, expect, beforeEach } from 'vitest'
import {
  findSimilarResolutionsStandalone,
  generateResolutionPromptContext,
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
// findSimilarResolutionsStandalone
// ---------------------------------------------------------------------------

describe('findSimilarResolutionsStandalone', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns empty array when no resolutions exist', () => {
    const results = findSimilarResolutionsStandalone({ type: 'CrashLoopBackOff' })
    expect(results).toEqual([])
  })

  it('finds matching personal resolutions', () => {
    const res = makeResolution({
      id: 'res-1',
      issueSignature: { type: 'CrashLoopBackOff', resourceKind: 'Pod' },
    })
    seedLocalStorage([res])

    const results = findSimilarResolutionsStandalone({
      type: 'CrashLoopBackOff',
      resourceKind: 'Pod',
    })

    expect(results.length).toBe(1)
    expect(results[0].source).toBe('personal')
    expect(results[0].similarity).toBe(1)
  })

  it('finds matching shared resolutions', () => {
    const res = makeResolution({
      id: 'res-shared-1',
      visibility: 'shared',
      issueSignature: { type: 'OOMKilled', resourceKind: 'Pod' },
    })
    seedLocalStorage([], [res])

    const results = findSimilarResolutionsStandalone({
      type: 'OOMKilled',
      resourceKind: 'Pod',
    })

    expect(results.length).toBe(1)
    expect(results[0].source).toBe('shared')
  })

  it('excludes resolutions below minSimilarity', () => {
    const res = makeResolution({
      id: 'res-unrelated',
      issueSignature: { type: 'NodeNotReady', resourceKind: 'Node' },
    })
    seedLocalStorage([res])

    const results = findSimilarResolutionsStandalone(
      { type: 'CrashLoopBackOff', resourceKind: 'Pod' },
      { minSimilarity: 0.5 },
    )

    expect(results.length).toBe(0)
  })

  it('sorts results by similarity descending', () => {
    const exact = makeResolution({
      id: 'res-exact',
      issueSignature: { type: 'CrashLoopBackOff', resourceKind: 'Pod' },
    })
    const partial = makeResolution({
      id: 'res-partial',
      issueSignature: { type: 'CrashLoopBackOff', resourceKind: 'Deployment' },
    })
    seedLocalStorage([partial, exact])

    const results = findSimilarResolutionsStandalone(
      { type: 'CrashLoopBackOff', resourceKind: 'Pod' },
      { minSimilarity: 0.5 },
    )

    expect(results.length).toBe(2)
    expect(results[0].resolution.id).toBe('res-exact')
    expect(results[0].similarity).toBeGreaterThanOrEqual(results[1].similarity)
  })

  it('respects the limit option', () => {
    const resolutions = Array.from({ length: 10 }, (_, i) =>
      makeResolution({
        id: `res-${i}`,
        issueSignature: { type: 'CrashLoopBackOff', resourceKind: 'Pod' },
      }),
    )
    seedLocalStorage(resolutions)

    const results = findSimilarResolutionsStandalone(
      { type: 'CrashLoopBackOff', resourceKind: 'Pod' },
      { limit: 3 },
    )

    expect(results.length).toBe(3)
  })

  it('combines personal and shared results', () => {
    const personal = makeResolution({
      id: 'res-p',
      issueSignature: { type: 'OOMKilled', resourceKind: 'Pod' },
    })
    const shared = makeResolution({
      id: 'res-s',
      visibility: 'shared',
      issueSignature: { type: 'OOMKilled', resourceKind: 'Pod' },
    })
    seedLocalStorage([personal], [shared])

    const results = findSimilarResolutionsStandalone({
      type: 'OOMKilled',
      resourceKind: 'Pod',
    })

    expect(results.length).toBe(2)
    const sources = results.map(r => r.source)
    expect(sources).toContain('personal')
    expect(sources).toContain('shared')
  })

  it('handles corrupted localStorage gracefully and returns empty array', () => {
    localStorage.setItem('kc_resolutions', 'NOT VALID JSON {{{')
    localStorage.setItem('kc_shared_resolutions', '!!broken!!')

    const results = findSimilarResolutionsStandalone({
      type: 'CrashLoopBackOff',
      resourceKind: 'Pod',
    })

    expect(results).toEqual([])
  })

  it('uses default limit of 5 when no limit is specified', () => {
    const resolutions = Array.from({ length: 10 }, (_, i) =>
      makeResolution({
        id: `res-limit-${i}`,
        issueSignature: { type: 'CrashLoopBackOff', resourceKind: 'Pod' },
      }),
    )
    seedLocalStorage(resolutions)

    const results = findSimilarResolutionsStandalone({
      type: 'CrashLoopBackOff',
      resourceKind: 'Pod',
    })

    expect(results.length).toBe(5)
  })

  it('allows a custom minSimilarity of 0 to include all resolutions', () => {
    const unrelated = makeResolution({
      id: 'res-low-sim',
      issueSignature: { type: 'NodeNotReady', resourceKind: 'Node' },
    })
    seedLocalStorage([unrelated])

    const results = findSimilarResolutionsStandalone(
      { type: 'CrashLoopBackOff', resourceKind: 'Pod' },
      { minSimilarity: 0 },
    )

    // Should include even completely unrelated resolutions when threshold is 0
    expect(results.length).toBe(1)
    expect(results[0].similarity).toBe(0)
  })
})

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
