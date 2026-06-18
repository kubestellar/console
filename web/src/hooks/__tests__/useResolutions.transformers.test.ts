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
// useResolutions hook
// ---------------------------------------------------------------------------

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
// ---------------------------------------------------------------------------
// ADDITIONAL COVERAGE — Deep code-path tests
// ---------------------------------------------------------------------------

