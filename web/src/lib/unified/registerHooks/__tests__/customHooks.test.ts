/**
 * Tests for registerHooks/customHooks.ts
 *
 * Covers:
 * - useWarningEvents: filters events by type === 'Warning', error wrapping, cluster/namespace forwarding
 * - useNamespaceEvents: no-namespace cap, namespace filter, demo data fallback
 * - useUnifiedFluxStatus: concatenates flux resource arrays, isLoading/error mapping
 * - useUnifiedContourStatus: proxies passthrough, loading, error
 * - useUnifiedChaosMeshStatus: data passthrough, loading, error
 * - useRecentEvents: filters by cutoff time (initial render snapshot)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../../../hooks/useCachedData', () => ({
  useCachedEvents: vi.fn(() => ({ data: [], isLoading: false, error: null, refetch: vi.fn() })),
}))

vi.mock('../../../../components/cards/flux_status/useFluxStatus', () => ({
  useFluxStatus: vi.fn(() => ({
    data: { resources: { sources: [], kustomizations: [], helmReleases: [] } },
    showSkeleton: false,
    error: null,
    refetch: vi.fn(),
  })),
}))

vi.mock('../../../../components/cards/contour_status/useContourStatus', () => ({
  useContourStatus: vi.fn(() => ({
    data: { proxies: [] },
    showSkeleton: false,
    error: null,
  })),
}))

vi.mock('../../../../components/cards/chaos_mesh_status/useChaosMeshStatus', () => ({
  useChaosMeshStatus: vi.fn(() => ({
    data: [],
    showSkeleton: false,
    error: null,
    refetch: vi.fn(),
  })),
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { useCachedEvents } from '../../../../hooks/useCachedData'
import { useFluxStatus } from '../../../../components/cards/flux_status/useFluxStatus'
import { useContourStatus } from '../../../../components/cards/contour_status/useContourStatus'
import { useChaosMeshStatus } from '../../../../components/cards/chaos_mesh_status/useChaosMeshStatus'
import {
  useWarningEvents,
  useNamespaceEvents,
  useUnifiedFluxStatus,
  useUnifiedContourStatus,
  useUnifiedChaosMeshStatus,
  useRecentEvents,
} from '../customHooks'

const mockUseCachedEvents = vi.mocked(useCachedEvents)
const mockUseFluxStatus = vi.mocked(useFluxStatus)
const mockUseContourStatus = vi.mocked(useContourStatus)
const mockUseChaosMeshStatus = vi.mocked(useChaosMeshStatus)

beforeEach(() => vi.clearAllMocks())

// ── helpers ───────────────────────────────────────────────────────────────────

function makeEvents() {
  return [
    { type: 'Normal', reason: 'Pulled', message: 'Image pulled', object: 'pod/a', namespace: 'default', count: 1, lastSeen: Date.now() - 1000 },
    { type: 'Warning', reason: 'BackOff', message: 'Restarting', object: 'pod/b', namespace: 'default', count: 3, lastSeen: Date.now() - 2000 },
    { type: 'Warning', reason: 'OOMKilled', message: 'OOM', object: 'pod/c', namespace: 'other', count: 1, lastSeen: Date.now() - 3000 },
  ]
}

// ── useWarningEvents ──────────────────────────────────────────────────────────

describe('useWarningEvents', () => {
  it('returns only Warning events', () => {
    mockUseCachedEvents.mockReturnValueOnce({ data: makeEvents(), isLoading: false, error: null, refetch: vi.fn() })
    const r = useWarningEvents()
    expect(r.data).toHaveLength(2)
    expect(r.data.every(e => e.type === 'Warning')).toBe(true)
  })

  it('returns empty array when no events match Warning type', () => {
    mockUseCachedEvents.mockReturnValueOnce({ data: [makeEvents()[0]], isLoading: false, error: null, refetch: vi.fn() })
    expect(useWarningEvents().data).toEqual([])
  })

  it('returns empty array when data is null/undefined', () => {
    mockUseCachedEvents.mockReturnValueOnce({ data: undefined as unknown as never[], isLoading: false, error: null, refetch: vi.fn() })
    expect(useWarningEvents().data).toEqual([])
  })

  it('wraps string error into an Error instance', () => {
    mockUseCachedEvents.mockReturnValueOnce({ data: [], isLoading: false, error: 'fetch failed', refetch: vi.fn() })
    const r = useWarningEvents()
    expect(r.error).toBeInstanceOf(Error)
    expect((r.error as Error).message).toBe('fetch failed')
  })

  it('forwards cluster and namespace params to useCachedEvents', () => {
    mockUseCachedEvents.mockReturnValueOnce({ data: [], isLoading: false, error: null, refetch: vi.fn() })
    useWarningEvents({ cluster: 'c1', namespace: 'ns1' })
    expect(mockUseCachedEvents).toHaveBeenCalledWith('c1', 'ns1')
  })

  it('returns null error when no error present', () => {
    mockUseCachedEvents.mockReturnValueOnce({ data: [], isLoading: false, error: null, refetch: vi.fn() })
    expect(useWarningEvents().error).toBeNull()
  })
})

// ── useNamespaceEvents ────────────────────────────────────────────────────────

describe('useNamespaceEvents', () => {
  it('caps results at 20 when no namespace is provided', () => {
    const manyEvents = Array.from({ length: 30 }, (_, i) => ({
      type: 'Normal', reason: 'x', message: 'm', object: `pod/${i}`,
      namespace: 'ns', count: 1, lastSeen: Date.now(),
    }))
    mockUseCachedEvents.mockReturnValueOnce({ data: manyEvents, isLoading: false, error: null, refetch: vi.fn() })
    const r = useNamespaceEvents()
    expect(r.data).toHaveLength(20)
  })

  it('filters by namespace when namespace is provided', () => {
    mockUseCachedEvents.mockReturnValueOnce({ data: makeEvents(), isLoading: false, error: null, refetch: vi.fn() })
    const r = useNamespaceEvents({ namespace: 'other' })
    expect(r.data).toHaveLength(1)
    expect(r.data[0].namespace).toBe('other')
  })

  it('returns demo data when filtered result is empty', () => {
    mockUseCachedEvents.mockReturnValueOnce({ data: [], isLoading: false, error: null, refetch: vi.fn() })
    const r = useNamespaceEvents({ namespace: 'nonexistent' })
    expect(r.data.length).toBeGreaterThan(0)
    expect(r.data[0]).toHaveProperty('reason')
  })

  it('wraps string error into an Error instance', () => {
    mockUseCachedEvents.mockReturnValueOnce({ data: [], isLoading: false, error: 'err', refetch: vi.fn() })
    expect(useNamespaceEvents().error).toBeInstanceOf(Error)
  })
})

// ── useRecentEvents ───────────────────────────────────────────────────────────

describe('useRecentEvents', () => {
  it('returns only events within the last hour', () => {
    const now = Date.now()
    const recentEvent = { type: 'Normal', reason: 'Ok', message: 'm', object: 'pod/x', namespace: 'default', count: 1, lastSeen: new Date(now - 5000).toISOString() }
    const oldEvent = { type: 'Normal', reason: 'Old', message: 'm', object: 'pod/y', namespace: 'default', count: 1, lastSeen: new Date(now - 2 * 60 * 60 * 1000).toISOString() }
    mockUseCachedEvents.mockReturnValue({ data: [recentEvent, oldEvent], isLoading: false, error: null, refetch: vi.fn() })
    const { result } = renderHook(() => useRecentEvents())
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data[0].reason).toBe('Ok')
  })

  it('returns empty array when all events are older than one hour', () => {
    const oldEvent = { type: 'Normal', reason: 'Old', message: 'm', object: 'pod/y', namespace: 'default', count: 1, lastSeen: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() }
    mockUseCachedEvents.mockReturnValue({ data: [oldEvent], isLoading: false, error: null, refetch: vi.fn() })
    const { result } = renderHook(() => useRecentEvents())
    expect(result.current.data).toEqual([])
  })

  it('wraps string error into an Error instance', () => {
    mockUseCachedEvents.mockReturnValue({ data: [], isLoading: false, error: 'fetch error', refetch: vi.fn() })
    const { result } = renderHook(() => useRecentEvents())
    expect(result.current.error).toBeInstanceOf(Error)
    expect((result.current.error as Error).message).toBe('fetch error')
  })
})

// ── useUnifiedFluxStatus ──────────────────────────────────────────────────────

describe('useUnifiedFluxStatus', () => {
  it('concatenates sources, kustomizations, and helmReleases into a flat array', () => {
    mockUseFluxStatus.mockReturnValueOnce({
      data: { resources: { sources: [{ name: 's1' }], kustomizations: [{ name: 'k1' }], helmReleases: [{ name: 'h1' }] } },
      showSkeleton: false,
      error: null,
    } as unknown as ReturnType<typeof useFluxStatus>)
    const r = useUnifiedFluxStatus()
    expect(r.data).toHaveLength(3)
    expect(r.data.map((x: Record<string, unknown>) => x.name)).toEqual(['s1', 'k1', 'h1'])
  })

  it('maps showSkeleton to isLoading', () => {
    mockUseFluxStatus.mockReturnValueOnce({
      data: { resources: { sources: [], kustomizations: [], helmReleases: [] } },
      showSkeleton: true,
      error: false,
    } as unknown as ReturnType<typeof useFluxStatus>)
    expect(useUnifiedFluxStatus().isLoading).toBe(true)
  })

  it('wraps truthy error into an Error with friendly message', () => {
    mockUseFluxStatus.mockReturnValueOnce({
      data: { resources: { sources: [], kustomizations: [], helmReleases: [] } },
      showSkeleton: false,
      error: true,
    } as unknown as ReturnType<typeof useFluxStatus>)
    const r = useUnifiedFluxStatus()
    expect(r.error).toBeInstanceOf(Error)
    expect((r.error as Error).message).toBe('Failed to fetch Flux status')
  })

  it('returns null error when no error present', () => {
    expect(useUnifiedFluxStatus().error).toBeNull()
  })
})

// ── useUnifiedContourStatus ───────────────────────────────────────────────────

describe('useUnifiedContourStatus', () => {
  it('returns data.proxies as data', () => {
    const proxies = [{ name: 'p1' }, { name: 'p2' }]
    mockUseContourStatus.mockReturnValueOnce({
      data: { proxies },
      showSkeleton: false,
      error: null,
    } as unknown as ReturnType<typeof useContourStatus>)
    expect(useUnifiedContourStatus().data).toEqual(proxies)
  })

  it('maps showSkeleton to isLoading', () => {
    mockUseContourStatus.mockReturnValueOnce({
      data: { proxies: [] },
      showSkeleton: true,
      error: null,
    } as unknown as ReturnType<typeof useContourStatus>)
    expect(useUnifiedContourStatus().isLoading).toBe(true)
  })

  it('wraps truthy error into Error with friendly message', () => {
    mockUseContourStatus.mockReturnValueOnce({
      data: { proxies: [] },
      showSkeleton: false,
      error: true,
    } as unknown as ReturnType<typeof useContourStatus>)
    const r = useUnifiedContourStatus()
    expect(r.error).toBeInstanceOf(Error)
    expect((r.error as Error).message).toBe('Failed to fetch Contour status')
  })
})

// ── useUnifiedChaosMeshStatus ─────────────────────────────────────────────────

describe('useUnifiedChaosMeshStatus', () => {
  it('passes through data from useChaosMeshStatus', () => {
    const payload = [{ name: 'exp1' }]
    mockUseChaosMeshStatus.mockReturnValueOnce({
      data: payload,
      showSkeleton: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useChaosMeshStatus>)
    expect(useUnifiedChaosMeshStatus().data).toEqual(payload)
  })

  it('maps showSkeleton to isLoading', () => {
    mockUseChaosMeshStatus.mockReturnValueOnce({
      data: [],
      showSkeleton: true,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useChaosMeshStatus>)
    expect(useUnifiedChaosMeshStatus().isLoading).toBe(true)
  })

  it('wraps truthy error into Error with friendly message', () => {
    mockUseChaosMeshStatus.mockReturnValueOnce({
      data: [],
      showSkeleton: false,
      error: 'chaos err',
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useChaosMeshStatus>)
    const r = useUnifiedChaosMeshStatus()
    expect(r.error).toBeInstanceOf(Error)
    expect((r.error as Error).message).toBe('Failed to fetch Chaos Mesh status')
  })

  it('refetch does not throw', () => {
    mockUseChaosMeshStatus.mockReturnValueOnce({
      data: [],
      showSkeleton: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useChaosMeshStatus>)
    expect(() => useUnifiedChaosMeshStatus().refetch()).not.toThrow()
  })
})
