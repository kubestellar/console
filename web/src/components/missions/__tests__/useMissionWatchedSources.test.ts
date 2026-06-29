import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMissionWatchedSources } from '../useMissionWatchedSources'

const mockShowToast = vi.fn()
vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

let mockStorage: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { mockStorage[key] = value }),
  removeItem: vi.fn((key: string) => { delete mockStorage[key] }),
  clear: vi.fn(() => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]) }),
  key: vi.fn((index: number) => Object.keys(mockStorage)[index] ?? null),
  get length() { return Object.keys(mockStorage).length },
})

describe('useMissionWatchedSources', () => {
  beforeEach(() => {
    mockStorage = {}
    mockShowToast.mockClear()
  })

  it('initializes with empty arrays when localStorage is empty', () => {
    const { result } = renderHook(() => useMissionWatchedSources())
    expect(result.current.watchedRepos).toEqual([])
    expect(result.current.watchedPaths).toEqual([])
  })

  it('initializes from localStorage when data exists', () => {
    mockStorage['kc_mission_watched_repos'] = '["org/repo1"]'
    mockStorage['kc_mission_watched_paths'] = '["/path/a"]'
    const { result } = renderHook(() => useMissionWatchedSources())
    expect(result.current.watchedRepos).toEqual(['org/repo1'])
    expect(result.current.watchedPaths).toEqual(['/path/a'])
  })

  it('handleAddRepo adds a repo and shows toast', () => {
    const { result } = renderHook(() => useMissionWatchedSources())
    act(() => {
      result.current.handleAddRepo('org/new-repo')
    })
    expect(result.current.watchedRepos).toEqual(['org/new-repo'])
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('org/new-repo'),
      'success'
    )
    expect(mockStorage['kc_mission_watched_repos']).toBe('["org/new-repo"]')
  })

  it('handleRemoveRepo removes a repo and shows toast', () => {
    mockStorage['kc_mission_watched_repos'] = '["a","b"]'
    const { result } = renderHook(() => useMissionWatchedSources())
    act(() => {
      result.current.handleRemoveRepo('a')
    })
    expect(result.current.watchedRepos).toEqual(['b'])
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('a'),
      'info'
    )
  })

  it('handleAddPath adds a path and shows toast', () => {
    const { result } = renderHook(() => useMissionWatchedSources())
    act(() => {
      result.current.handleAddPath('/new/path')
    })
    expect(result.current.watchedPaths).toEqual(['/new/path'])
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('/new/path'),
      'success'
    )
  })

  it('handleRemovePath removes a path and shows toast', () => {
    mockStorage['kc_mission_watched_paths'] = '["/x","/y"]'
    const { result } = renderHook(() => useMissionWatchedSources())
    act(() => {
      result.current.handleRemovePath('/x')
    })
    expect(result.current.watchedPaths).toEqual(['/y'])
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('/x'),
      'info'
    )
  })

  it('exposes addingRepo/addingPath toggle state', () => {
    const { result } = renderHook(() => useMissionWatchedSources())
    expect(result.current.addingRepo).toBe(false)
    expect(result.current.addingPath).toBe(false)
    act(() => {
      result.current.setAddingRepo(true)
      result.current.setAddingPath(true)
    })
    expect(result.current.addingRepo).toBe(true)
    expect(result.current.addingPath).toBe(true)
  })

  it('exposes newRepoValue/newPathValue input state', () => {
    const { result } = renderHook(() => useMissionWatchedSources())
    expect(result.current.newRepoValue).toBe('')
    expect(result.current.newPathValue).toBe('')
    act(() => {
      result.current.setNewRepoValue('test')
      result.current.setNewPathValue('/test')
    })
    expect(result.current.newRepoValue).toBe('test')
    expect(result.current.newPathValue).toBe('/test')
  })
})
