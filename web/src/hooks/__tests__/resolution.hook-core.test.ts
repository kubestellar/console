import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useResolutions, type Resolution } from '../useResolutions'

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
})
