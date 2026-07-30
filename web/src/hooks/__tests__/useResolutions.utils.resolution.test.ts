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
describe('useResolutions', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('initializes with empty resolutions', () => {
    const { result } = renderHook(() => useResolutions())
    expect(result.current.resolutions).toEqual([])
    expect(result.current.sharedResolutions).toEqual([])
    expect(result.current.allResolutions).toEqual([])
  })

  it('loads existing resolutions from localStorage', () => {
    const existing = makeResolution({ id: 'existing-1' })
    seedLocalStorage([existing])

    const { result } = renderHook(() => useResolutions())
    expect(result.current.resolutions.length).toBe(1)
    expect(result.current.resolutions[0].id).toBe('existing-1')
  })

  it('saveResolution adds a private resolution', () => {
    const { result } = renderHook(() => useResolutions())

    let saved: Resolution | undefined
    act(() => {
      saved = result.current.saveResolution({
        missionId: 'mission-42',
        title: 'Fix OOM',
        issueSignature: { type: 'OOMKilled', resourceKind: 'Pod' },
        resolution: { summary: 'Increase memory', steps: ['edit deployment'] },
      })
    })

    expect(saved).toBeDefined()
    expect(saved!.visibility).toBe('private')
    expect(result.current.resolutions.length).toBe(1)
    expect(result.current.resolutions[0].title).toBe('Fix OOM')
  })

  it('saveResolution adds a shared resolution', () => {
    const { result } = renderHook(() => useResolutions())

    act(() => {
      result.current.saveResolution({
        missionId: 'mission-42',
        title: 'Fix OOM (shared)',
        issueSignature: { type: 'OOMKilled' },
        resolution: { summary: 'Increase memory', steps: [] },
        visibility: 'shared',
      })
    })

    expect(result.current.sharedResolutions.length).toBe(1)
    expect(result.current.sharedResolutions[0].sharedBy).toBe('You')
  })

  it('deleteResolution removes a resolution', () => {
    const existing = makeResolution({ id: 'to-delete' })
    seedLocalStorage([existing])

    const { result } = renderHook(() => useResolutions())
    expect(result.current.resolutions.length).toBe(1)

    act(() => {
      result.current.deleteResolution('to-delete')
    })

    expect(result.current.resolutions.length).toBe(0)
  })

  it('updateResolution updates fields', () => {
    const existing = makeResolution({ id: 'to-update', title: 'Old Title' })
    seedLocalStorage([existing])

    const { result } = renderHook(() => useResolutions())

    act(() => {
      result.current.updateResolution('to-update', { title: 'New Title' })
    })

    expect(result.current.resolutions[0].title).toBe('New Title')
  })

  it('recordUsage increments counters', () => {
    const existing = makeResolution({
      id: 'track-me',
      effectiveness: { timesUsed: 1, timesSuccessful: 1 },
    })
    seedLocalStorage([existing])

    const { result } = renderHook(() => useResolutions())

    act(() => {
      result.current.recordUsage('track-me', true)
    })

    expect(result.current.resolutions[0].effectiveness.timesUsed).toBe(2)
    expect(result.current.resolutions[0].effectiveness.timesSuccessful).toBe(2)

    act(() => {
      result.current.recordUsage('track-me', false)
    })

    expect(result.current.resolutions[0].effectiveness.timesUsed).toBe(3)
    expect(result.current.resolutions[0].effectiveness.timesSuccessful).toBe(2)
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

  it('generatePromptContext returns empty string for no matches', () => {
    const { result } = renderHook(() => useResolutions())
    expect(result.current.generatePromptContext([])).toBe('')
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

  it('saveResolution persists to localStorage', () => {
    const { result } = renderHook(() => useResolutions())

    act(() => {
      result.current.saveResolution({
        missionId: 'mission-persist',
        title: 'Persisted Resolution',
        issueSignature: { type: 'OOMKilled', resourceKind: 'Pod' },
        resolution: { summary: 'Increase limits', steps: ['step1'] },
      })
    })

    const stored = JSON.parse(localStorage.getItem('kc_resolutions') || '[]')
    expect(stored.length).toBe(1)
    expect(stored[0].title).toBe('Persisted Resolution')
  })

  it('keeps multiple hook instances in sync after saving a resolution', () => {
    const primary = renderHook(() => useResolutions())
    const secondary = renderHook(() => useResolutions())

    act(() => {
      primary.result.current.saveResolution({
        missionId: 'mission-sync',
        title: 'Synced Resolution',
        issueSignature: { type: 'CrashLoopBackOff', resourceKind: 'Pod' },
        resolution: { summary: 'Restart the pod', steps: ['kubectl delete pod'] },
      })
    })

    expect(secondary.result.current.resolutions).toHaveLength(1)
    expect(secondary.result.current.allResolutions[0].title).toBe('Synced Resolution')
  })

  it('saveResolution with context stores the context object', () => {
    const { result } = renderHook(() => useResolutions())

    act(() => {
      result.current.saveResolution({
        missionId: 'mission-ctx',
        title: 'With Context',
        issueSignature: { type: 'CrashLoopBackOff' },
        resolution: { summary: 'Fix', steps: [] },
        context: { cluster: 'prod-east', k8sVersion: '1.28', operators: ['Istio'] },
      })
    })

    const saved = result.current.resolutions[0]
    expect(saved.context.cluster).toBe('prod-east')
    expect(saved.context.k8sVersion).toBe('1.28')
    expect(saved.context.operators).toEqual(['Istio'])
  })

  it('saveResolution generates unique IDs for multiple saves', () => {
    const { result } = renderHook(() => useResolutions())

    act(() => {
      result.current.saveResolution({
        missionId: 'mission-a',
        title: 'Resolution A',
        issueSignature: { type: 'OOMKilled' },
        resolution: { summary: 'Fix A', steps: [] },
      })
    })
    act(() => {
      result.current.saveResolution({
        missionId: 'mission-b',
        title: 'Resolution B',
        issueSignature: { type: 'OOMKilled' },
        resolution: { summary: 'Fix B', steps: [] },
      })
    })

    expect(result.current.resolutions.length).toBe(2)
    expect(result.current.resolutions[0].id).not.toBe(result.current.resolutions[1].id)
  })

  it('shareResolution is a no-op for non-existent id', () => {
    const existing = makeResolution({ id: 'keep-me' })
    seedLocalStorage([existing])

    const { result } = renderHook(() => useResolutions())

    act(() => {
      result.current.shareResolution('does-not-exist')
    })

    // Personal list unchanged, shared list still empty
    expect(result.current.resolutions.length).toBe(1)
    expect(result.current.sharedResolutions.length).toBe(0)
  })

  it('deleteResolution removes from shared list when resolution is shared', () => {
    const shared = makeResolution({ id: 'shared-del', visibility: 'shared' })
    seedLocalStorage([], [shared])

    const { result } = renderHook(() => useResolutions())
    expect(result.current.sharedResolutions.length).toBe(1)

    act(() => {
      result.current.deleteResolution('shared-del')
    })

    expect(result.current.sharedResolutions.length).toBe(0)
  })

  it('recordUsage sets lastUsed timestamp', () => {
    const existing = makeResolution({
      id: 'timestamp-test',
      effectiveness: { timesUsed: 0, timesSuccessful: 0 },
    })
    seedLocalStorage([existing])

    const { result } = renderHook(() => useResolutions())

    act(() => {
      result.current.recordUsage('timestamp-test', true)
    })

    expect(result.current.resolutions[0].effectiveness.lastUsed).toBeDefined()
    // Should be a valid ISO date string
    const date = new Date(result.current.resolutions[0].effectiveness.lastUsed!)
    expect(date.getTime()).not.toBeNaN()
  })

  it('updateResolution sets updatedAt to current time', () => {
    const oldDate = '2020-01-01T00:00:00.000Z'
    const existing = makeResolution({ id: 'update-time', updatedAt: oldDate })
    seedLocalStorage([existing])

    const { result } = renderHook(() => useResolutions())

    act(() => {
      result.current.updateResolution('update-time', { title: 'Updated' })
    })

    // updatedAt should be newer than the original
    expect(result.current.resolutions[0].updatedAt).not.toBe(oldDate)
    const updated = new Date(result.current.resolutions[0].updatedAt)
    expect(updated.getTime()).toBeGreaterThan(new Date(oldDate).getTime())
  })

  it('updateResolution preserves fields that were not updated', () => {
    const existing = makeResolution({
      id: 'partial-update',
      title: 'Original Title',
      resolution: { summary: 'Original Summary', steps: ['step1'] },
    })
    seedLocalStorage([existing])

    const { result } = renderHook(() => useResolutions())

    act(() => {
      result.current.updateResolution('partial-update', { title: 'New Title' })
    })

    expect(result.current.resolutions[0].title).toBe('New Title')
    expect(result.current.resolutions[0].resolution.summary).toBe('Original Summary')
    expect(result.current.resolutions[0].missionId).toBe('mission-1')
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

  it('handles corrupted localStorage gracefully on initialization', () => {
    localStorage.setItem('kc_resolutions', '<<<invalid>>>')
    localStorage.setItem('kc_shared_resolutions', '{{bad}}')

    const { result } = renderHook(() => useResolutions())
    expect(result.current.resolutions).toEqual([])
    expect(result.current.sharedResolutions).toEqual([])
  })

  it('deleteResolution is a no-op for non-existent id', () => {
    const existing = makeResolution({ id: 'stays' })
    seedLocalStorage([existing])

    const { result } = renderHook(() => useResolutions())

    act(() => {
      result.current.deleteResolution('does-not-exist')
    })

    expect(result.current.resolutions.length).toBe(1)
    expect(result.current.resolutions[0].id).toBe('stays')
  })
})
