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
// calculateSignatureSimilarity
// ---------------------------------------------------------------------------

describe('calculateSignatureSimilarity', () => {
  it('returns 1 for identical signatures', () => {
    const sig: IssueSignature = { type: 'CrashLoopBackOff', resourceKind: 'Pod' }
    expect(calculateSignatureSimilarity(sig, sig)).toBe(1)
  })

  it('returns 0 for completely different signatures', () => {
    const a: IssueSignature = { type: 'OOMKilled', resourceKind: 'Pod' }
    const b: IssueSignature = { type: 'NodeNotReady', resourceKind: 'Node' }
    expect(calculateSignatureSimilarity(a, b)).toBe(0)
  })

  it('gives partial score when type matches but resourceKind differs', () => {
    const a: IssueSignature = { type: 'CrashLoopBackOff', resourceKind: 'Pod' }
    const b: IssueSignature = { type: 'CrashLoopBackOff', resourceKind: 'Deployment' }
    const score = calculateSignatureSimilarity(a, b)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })

  it('includes namespace weight when both have it', () => {
    const base: IssueSignature = { type: 'CrashLoopBackOff', resourceKind: 'Pod', namespace: 'default' }
    const same: IssueSignature = { type: 'CrashLoopBackOff', resourceKind: 'Pod', namespace: 'default' }
    const diff: IssueSignature = { type: 'CrashLoopBackOff', resourceKind: 'Pod', namespace: 'kube-system' }

    expect(calculateSignatureSimilarity(base, same)).toBeGreaterThan(
      calculateSignatureSimilarity(base, diff),
    )
  })

  it('returns 0 when both signatures have only empty type strings', () => {
    const a: IssueSignature = { type: '' }
    const b: IssueSignature = { type: '' }
    // Both types are empty strings — they match but test the edge case
    expect(calculateSignatureSimilarity(a, b)).toBe(0)
  })

  it('scores higher when errorPattern words overlap', () => {
    const base: IssueSignature = {
      type: 'CrashLoopBackOff',
      resourceKind: 'Pod',
      errorPattern: 'container exited with code 137',
    }
    const similar: IssueSignature = {
      type: 'CrashLoopBackOff',
      resourceKind: 'Pod',
      errorPattern: 'container exited with signal SIGKILL code 137',
    }
    const different: IssueSignature = {
      type: 'CrashLoopBackOff',
      resourceKind: 'Pod',
      errorPattern: 'missing configuration file for startup',
    }

    const scoreSimilar = calculateSignatureSimilarity(base, similar)
    const scoreDifferent = calculateSignatureSimilarity(base, different)
    expect(scoreSimilar).toBeGreaterThan(scoreDifferent)
  })

  it('handles type-only signatures without resourceKind', () => {
    const a: IssueSignature = { type: 'QuotaExceeded' }
    const b: IssueSignature = { type: 'QuotaExceeded' }
    // With only type matching, score should be 1.0 (3/3 factors)
    expect(calculateSignatureSimilarity(a, b)).toBe(1)
  })

  it('ignores namespace when only one side has it', () => {
    const withNs: IssueSignature = { type: 'OOMKilled', namespace: 'prod' }
    const withoutNs: IssueSignature = { type: 'OOMKilled' }
    // Namespace factor should be skipped entirely (not penalized)
    expect(calculateSignatureSimilarity(withNs, withoutNs)).toBe(1)
  })
})

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
// useResolutions hook
// ---------------------------------------------------------------------------

describe('useResolutions', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('getResolution finds by id in personal list', () => {
    const existing = makeResolution({ id: 'find-me' })
    seedLocalStorage([existing])

    const { result } = renderHook(() => useResolutions())
    expect(result.current.getResolution('find-me')).toBeDefined()
    expect(result.current.getResolution('find-me')!.id).toBe('find-me')
  })

  it('getResolution finds by id in shared list', () => {
    const existing = makeResolution({ id: 'shared-find', visibility: 'shared' })
    seedLocalStorage([], [existing])

    const { result } = renderHook(() => useResolutions())
    expect(result.current.getResolution('shared-find')).toBeDefined()
  })

  it('getResolution returns undefined for non-existent id', () => {
    const { result } = renderHook(() => useResolutions())
    expect(result.current.getResolution('nope')).toBeUndefined()
  })

  it('shareResolution moves from personal to shared', () => {
    const existing = makeResolution({ id: 'to-share' })
    seedLocalStorage([existing])

    const { result } = renderHook(() => useResolutions())
    expect(result.current.resolutions.length).toBe(1)
    expect(result.current.sharedResolutions.length).toBe(0)

    act(() => {
      result.current.shareResolution('to-share')
    })

    expect(result.current.resolutions.length).toBe(0)
    expect(result.current.sharedResolutions.length).toBe(1)
    expect(result.current.sharedResolutions[0].visibility).toBe('shared')
    expect(result.current.sharedResolutions[0].sharedBy).toBe('You')
  })

  it('findSimilarResolutions returns matching results', () => {
    const existing = makeResolution({
      id: 'match-me',
      issueSignature: { type: 'OOMKilled', resourceKind: 'Pod' },
    })
    seedLocalStorage([existing])

    const { result } = renderHook(() => useResolutions())
    const similar = result.current.findSimilarResolutions({
      type: 'OOMKilled',
      resourceKind: 'Pod',
    })

    expect(similar.length).toBe(1)
    expect(similar[0].resolution.id).toBe('match-me')
  })

  it('allResolutions combines personal and shared', () => {
    const personal = makeResolution({ id: 'p1' })
    const shared = makeResolution({ id: 's1', visibility: 'shared' })
    seedLocalStorage([personal], [shared])

    const { result } = renderHook(() => useResolutions())
    expect(result.current.allResolutions.length).toBe(2)
  })

  it('exposes detectIssueSignature as a property', () => {
    const { result } = renderHook(() => useResolutions())
    expect(typeof result.current.detectIssueSignature).toBe('function')
    const sig = result.current.detectIssueSignature('CrashLoopBackOff error')
    expect(sig.type).toBe('CrashLoopBackOff')
  })

  it('findSimilarResolutions sorts by effectiveness then similarity', () => {
    // High success rate, exact match
    const highSuccess = makeResolution({
      id: 'high-success',
      issueSignature: { type: 'OOMKilled', resourceKind: 'Pod' },
      effectiveness: { timesUsed: 10, timesSuccessful: 9 },
    })
    // Low success rate, exact match
    const lowSuccess = makeResolution({
      id: 'low-success',
      issueSignature: { type: 'OOMKilled', resourceKind: 'Pod' },
      effectiveness: { timesUsed: 10, timesSuccessful: 2 },
    })
    seedLocalStorage([lowSuccess, highSuccess])

    const { result } = renderHook(() => useResolutions())
    const similar = result.current.findSimilarResolutions({
      type: 'OOMKilled',
      resourceKind: 'Pod',
    })

    // High success rate should come first
    expect(similar.length).toBe(2)
    expect(similar[0].resolution.id).toBe('high-success')
    expect(similar[1].resolution.id).toBe('low-success')
  })

  it('findSimilarResolutions respects limit option', () => {
    const resolutions = Array.from({ length: 15 }, (_, i) =>
      makeResolution({
        id: `res-hook-limit-${i}`,
        issueSignature: { type: 'CrashLoopBackOff', resourceKind: 'Pod' },
      }),
    )
    seedLocalStorage(resolutions)

    const { result } = renderHook(() => useResolutions())
    const similar = result.current.findSimilarResolutions(
      { type: 'CrashLoopBackOff', resourceKind: 'Pod' },
      { limit: 3 },
    )

    expect(similar.length).toBe(3)
  })

  it('findSimilarResolutions uses default limit of 10', () => {
    const resolutions = Array.from({ length: 15 }, (_, i) =>
      makeResolution({
        id: `res-default-limit-${i}`,
        issueSignature: { type: 'CrashLoopBackOff', resourceKind: 'Pod' },
      }),
    )
    seedLocalStorage(resolutions)

    const { result } = renderHook(() => useResolutions())
    const similar = result.current.findSimilarResolutions({
      type: 'CrashLoopBackOff',
      resourceKind: 'Pod',
    })

    expect(similar.length).toBe(10)
  })

})
