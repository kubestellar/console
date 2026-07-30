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

  // =========================================================================
  // 14. Edge cases — uncovered branches
  // =========================================================================

  it('updateGroup in localStorage mode does nothing when group name is not found', async () => {
    // No groups seeded — localGroups.find returns undefined → backend sync skipped
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.updateGroup('ghost-group', { color: 'red' })
    })

    // No groups exist, still empty
    expect(result.current.groups).toHaveLength(0)
    // fetch should NOT have been called (no group to sync)
    expect(global.fetch).not.toHaveBeenCalled()
    unmount()
  })

  it('CR mode: createGroup with a dynamic group sends dynamicFilters in spec', async () => {
    mockUsePersistence.mockReturnValue({ isEnabled: true, isActive: true })
    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.createGroup({
        name: 'dyn-cr',
        kind: 'dynamic',
        clusters: [],
        query: { filters: [{ field: 'healthy', operator: 'eq', value: 'true' }] },
      })
    })

    expect(mockCreateCRGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { name: 'dyn-cr' },
        spec: expect.objectContaining({
          dynamicFilters: [{ field: 'healthy', operator: 'eq', value: 'true' }],
          staticMembers: undefined,
        }),
      })
    )
    unmount()
  })

  it('CR mode: updateGroup with a dynamic group sends dynamicFilters', async () => {
    mockUsePersistence.mockReturnValue({ isEnabled: true, isActive: true })
    mockCRGroups.push({
      metadata: { name: 'existing-dyn' },
      spec: {
        dynamicFilters: [{ field: 'healthy', operator: 'eq', value: 'true' }],
      },
      status: { matchedClusters: ['c1'] },
    })

    const { result, unmount } = renderHook(() => useClusterGroups())

    await act(async () => {
      await result.current.updateGroup('existing-dyn', { color: 'purple' })
    })

    expect(mockUpdateCRGroup).toHaveBeenCalledWith(
      'existing-dyn',
      expect.objectContaining({
        spec: expect.objectContaining({
          dynamicFilters: expect.arrayContaining([{ field: 'healthy', operator: 'eq', value: 'true' }]),
          color: 'purple',
        }),
      })
    )
    unmount()
  })

  it('evaluateGroup: dynamic group with no query returns existing clusters', async () => {
    // group.kind === 'dynamic' but group.query is undefined → returns group.clusters
    seedGroups([{ name: 'dyn-no-query', kind: 'dynamic', clusters: ['fallback-c1'] }])
    const { result, unmount } = renderHook(() => useClusterGroups())

    let evaluated: string[] = []
    await act(async () => {
      evaluated = await result.current.evaluateGroup('dyn-no-query')
    })

    expect(evaluated).toEqual(['fallback-c1'])
    unmount()
  })
})
