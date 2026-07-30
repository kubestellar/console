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
})
