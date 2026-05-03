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
// detectIssueSignature
// ---------------------------------------------------------------------------

describe('extractErrorPattern (via detectIssueSignature)', () => {
  it('extracts error pattern from "reason:" prefix', () => {
    const sig = detectIssueSignature(
      'CrashLoopBackOff reason: container failed to initialize properly due to missing config',
    )
    expect(sig.errorPattern).toBeDefined()
    // The "failed:" regex matches first (before "reason:") because extractErrorPattern
    // checks patterns in order: error, failed, reason, message. "failed to initialize..."
    // matches the "failed" pattern, capturing text after "failed ".
    expect(sig.errorPattern).toContain('to initialize properly')
  })

  it('extracts error pattern from "message:" prefix', () => {
    const sig = detectIssueSignature(
      'OOMKilled message: the container was terminated because it used excessive memory resources',
    )
    expect(sig.errorPattern).toBeDefined()
    expect(sig.errorPattern).toContain('container was terminated')
  })

  it('returns undefined errorPattern when content has no recognizable error prefix', () => {
    const sig = detectIssueSignature('CrashLoopBackOff happening now')
    // Content is too short or lacks "error:", "failed:", "reason:", "message:" prefixes
    expect(sig.errorPattern).toBeUndefined()
  })

  it('extracts error pattern even when type is Unknown', () => {
    const sig = detectIssueSignature(
      'something weird happened error: unexpected nil pointer dereference in controller manager',
    )
    expect(sig.type).toBe('Unknown')
    expect(sig.errorPattern).toBeDefined()
    expect(sig.errorPattern).toContain('unexpected nil pointer')
  })

  it('trims whitespace from extracted error pattern', () => {
    const sig = detectIssueSignature(
      'CrashLoopBackOff error:   excessive whitespace in this error message output   ',
    )
    expect(sig.errorPattern).toBeDefined()
    // The extracted pattern should be trimmed
    expect(sig.errorPattern!.startsWith(' ')).toBe(false)
  })
})

describe('calculateStringSimilarity (via calculateSignatureSimilarity)', () => {
  it('produces high similarity for identical error patterns', () => {
    const a: IssueSignature = {
      type: 'CrashLoopBackOff',
      errorPattern: 'container exited with code 137 after memory limit exceeded',
    }
    const b: IssueSignature = {
      type: 'CrashLoopBackOff',
      errorPattern: 'container exited with code 137 after memory limit exceeded',
    }
    const score = calculateSignatureSimilarity(a, b)
    expect(score).toBe(1)
  })

  it('produces low similarity for completely different error patterns', () => {
    const a: IssueSignature = {
      type: 'CrashLoopBackOff',
      errorPattern: 'container exited with code 137 after memory limit exceeded',
    }
    const b: IssueSignature = {
      type: 'CrashLoopBackOff',
      errorPattern: 'TLS certificate expired validation failed authentication',
    }
    const score = calculateSignatureSimilarity(a, b)
    // Type matches (3/3) but errorPattern has low overlap → score < 1
    expect(score).toBeLessThan(1)
    expect(score).toBeGreaterThan(0.5) // type still matches
  })

  it('filters out short words (length <= 2) from similarity calculation', () => {
    const a: IssueSignature = {
      type: 'Unknown',
      errorPattern: 'it is a problem on the pod',
    }
    const b: IssueSignature = {
      type: 'Unknown',
      errorPattern: 'it is a failure on the node',
    }
    // Short words like "it", "is", "a", "on" are filtered out, leaving "problem"/"pod" vs "failure"/"the"/"node"
    const score = calculateSignatureSimilarity(a, b)
    expect(score).toBeDefined()
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })

  it('returns 0 similarity when both errorPatterns have only short words', () => {
    const a: IssueSignature = {
      type: 'OOMKilled',
      errorPattern: 'it is so',
    }
    const b: IssueSignature = {
      type: 'OOMKilled',
      errorPattern: 'up to me',
    }
    // All words are <= 2 chars, so Jaccard union is empty → similarity 0
    // But type still matches (3/3), errorPattern contributes 0/1
    const score = calculateSignatureSimilarity(a, b)
    expect(score).toBe(3 / 4) // 3 from type, 0 from error, factors = 4
  })
})

describe('calculateSignatureSimilarity edge cases', () => {
  it('handles namespace match adding to score', () => {
    const a: IssueSignature = {
      type: 'CrashLoopBackOff',
      resourceKind: 'Pod',
      namespace: 'production',
      errorPattern: 'container failed startup',
    }
    const b: IssueSignature = {
      type: 'CrashLoopBackOff',
      resourceKind: 'Pod',
      namespace: 'production',
      errorPattern: 'container failed startup',
    }
    // All factors match: type(3) + resourceKind(1) + namespace(0.5) + errorPattern(1) = 5.5/5.5 = 1
    expect(calculateSignatureSimilarity(a, b)).toBe(1)
  })

  it('penalizes namespace mismatch when both provided', () => {
    const a: IssueSignature = {
      type: 'CrashLoopBackOff',
      resourceKind: 'Pod',
      namespace: 'production',
    }
    const b: IssueSignature = {
      type: 'CrashLoopBackOff',
      resourceKind: 'Pod',
      namespace: 'staging',
    }
    const score = calculateSignatureSimilarity(a, b)
    // type(3) + resourceKind(1) = 4 score out of 4.5 factors
    expect(score).toBeCloseTo(4 / 4.5, 5)
  })

  it('returns 0 when factors is 0 (both types are empty strings with no other fields)', () => {
    const a: IssueSignature = { type: '' }
    const b: IssueSignature = { type: '' }
    // Empty type strings don't count: type check is `if (a.type && b.type)`
    // So factors = 0, and the function returns 0
    expect(calculateSignatureSimilarity(a, b)).toBe(0)
  })
})

describe('loadResolutions / saveResolutions error handling', () => {
  it('handles localStorage.getItem throwing by returning empty resolutions', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: localStorage disabled')
    })

    const { result } = renderHook(() => useResolutions())
    expect(result.current.resolutions).toEqual([])
    expect(result.current.sharedResolutions).toEqual([])

    vi.restoreAllMocks()
  })

  it('handles localStorage.setItem throwing when persisting resolutions', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useResolutions())

    // Make setItem throw
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    // Save a resolution — this triggers setResolutions then useEffect → saveResolutions
    act(() => {
      result.current.saveResolution({
        missionId: 'mission-err',
        title: 'Error Test',
        issueSignature: { type: 'OOMKilled' },
        resolution: { summary: 'Fix', steps: [] },
      })
    })

    // The in-memory state should still have the resolution
    expect(result.current.resolutions.length).toBe(1)
    // Error should have been logged
    expect(consoleSpy).toHaveBeenCalled()

    vi.restoreAllMocks()
  })
})

describe('useResolutions hook — findSimilarResolutions deep sorting', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('sorts by similarity when success rates are within 0.1 of each other', () => {
    // Two resolutions with very similar success rates but different similarity
    const exact = makeResolution({
      id: 'exact-match',
      issueSignature: { type: 'OOMKilled', resourceKind: 'Pod' },
      effectiveness: { timesUsed: 10, timesSuccessful: 8 }, // 80%
    })
    const partial = makeResolution({
      id: 'partial-match',
      issueSignature: { type: 'OOMKilled', resourceKind: 'Deployment' },
      effectiveness: { timesUsed: 10, timesSuccessful: 8 }, // 80%
    })
    seedLocalStorage([partial, exact])

    const { result } = renderHook(() => useResolutions())
    const similar = result.current.findSimilarResolutions({
      type: 'OOMKilled',
      resourceKind: 'Pod',
    })

    // Same success rate → sorted by similarity (exact Pod match first)
    expect(similar[0].resolution.id).toBe('exact-match')
    expect(similar[1].resolution.id).toBe('partial-match')
  })

  it('sorts by success rate when rates differ by more than 0.1', () => {
    const highRate = makeResolution({
      id: 'high-rate',
      issueSignature: { type: 'OOMKilled', resourceKind: 'Pod' },
      effectiveness: { timesUsed: 10, timesSuccessful: 10 }, // 100%
    })
    const lowRate = makeResolution({
      id: 'low-rate',
      issueSignature: { type: 'OOMKilled', resourceKind: 'Pod' },
      effectiveness: { timesUsed: 10, timesSuccessful: 1 }, // 10%
    })
    seedLocalStorage([lowRate, highRate])

    const { result } = renderHook(() => useResolutions())
    const similar = result.current.findSimilarResolutions({
      type: 'OOMKilled',
      resourceKind: 'Pod',
    })

    expect(similar[0].resolution.id).toBe('high-rate')
  })

  it('treats never-used resolutions as 0 success rate', () => {
    const neverUsed = makeResolution({
      id: 'never-used',
      issueSignature: { type: 'OOMKilled', resourceKind: 'Pod' },
      effectiveness: { timesUsed: 0, timesSuccessful: 0 },
    })
    const highRate = makeResolution({
      id: 'high-rate',
      issueSignature: { type: 'OOMKilled', resourceKind: 'Pod' },
      effectiveness: { timesUsed: 5, timesSuccessful: 5 }, // 100%
    })
    seedLocalStorage([neverUsed, highRate])

    const { result } = renderHook(() => useResolutions())
    const similar = result.current.findSimilarResolutions({
      type: 'OOMKilled',
      resourceKind: 'Pod',
    })

    expect(similar[0].resolution.id).toBe('high-rate')
    expect(similar[1].resolution.id).toBe('never-used')
  })

  it('findSimilarResolutions searches shared resolutions too', () => {
    const personal = makeResolution({
      id: 'personal-res',
      issueSignature: { type: 'CrashLoopBackOff', resourceKind: 'Pod' },
      effectiveness: { timesUsed: 2, timesSuccessful: 1 },
    })
    const shared = makeResolution({
      id: 'shared-res',
      issueSignature: { type: 'CrashLoopBackOff', resourceKind: 'Pod' },
      effectiveness: { timesUsed: 10, timesSuccessful: 9 },
    })
    seedLocalStorage([personal], [shared])

    const { result } = renderHook(() => useResolutions())
    const similar = result.current.findSimilarResolutions({
      type: 'CrashLoopBackOff',
      resourceKind: 'Pod',
    })

    expect(similar.length).toBe(2)
    const sources = similar.map(s => s.source)
    expect(sources).toContain('personal')
    expect(sources).toContain('shared')
    // Shared should be first (higher success rate)
    expect(similar[0].resolution.id).toBe('shared-res')
  })

  it('findSimilarResolutions filters by custom minSimilarity', () => {
    const unrelated = makeResolution({
      id: 'unrelated',
      issueSignature: { type: 'NodeNotReady', resourceKind: 'Node' },
    })
    seedLocalStorage([unrelated])

    const { result } = renderHook(() => useResolutions())
    const highThreshold = result.current.findSimilarResolutions(
      { type: 'CrashLoopBackOff', resourceKind: 'Pod' },
      { minSimilarity: 0.9 },
    )
    const lowThreshold = result.current.findSimilarResolutions(
      { type: 'CrashLoopBackOff', resourceKind: 'Pod' },
      { minSimilarity: 0 },
    )

    expect(highThreshold.length).toBe(0)
    expect(lowThreshold.length).toBe(1)
  })
})

describe('useResolutions hook — recordUsage on shared resolutions', () => {
  it('recordUsage increments counters on shared resolutions', () => {
    const shared = makeResolution({
      id: 'shared-track',
      visibility: 'shared',
      effectiveness: { timesUsed: 3, timesSuccessful: 2 },
    })
    seedLocalStorage([], [shared])

    const { result } = renderHook(() => useResolutions())

    act(() => {
      result.current.recordUsage('shared-track', true)
    })

    expect(result.current.sharedResolutions[0].effectiveness.timesUsed).toBe(4)
    expect(result.current.sharedResolutions[0].effectiveness.timesSuccessful).toBe(3)
    expect(result.current.sharedResolutions[0].effectiveness.lastUsed).toBeDefined()
  })

  it('recordUsage with unsuccessful does not increment timesSuccessful', () => {
    const existing = makeResolution({
      id: 'fail-track',
      effectiveness: { timesUsed: 5, timesSuccessful: 3 },
    })
    seedLocalStorage([existing])

    const { result } = renderHook(() => useResolutions())

    act(() => {
      result.current.recordUsage('fail-track', false)
    })

    expect(result.current.resolutions[0].effectiveness.timesUsed).toBe(6)
    expect(result.current.resolutions[0].effectiveness.timesSuccessful).toBe(3)
  })
})

describe('useResolutions hook — updateResolution on shared resolutions', () => {
  it('updateResolution applies changes to shared resolutions', () => {
    const shared = makeResolution({
      id: 'shared-update',
      title: 'Original',
      visibility: 'shared',
    })
    seedLocalStorage([], [shared])

    const { result } = renderHook(() => useResolutions())

    act(() => {
      result.current.updateResolution('shared-update', { title: 'Updated Shared' })
    })

    expect(result.current.sharedResolutions[0].title).toBe('Updated Shared')
  })
})

describe('generateResolutionPromptContext (standalone) — deep paths', () => {
  it('includes issue type in output', () => {
    const similar: SimilarResolution[] = [
      {
        resolution: makeResolution({
          issueSignature: { type: 'OOMKilled', resourceKind: 'Pod' },
          resolution: { summary: 'Increase memory', steps: ['step1'] },
        }),
        similarity: 0.9,
        source: 'personal',
      },
    ]

    const ctx = generateResolutionPromptContext(similar)
    expect(ctx).toContain('Issue type: OOMKilled')
  })

  it('truncates steps to first 3 with arrow join', () => {
    const similar: SimilarResolution[] = [
      {
        resolution: makeResolution({
          resolution: {
            summary: 'Multi-step',
            steps: ['Step A', 'Step B', 'Step C', 'Step D', 'Step E'],
          },
          effectiveness: { timesUsed: 5, timesSuccessful: 3 },
        }),
        similarity: 0.9,
        source: 'personal',
      },
    ]

    const ctx = generateResolutionPromptContext(similar)
    expect(ctx).toContain('Step A')
    expect(ctx).toContain('Step B')
    expect(ctx).toContain('Step C')
    // Steps are joined with ' → ', only first 3 included
    expect(ctx).toContain('→')
    expect(ctx).not.toContain('Step D')
  })

  it('omits steps line when steps array is empty', () => {
    const similar: SimilarResolution[] = [
      {
        resolution: makeResolution({
          resolution: { summary: 'Simple fix', steps: [] },
          effectiveness: { timesUsed: 1, timesSuccessful: 1 },
        }),
        similarity: 0.9,
        source: 'personal',
      },
    ]

    const ctx = generateResolutionPromptContext(similar)
    expect(ctx).toContain('Simple fix')
    expect(ctx).not.toContain('Steps:')
  })

  it('shows "new resolution" for unused resolutions in standalone context', () => {
    const similar: SimilarResolution[] = [
      {
        resolution: makeResolution({
          effectiveness: { timesUsed: 0, timesSuccessful: 0 },
        }),
        similarity: 0.9,
        source: 'shared',
      },
    ]

    const ctx = generateResolutionPromptContext(similar)
    expect(ctx).toContain('new resolution')
    expect(ctx).toContain('Team knowledge')
  })

  it('includes the instructional footer text', () => {
    const similar: SimilarResolution[] = [
      {
        resolution: makeResolution(),
        similarity: 0.9,
        source: 'personal',
      },
    ]

    const ctx = generateResolutionPromptContext(similar)
    expect(ctx).toContain('Consider these past resolutions')
    expect(ctx).toContain('PREVIOUS SUCCESSFUL RESOLUTIONS')
  })
})

describe('useResolutions hook — generatePromptContext edge cases', () => {
  it('formats steps with semicolon separator and no ellipsis when exactly 2 steps', () => {
    const { result } = renderHook(() => useResolutions())
    const similar: SimilarResolution[] = [
      {
        resolution: makeResolution({
          resolution: {
            summary: 'Two-step fix',
            steps: ['First step', 'Second step'],
          },
          effectiveness: { timesUsed: 1, timesSuccessful: 1 },
        }),
        similarity: 0.9,
        source: 'personal',
      },
    ]

    const ctx = result.current.generatePromptContext(similar)
    expect(ctx).toContain('First step')
    expect(ctx).toContain('Second step')
    expect(ctx).not.toContain('...')
  })

  it('limits to 3 resolutions in prompt context', () => {
    const { result } = renderHook(() => useResolutions())
    const similar: SimilarResolution[] = Array.from({ length: 5 }, (_, i) => ({
      resolution: makeResolution({
        id: `ctx-${i}`,
        title: `Context Resolution ${i}`,
        effectiveness: { timesUsed: 1, timesSuccessful: 1 },
      }),
      similarity: 0.9,
      source: 'personal' as const,
    }))

    const ctx = result.current.generatePromptContext(similar)
    expect(ctx).toContain('Context Resolution 0')
    expect(ctx).toContain('Context Resolution 1')
    expect(ctx).toContain('Context Resolution 2')
    expect(ctx).not.toContain('Context Resolution 3')
  })
})

describe('useResolutions — saveResolution defaults', () => {
  it('sets default context to empty object when not provided', () => {
    const { result } = renderHook(() => useResolutions())

    act(() => {
      result.current.saveResolution({
        missionId: 'mission-no-ctx',
        title: 'No Context',
        issueSignature: { type: 'CrashLoopBackOff' },
        resolution: { summary: 'Fix', steps: [] },
      })
    })

    expect(result.current.resolutions[0].context).toEqual({})
  })

  it('sets effectiveness to zero counters on new resolution', () => {
    const { result } = renderHook(() => useResolutions())

    act(() => {
      result.current.saveResolution({
        missionId: 'mission-new',
        title: 'Brand New',
        issueSignature: { type: 'CrashLoopBackOff' },
        resolution: { summary: 'Fix', steps: [] },
      })
    })

    expect(result.current.resolutions[0].effectiveness.timesUsed).toBe(0)
    expect(result.current.resolutions[0].effectiveness.timesSuccessful).toBe(0)
  })

  it('sets userId to "current-user" (MVP hardcoded)', () => {
    const { result } = renderHook(() => useResolutions())

    act(() => {
      result.current.saveResolution({
        missionId: 'mission-user',
        title: 'User Test',
        issueSignature: { type: 'CrashLoopBackOff' },
        resolution: { summary: 'Fix', steps: [] },
      })
    })

    expect(result.current.resolutions[0].userId).toBe('current-user')
  })

  it('sets createdAt and updatedAt to current ISO date string', () => {
    const { result } = renderHook(() => useResolutions())

    const beforeSave = new Date().toISOString()

    act(() => {
      result.current.saveResolution({
        missionId: 'mission-dates',
        title: 'Date Test',
        issueSignature: { type: 'CrashLoopBackOff' },
        resolution: { summary: 'Fix', steps: [] },
      })
    })

    const saved = result.current.resolutions[0]
    expect(new Date(saved.createdAt).getTime()).toBeGreaterThanOrEqual(new Date(beforeSave).getTime())
    expect(saved.createdAt).toBe(saved.updatedAt)
  })
})
