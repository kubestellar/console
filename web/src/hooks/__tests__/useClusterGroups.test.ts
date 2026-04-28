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

  it('createGroup succeeds even when backend sync fails', async () => {
    mockFetchReject()
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.createGroup({
        name: 'offline',
        kind: 'static',
        clusters: ['c1'],
      })
    })

    // Group should still be created locally
    expect(result.current.groups).toHaveLength(1)
    expect(result.current.groups[0].name).toBe('offline')
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

  it('updateGroup succeeds even when backend sync fails', async () => {
    seedGroups([{ name: 'prod', kind: 'static', clusters: ['c1'] }])
    mockFetchReject()
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.updateGroup('prod', { color: 'blue' })
    })

    expect(result.current.groups[0].color).toBe('blue')
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

  it('deleteGroup succeeds even when backend sync fails', async () => {
    seedGroups([{ name: 'offline-del', kind: 'static', clusters: [] }])
    mockFetchReject()
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.deleteGroup('offline-del')
    })

    expect(result.current.groups).toHaveLength(0)
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

  // =========================================================================
  // 5. getGroupClusters
  // =========================================================================

  it('returns clusters for a named group', () => {
    seedGroups([{ name: 'prod', kind: 'static', clusters: ['c1', 'c2'] }])
    const { result, unmount } = renderHook(() => useClusterGroups())
    expect(result.current.getGroupClusters('prod')).toEqual(['c1', 'c2'])
    unmount()
  })

  it('returns empty array for non-existent group', () => {
    const { result, unmount } = renderHook(() => useClusterGroups())
    expect(result.current.getGroupClusters('nonexistent')).toEqual([])
    unmount()
  })

  // =========================================================================
  // 6. evaluateGroup
  // =========================================================================

  it('evaluateGroup fetches and updates a dynamic group', async () => {
    seedGroups([{
      name: 'dynamic-1',
      kind: 'dynamic',
      clusters: ['old-c1'],
      query: { filters: [{ field: 'healthy', operator: 'eq', value: 'true' }] },
    }])
    mockFetchOk({ clusters: ['new-c1', 'new-c2'], evaluatedAt: '2025-01-01T00:00:00Z' })

    const { result, unmount } = renderHook(() => useClusterGroups())

    let evaluated: string[] = []
    await act(async () => {
      evaluated = await result.current.evaluateGroup('dynamic-1')
    })

    expect(evaluated).toEqual(['new-c1', 'new-c2'])
    unmount()
  })

  it('evaluateGroup returns existing clusters for static groups', async () => {
    seedGroups([{ name: 'static-1', kind: 'static', clusters: ['c1'] }])
    const { result, unmount } = renderHook(() => useClusterGroups())

    let evaluated: string[] = []
    await act(async () => {
      evaluated = await result.current.evaluateGroup('static-1')
    })

    expect(evaluated).toEqual(['c1'])
    unmount()
  })

  it('evaluateGroup returns existing clusters when fetch fails', async () => {
    seedGroups([{
      name: 'dynamic-fail',
      kind: 'dynamic',
      clusters: ['fallback-c1'],
      query: { filters: [{ field: 'healthy', operator: 'eq', value: 'true' }] },
    }])
    mockFetchReject()

    const { result, unmount } = renderHook(() => useClusterGroups())

    let evaluated: string[] = []
    await act(async () => {
      evaluated = await result.current.evaluateGroup('dynamic-fail')
    })

    expect(evaluated).toEqual(['fallback-c1'])
    unmount()
  })

  it('evaluateGroup returns existing clusters when response is not ok', async () => {
    seedGroups([{
      name: 'dynamic-500',
      kind: 'dynamic',
      clusters: ['fallback-c1'],
      query: { filters: [{ field: 'healthy', operator: 'eq', value: 'true' }] },
    }])
    mockFetchStatus(500)

    const { result, unmount } = renderHook(() => useClusterGroups())

    let evaluated: string[] = []
    await act(async () => {
      evaluated = await result.current.evaluateGroup('dynamic-500')
    })

    expect(evaluated).toEqual(['fallback-c1'])
    unmount()
  })

  it('evaluateGroup returns empty array for nonexistent group', async () => {
    const { result, unmount } = renderHook(() => useClusterGroups())

    let evaluated: string[] = []
    await act(async () => {
      evaluated = await result.current.evaluateGroup('ghost')
    })

    expect(evaluated).toEqual([])
    unmount()
  })

  // =========================================================================
  // 7. previewQuery
  // =========================================================================

  it('previewQuery returns clusters and count from the backend', async () => {
    mockFetchOk({ clusters: ['p1', 'p2'], count: 2 })
    const { result, unmount } = renderHook(() => useClusterGroups())

    let preview: { clusters: string[]; count: number } = { clusters: [], count: 0 }
    await act(async () => {
      preview = await result.current.previewQuery({
        filters: [{ field: 'cpuCores', operator: 'gt', value: '4' }],
      })
    })

    expect(preview.clusters).toEqual(['p1', 'p2'])
    expect(preview.count).toBe(2)
    unmount()
  })

  it('previewQuery returns empty result when fetch fails', async () => {
    mockFetchReject()
    const { result, unmount } = renderHook(() => useClusterGroups())

    let preview: { clusters: string[]; count: number } = { clusters: ['should-be-cleared'], count: 99 }
    await act(async () => {
      preview = await result.current.previewQuery({
        filters: [{ field: 'healthy', operator: 'eq', value: 'true' }],
      })
    })

    expect(preview.clusters).toEqual([])
    expect(preview.count).toBe(0)
    unmount()
  })

  it('previewQuery returns empty result when response is not ok', async () => {
    mockFetchStatus(400)
    const { result, unmount } = renderHook(() => useClusterGroups())

    let preview: { clusters: string[]; count: number } = { clusters: [], count: 0 }
    await act(async () => {
      preview = await result.current.previewQuery({ filters: [] })
    })

    expect(preview.clusters).toEqual([])
    expect(preview.count).toBe(0)
    unmount()
  })

  // =========================================================================
  // 8. generateAIQuery
  // =========================================================================

  it('generateAIQuery returns suggested name and query on success', async () => {
    mockFetchOk({
      suggestedName: 'healthy-clusters',
      query: { filters: [{ field: 'healthy', operator: 'eq', value: 'true' }] },
    })
    const { result, unmount } = renderHook(() => useClusterGroups())

    let aiResult: { suggestedName?: string; query?: unknown; error?: string } = {}
    await act(async () => {
      aiResult = await result.current.generateAIQuery('find all healthy clusters')
    })

    expect(aiResult.suggestedName).toBe('healthy-clusters')
    expect(aiResult.query).toBeDefined()
    expect(aiResult.error).toBeUndefined()
    unmount()
  })

  it('generateAIQuery returns error message on non-ok response', async () => {
    mockFetchStatus(500)
    const { result, unmount } = renderHook(() => useClusterGroups())

    let aiResult: { error?: string } = {}
    await act(async () => {
      aiResult = await result.current.generateAIQuery('test')
    })

    expect(aiResult.error).toContain('Request failed: 500')
    unmount()
  })

  it('generateAIQuery returns error from AI service when query is absent', async () => {
    mockFetchOk({ error: 'Could not parse query', raw: 'raw response text' })
    const { result, unmount } = renderHook(() => useClusterGroups())

    let aiResult: { error?: string; raw?: string } = {}
    await act(async () => {
      aiResult = await result.current.generateAIQuery('nonsense input')
    })

    expect(aiResult.error).toBe('Could not parse query')
    expect(aiResult.raw).toBe('raw response text')
    unmount()
  })

  it('generateAIQuery returns connection error when fetch fails', async () => {
    mockFetchReject()
    const { result, unmount } = renderHook(() => useClusterGroups())

    let aiResult: { error?: string } = {}
    await act(async () => {
      aiResult = await result.current.generateAIQuery('test')
    })

    expect(aiResult.error).toBe('Failed to connect to AI service')
    unmount()
  })

  // =========================================================================
  // 9. localStorage persistence — saves on change
  // =========================================================================

  it('saves groups to localStorage when a group is created', async () => {
    mockFetchOk()
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.createGroup({ name: 'saved', kind: 'static', clusters: ['c1'] })
    })

    const stored = getStoredGroups()
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('saved')
    unmount()
  })

  // =========================================================================
  // 10. CR-backed mode
  // =========================================================================

  it('uses CR groups when persistence is enabled and active', () => {
    mockUsePersistence.mockReturnValue({ isEnabled: true, isActive: true })
    mockCRGroups.push({
      metadata: { name: 'cr-group' },
      spec: { staticMembers: ['c1', 'c2'], color: 'blue' },
      status: { matchedClusters: ['c1', 'c2'] },
    })

    const { result, unmount } = renderHook(() => useClusterGroups())

    expect(result.current.isPersisted).toBe(true)
    expect(result.current.groups).toHaveLength(1)
    expect(result.current.groups[0].name).toBe('cr-group')
    expect(result.current.groups[0].kind).toBe('static')
    expect(result.current.groups[0].clusters).toEqual(['c1', 'c2'])
    expect(result.current.groups[0].color).toBe('blue')
    expect(result.current.refresh).toBe(mockRefreshCRGroups)
    unmount()
  })

  it('CR mode: dynamic group is detected from dynamicFilters', () => {
    mockUsePersistence.mockReturnValue({ isEnabled: true, isActive: true })
    mockCRGroups.push({
      metadata: { name: 'dynamic-cr' },
      spec: {
        dynamicFilters: [{ field: 'healthy', operator: 'eq', value: 'true' }],
      },
      status: { matchedClusters: ['c1'], lastEvaluated: '2025-01-01T00:00:00Z' },
    })

    const { result, unmount } = renderHook(() => useClusterGroups())

    expect(result.current.groups[0].kind).toBe('dynamic')
    expect(result.current.groups[0].query).toBeDefined()
    expect(result.current.groups[0].query!.filters).toHaveLength(1)
    expect(result.current.groups[0].lastEvaluated).toBe('2025-01-01T00:00:00Z')
    unmount()
  })

  it('CR mode: createGroup calls createCRGroup', async () => {
    mockUsePersistence.mockReturnValue({ isEnabled: true, isActive: true })
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.createGroup({
        name: 'new-cr',
        kind: 'static',
        clusters: ['c1'],
        color: 'red',
      })
    })

    expect(mockCreateCRGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { name: 'new-cr' },
        spec: expect.objectContaining({ color: 'red', staticMembers: ['c1'] }),
      })
    )
    unmount()
  })

  it('CR mode: deleteGroup calls deleteCRGroup', async () => {
    mockUsePersistence.mockReturnValue({ isEnabled: true, isActive: true })
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.deleteGroup('some-group')
    })

    expect(mockDeleteCRGroup).toHaveBeenCalledWith('some-group')
    unmount()
  })

  it('CR mode: updateGroup calls updateCRGroup with merged data', async () => {
    mockUsePersistence.mockReturnValue({ isEnabled: true, isActive: true })
    mockCRGroups.push({
      metadata: { name: 'existing-cr' },
      spec: { staticMembers: ['c1'], color: 'blue' },
      status: { matchedClusters: ['c1'] },
    })

    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.updateGroup('existing-cr', { color: 'green' })
    })

    expect(mockUpdateCRGroup).toHaveBeenCalledWith(
      'existing-cr',
      expect.objectContaining({
        spec: expect.objectContaining({ color: 'green' }),
      })
    )
    unmount()
  })

  it('CR mode: updateGroup does nothing if CR not found', async () => {
    mockUsePersistence.mockReturnValue({ isEnabled: true, isActive: true })
    // mockCRGroups is empty
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.updateGroup('nonexistent', { color: 'red' })
    })

    expect(mockUpdateCRGroup).not.toHaveBeenCalled()
    unmount()
  })

  // =========================================================================
  // 11. CR to local group conversion — edge cases
  // =========================================================================

  it('CR conversion uses staticMembers when status.matchedClusters is absent', () => {
    mockUsePersistence.mockReturnValue({ isEnabled: true, isActive: true })
    mockCRGroups.push({
      metadata: { name: 'no-status' },
      spec: { staticMembers: ['fallback-c1'] },
      // No status field
    })

    const { result, unmount } = renderHook(() => useClusterGroups())

    expect(result.current.groups[0].clusters).toEqual(['fallback-c1'])
    unmount()
  })

  it('CR conversion returns empty clusters when neither status nor staticMembers exist', () => {
    mockUsePersistence.mockReturnValue({ isEnabled: true, isActive: true })
    mockCRGroups.push({
      metadata: { name: 'empty-cr' },
      spec: {},
      // No status, no staticMembers
    })

    const { result, unmount } = renderHook(() => useClusterGroups())

    expect(result.current.groups[0].clusters).toEqual([])
    unmount()
  })

  // =========================================================================
  // 12. Does not save to localStorage when in CR mode
  // =========================================================================

  it('does not save to localStorage when persistence is active', async () => {
    mockUsePersistence.mockReturnValue({ isEnabled: true, isActive: true })
    const { unmount } = renderHook(() => useClusterGroups())

    // Wait for any effects to run
    await act(async () => { await Promise.resolve() })

    // localStorage should NOT have been written
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    unmount()
  })

  // =========================================================================
  // 13. API shape
  // =========================================================================

  it('exposes the expected API surface', () => {
    const { result, unmount } = renderHook(() => useClusterGroups())

    expect(typeof result.current.createGroup).toBe('function')
    expect(typeof result.current.updateGroup).toBe('function')
    expect(typeof result.current.deleteGroup).toBe('function')
    expect(typeof result.current.getGroupClusters).toBe('function')
    expect(typeof result.current.evaluateGroup).toBe('function')
    expect(typeof result.current.previewQuery).toBe('function')
    expect(typeof result.current.generateAIQuery).toBe('function')
    expect(Array.isArray(result.current.groups)).toBe(true)
    expect(typeof result.current.isPersisted).toBe('boolean')
    expect(typeof result.current.isLoading).toBe('boolean')
    unmount()
  })
})
