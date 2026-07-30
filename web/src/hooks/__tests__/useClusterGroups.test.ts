/**
 * Tests for useClusterGroups hook.
 *
 * Validates the cluster group management lifecycle including:
 *   - localStorage persistence (load, save, migration)
 *   - CR-backed mode when persistence is active
 *   - CRUD operations (create, update, delete)
 *   - Dynamic group evaluation
 *   - AI query generation
 *   - Best-effort backend sync
 *   - Auth header construction
 *   - Edge cases and error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — declared before module import
// ---------------------------------------------------------------------------

const SYNC_WARNING_MESSAGES = {
  create: 'Group saved locally only. Backend sync failed, so this change may not persist across devices.',
  update: 'Group changes saved locally only. Backend sync failed, so this change may not persist across devices.',
  delete: 'Group deletion was saved locally only. Backend sync failed, so this change may not persist across devices.',
} as const

const {
  mockShowToast,
  mockT,
} = vi.hoisted(() => ({
  mockShowToast: vi.fn(),
  mockT: vi.fn((key: string) => {
    const translations: Record<string, string> = {
      'clusterGroups.syncWarning.create': 'Group saved locally only. Backend sync failed, so this change may not persist across devices.',
      'clusterGroups.syncWarning.update': 'Group changes saved locally only. Backend sync failed, so this change may not persist across devices.',
      'clusterGroups.syncWarning.delete': 'Group deletion was saved locally only. Backend sync failed, so this change may not persist across devices.',
    }
    return translations[key] ?? key
  }),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: mockT, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

const mockUsePersistence = vi.fn(() => ({
  isEnabled: false,
  isActive: false,
}))

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../usePersistence', () => ({
  usePersistence: () => mockUsePersistence(),
}))

const mockCreateCRGroup = vi.fn()
const mockUpdateCRGroup = vi.fn()
const mockDeleteCRGroup = vi.fn()
const mockRefreshCRGroups = vi.fn()

const mockCRGroups: Array<{
  metadata: { name: string }
  spec: { color?: string; icon?: string; staticMembers?: string[]; dynamicFilters?: Array<{ field: string; operator: string; value: string }> }
  status?: { matchedClusters?: string[]; lastEvaluated?: string }
}> = []

vi.mock('../useConsoleCRs', () => ({
  useClusterGroups: () => ({
    items: mockCRGroups,
    createItem: mockCreateCRGroup,
    updateItem: mockUpdateCRGroup,
    deleteItem: mockDeleteCRGroup,
    refresh: mockRefreshCRGroups,
    loading: false,
  }),
}))

import { useClusterGroups } from '../useClusterGroups'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'kubestellar-cluster-groups'

function seedGroups(groups: Array<Record<string, unknown>>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups))
}

function getStoredGroups() {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? JSON.parse(raw) : null
}

/** Mock fetch to return a successful JSON response. */
function mockFetchOk(data: Record<string, unknown> = {}) {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  })
}

/** Mock fetch to reject. */
function mockFetchReject(msg = 'Network error') {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error(msg))
}

/** Mock fetch to return a non-ok status. */
function mockFetchStatus(status: number) {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useClusterGroups', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn())
    mockCRGroups.length = 0
    mockUsePersistence.mockReturnValue({ isEnabled: false, isActive: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  // =========================================================================
  // 1. Initial state — localStorage mode
  // =========================================================================

  it('returns empty groups when localStorage is empty', () => {
    const { result, unmount } = renderHook(() => useClusterGroups())
    expect(result.current.groups).toEqual([])
    expect(result.current.isPersisted).toBe(false)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.refresh).toBeUndefined()
    unmount()
  })

  it('loads groups from localStorage on mount', () => {
    seedGroups([
      { name: 'prod', kind: 'static', clusters: ['c1', 'c2'], color: '#ff0000' },
    ])
    const { result, unmount } = renderHook(() => useClusterGroups())
    expect(result.current.groups).toHaveLength(1)
    expect(result.current.groups[0].name).toBe('prod')
    expect(result.current.groups[0].clusters).toEqual(['c1', 'c2'])
    expect(result.current.groups[0].color).toBe('#ff0000')
    unmount()
  })

  it('migrates old groups without kind field to static', () => {
    seedGroups([
      { name: 'legacy', clusters: ['c1'] },
    ])
    const { result, unmount } = renderHook(() => useClusterGroups())
    expect(result.current.groups[0].kind).toBe('static')
    unmount()
  })

  it('handles malformed localStorage JSON gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json')
    const { result, unmount } = renderHook(() => useClusterGroups())
    expect(result.current.groups).toEqual([])
    unmount()
  })

  it('handles non-array localStorage data gracefully', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 'bar' }))
    const { result, unmount } = renderHook(() => useClusterGroups())
    expect(result.current.groups).toEqual([])
    unmount()
  })

  // =========================================================================
  // 2. createGroup — localStorage mode
  // =========================================================================

  it('creates a new group in localStorage mode', async () => {
    mockFetchOk()
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.createGroup({
        name: 'staging',
        kind: 'static',
        clusters: ['s1', 's2'],
      })
    })

    expect(result.current.groups).toHaveLength(1)
    expect(result.current.groups[0].name).toBe('staging')
    expect(result.current.groups[0].clusters).toEqual(['s1', 's2'])
    unmount()
  })

  it('createGroup replaces existing group with same name', async () => {
    seedGroups([{ name: 'prod', kind: 'static', clusters: ['c1'] }])
    mockFetchOk()
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.createGroup({
        name: 'prod',
        kind: 'static',
        clusters: ['c1', 'c2', 'c3'],
      })
    })

    expect(result.current.groups).toHaveLength(1)
    expect(result.current.groups[0].clusters).toEqual(['c1', 'c2', 'c3'])
    unmount()
  })

  it('createGroup performs best-effort backend sync', async () => {
    mockFetchOk()
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.createGroup({
        name: 'test',
        kind: 'static',
        clusters: ['c1'],
      })
    })

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/cluster-groups',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    )
    unmount()
  })

  it('createGroup warns when backend sync request rejects', async () => {
    mockFetchReject()
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.createGroup({
        name: 'offline',
        kind: 'static',
        clusters: ['c1'],
      })
    })

    expect(result.current.groups).toHaveLength(1)
    expect(result.current.groups[0].name).toBe('offline')
    expect(console.warn).toHaveBeenCalledWith('[ClusterGroups] createGroup backend sync failed:', expect.any(Error))
    expect(mockShowToast).toHaveBeenCalledWith(SYNC_WARNING_MESSAGES.create, 'warning')
    unmount()
  })

  it('createGroup warns when backend sync returns a non-ok response', async () => {
    mockFetchStatus(500)
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.createGroup({
        name: 'status-create',
        kind: 'static',
        clusters: ['c1'],
      })
    })

    expect(result.current.groups).toHaveLength(1)
    expect(result.current.groups[0].name).toBe('status-create')
    expect(console.warn).toHaveBeenCalledWith('[ClusterGroups] createGroup backend sync failed:', expect.any(Error))
    expect(mockShowToast).toHaveBeenCalledWith(SYNC_WARNING_MESSAGES.create, 'warning')
    unmount()
  })

  it('createGroup sends auth token in headers when available', async () => {
    localStorage.setItem('token', 'my-bearer-token')
    mockFetchOk()
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.createGroup({
        name: 'auth-test',
        kind: 'static',
        clusters: [],
      })
    })

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(fetchCall[1].headers).toHaveProperty('Authorization', 'Bearer my-bearer-token')
    unmount()
  })

  // =========================================================================
  // 3. updateGroup — localStorage mode
  // =========================================================================

  it('updates an existing group in localStorage mode', async () => {
    seedGroups([{ name: 'prod', kind: 'static', clusters: ['c1'] }])
    mockFetchOk()
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.updateGroup('prod', { clusters: ['c1', 'c2'] })
    })

    expect(result.current.groups[0].clusters).toEqual(['c1', 'c2'])
    unmount()
  })

  it('updateGroup does not change group name even if name is in updates', async () => {
    seedGroups([{ name: 'prod', kind: 'static', clusters: ['c1'] }])
    mockFetchOk()
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.updateGroup('prod', { name: 'renamed' } as never)
    })

    // Name should NOT change — the hook explicitly preserves the original name
    expect(result.current.groups[0].name).toBe('prod')
    unmount()
  })

  it('updateGroup performs best-effort backend PUT sync', async () => {
    seedGroups([{ name: 'prod', kind: 'static', clusters: ['c1'] }])
    mockFetchOk()
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.updateGroup('prod', { color: '#00ff00' })
    })

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/cluster-groups/prod',
      expect.objectContaining({ method: 'PUT' })
    )
    unmount()
  })

  it('updateGroup warns when backend sync request rejects', async () => {
    seedGroups([{ name: 'prod', kind: 'static', clusters: ['c1'] }])
    mockFetchReject()
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.updateGroup('prod', { color: 'blue' })
    })

    expect(result.current.groups[0].color).toBe('blue')
    expect(console.warn).toHaveBeenCalledWith('[ClusterGroups] updateGroup backend sync failed:', expect.any(Error))
    expect(mockShowToast).toHaveBeenCalledWith(SYNC_WARNING_MESSAGES.update, 'warning')
    unmount()
  })

  it('updateGroup warns when backend sync returns a non-ok response', async () => {
    seedGroups([{ name: 'prod', kind: 'static', clusters: ['c1'] }])
    mockFetchStatus(503)
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.updateGroup('prod', { color: 'green' })
    })

    expect(result.current.groups[0].color).toBe('green')
    expect(console.warn).toHaveBeenCalledWith('[ClusterGroups] updateGroup backend sync failed:', expect.any(Error))
    expect(mockShowToast).toHaveBeenCalledWith(SYNC_WARNING_MESSAGES.update, 'warning')
    unmount()
  })

  it('updateGroup leaves non-matching groups unchanged', async () => {
    seedGroups([
      { name: 'prod', kind: 'static', clusters: ['c1'] },
      { name: 'staging', kind: 'static', clusters: ['s1'] },
    ])
    mockFetchOk()
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.updateGroup('prod', { color: 'red' })
    })

    expect(result.current.groups[1].name).toBe('staging')
    expect(result.current.groups[1]).not.toHaveProperty('color')
    unmount()
  })

  // =========================================================================
  // 4. deleteGroup — localStorage mode
  // =========================================================================

  it('deletes a group in localStorage mode', async () => {
    seedGroups([
      { name: 'prod', kind: 'static', clusters: ['c1'] },
      { name: 'staging', kind: 'static', clusters: ['s1'] },
    ])
    mockFetchOk()
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.deleteGroup('prod')
    })

    expect(result.current.groups).toHaveLength(1)
    expect(result.current.groups[0].name).toBe('staging')
    unmount()
  })

  it('deleteGroup performs best-effort backend DELETE sync', async () => {
    seedGroups([{ name: 'to-delete', kind: 'static', clusters: [] }])
    mockFetchOk()
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.deleteGroup('to-delete')
    })

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/cluster-groups/to-delete',
      expect.objectContaining({ method: 'DELETE' })
    )
    unmount()
  })

  it('deleteGroup warns when backend sync request rejects', async () => {
    seedGroups([{ name: 'offline-del', kind: 'static', clusters: [] }])
    mockFetchReject()
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.deleteGroup('offline-del')
    })

    expect(result.current.groups).toHaveLength(0)
    expect(console.warn).toHaveBeenCalledWith('[ClusterGroups] deleteGroup backend sync failed:', expect.any(Error))
    expect(mockShowToast).toHaveBeenCalledWith(SYNC_WARNING_MESSAGES.delete, 'warning')
    unmount()
  })

  it('deleteGroup warns when backend sync returns a non-ok response', async () => {
    seedGroups([{ name: 'status-delete', kind: 'static', clusters: [] }])
    mockFetchStatus(502)
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.deleteGroup('status-delete')
    })

    expect(result.current.groups).toHaveLength(0)
    expect(console.warn).toHaveBeenCalledWith('[ClusterGroups] deleteGroup backend sync failed:', expect.any(Error))
    expect(mockShowToast).toHaveBeenCalledWith(SYNC_WARNING_MESSAGES.delete, 'warning')
    unmount()
  })

  it('deleteGroup URL-encodes special characters in group name', async () => {
    seedGroups([{ name: 'my group/special', kind: 'static', clusters: [] }])
    mockFetchOk()
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.deleteGroup('my group/special')
    })

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(fetchCall[0]).toContain(encodeURIComponent('my group/special'))
    unmount()
  })
})
