/**
 * Tests for useGadget hooks — Inspektor Gadget eBPF observability hooks.
 *
 * Validates useGadgetStatus, useCachedNetworkTraces, useCachedDNSTraces,
 * useCachedProcessTraces, and useCachedSecurityAudit with mocked dependencies.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock dependencies BEFORE importing the module under test
// ---------------------------------------------------------------------------

// Track the fetcher callbacks captured by useCache so we can invoke them
const useCacheCalls: Array<{
  key: string
  category: string
  initialData: unknown
  demoData: unknown
  fetcher: () => Promise<unknown>
}> = []

/** Configurable return value for useCache mock */
let useCacheReturnValue = {
  data: [] as unknown,
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null as number | null,
  refetch: vi.fn(),
  clearAndRefetch: vi.fn(),
  error: null as string | null,
}

vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: vi.fn((opts: {
    key: string
    category: string
    initialData: unknown
    demoData: unknown
    fetcher: () => Promise<unknown>
  }) => {
    useCacheCalls.push(opts)
    return useCacheReturnValue
  }),
}))

/** Global mock for authFetch used by useGadgetStatus and fetchGadgetTrace */
const mockAuthFetch = vi.fn()
vi.mock('../../lib/api', () => ({
    createCachedHook: vi.fn(),
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}))

vi.mock('../../lib/constants/network', () => ({
    createCachedHook: vi.fn(),
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
}))

// Now import the hooks under test
import {
  useGadgetStatus,
  useCachedNetworkTraces,
  useCachedDNSTraces,
  useCachedProcessTraces,
  useCachedSecurityAudit,
} from '../useGadget'
import type {
  GadgetStatus,
  NetworkTraceEntry,
  DNSTraceEntry,
  ProcessTraceEntry,
  SecurityAuditEntry,
} from '../useGadget'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetMocks() {
  vi.clearAllMocks()
  useCacheCalls.length = 0
  useCacheReturnValue = {
    data: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
    clearAndRefetch: vi.fn(),
    error: null,
  }
}

// ---------------------------------------------------------------------------
// useGadgetStatus
// ---------------------------------------------------------------------------

describe('useGadgetStatus', () => {
  beforeEach(resetMocks)

  it('registers a useCache entry with key "gadget:status" and slow category', () => {
    renderHook(() => useGadgetStatus())

    expect(useCacheCalls.length).toBeGreaterThanOrEqual(1)
    const call = useCacheCalls.find(c => c.key === 'gadget:status')
    expect(call).toBeDefined()
    expect(call!.category).toBe('slow')
  })

  it('returns { status, isLoading } from the cache result', () => {
    const fakeStatus: GadgetStatus = { available: true, toolCount: 5 }
    useCacheReturnValue.data = fakeStatus
    useCacheReturnValue.isLoading = true

    const { result } = renderHook(() => useGadgetStatus())

    expect(result.current.status).toEqual(fakeStatus)
    expect(result.current.isLoading).toBe(true)
  })

  it('provides demo data indicating demo mode when gadget is unavailable', () => {
    renderHook(() => useGadgetStatus())

    const call = useCacheCalls.find(c => c.key === 'gadget:status')
    expect(call).toBeDefined()
    const demo = call!.demoData as GadgetStatus
    expect(demo.available).toBe(false)
    expect(demo.reason).toBe('demo mode')
  })

  it('initialData defaults to available: false', () => {
    renderHook(() => useGadgetStatus())

    const call = useCacheCalls.find(c => c.key === 'gadget:status')
    expect(call).toBeDefined()
    const initial = call!.initialData as GadgetStatus
    expect(initial.available).toBe(false)
  })

  it('fetcher calls authFetch against /api/gadget/status', async () => {
    const mockResponse = { ok: true, json: vi.fn().mockResolvedValue({ available: true, toolCount: 3 }) }
    mockAuthFetch.mockResolvedValue(mockResponse)

    renderHook(() => useGadgetStatus())

    const call = useCacheCalls.find(c => c.key === 'gadget:status')
    expect(call).toBeDefined()

    const fetchedData = await call!.fetcher()
    expect(mockAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/gadget/status'),
      expect.objectContaining({ signal: expect.anything() }),
    )
    expect(fetchedData).toEqual({ available: true, toolCount: 3 })
  })

  it('fetcher throws when authFetch returns non-ok response', async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, status: 500 })

    renderHook(() => useGadgetStatus())
    const call = useCacheCalls.find(c => c.key === 'gadget:status')

    await expect(call!.fetcher()).rejects.toThrow('Failed to check gadget status')
  })
})

// ---------------------------------------------------------------------------
// useCachedNetworkTraces
// ---------------------------------------------------------------------------

describe('useCachedNetworkTraces', () => {
  beforeEach(resetMocks)

  it('uses a cache key incorporating cluster and namespace', () => {
    renderHook(() => useCachedNetworkTraces('cluster-a', 'ns-1'))

    const call = useCacheCalls.find(c => c.key === 'gadget:network:cluster-a:ns-1')
    expect(call).toBeDefined()
    expect(call!.category).toBe('realtime')
  })

  it('defaults cluster and namespace to "all" when not provided', () => {
    renderHook(() => useCachedNetworkTraces())

    const call = useCacheCalls.find(c => c.key === 'gadget:network:all:all')
    expect(call).toBeDefined()
  })

  it('returns isDemoData as true when isDemoFallback is true and not loading', () => {
    useCacheReturnValue.isDemoFallback = true
    useCacheReturnValue.isLoading = false

    const { result } = renderHook(() => useCachedNetworkTraces())

    expect(result.current.isDemoData).toBe(true)
  })

  it('returns isDemoData as false when isDemoFallback is true but still loading', () => {
    useCacheReturnValue.isDemoFallback = true
    useCacheReturnValue.isLoading = true

    const { result } = renderHook(() => useCachedNetworkTraces())

    expect(result.current.isDemoData).toBe(false)
  })

  it('provides demo network trace data with expected fields', () => {
    renderHook(() => useCachedNetworkTraces())

    const call = useCacheCalls.find(c => c.key.startsWith('gadget:network:'))
    expect(call).toBeDefined()
    const demo = call!.demoData as NetworkTraceEntry[]
    expect(demo.length).toBeGreaterThan(0)
    expect(demo[0]).toHaveProperty('srcPod')
    expect(demo[0]).toHaveProperty('dstPort')
    expect(demo[0]).toHaveProperty('protocol')
    expect(demo[0]).toHaveProperty('bytes')
    expect(demo[0]).toHaveProperty('cluster')
  })

  it('exposes isFailed and consecutiveFailures from the cache result', () => {
    useCacheReturnValue.isFailed = true
    useCacheReturnValue.consecutiveFailures = 5

    const { result } = renderHook(() => useCachedNetworkTraces())

    expect(result.current.isFailed).toBe(true)
    expect(result.current.consecutiveFailures).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// useCachedDNSTraces
// ---------------------------------------------------------------------------

describe('useCachedDNSTraces', () => {
  beforeEach(resetMocks)

  it('uses the "realtime" cache category', () => {
    renderHook(() => useCachedDNSTraces())

    const call = useCacheCalls.find(c => c.key.startsWith('gadget:dns:'))
    expect(call).toBeDefined()
    expect(call!.category).toBe('realtime')
  })

  it('builds the correct cache key with cluster and namespace', () => {
    renderHook(() => useCachedDNSTraces('prod-cluster', 'monitoring'))

    const call = useCacheCalls.find(c => c.key === 'gadget:dns:prod-cluster:monitoring')
    expect(call).toBeDefined()
  })

  it('provides demo DNS traces including NXDOMAIN entries', () => {
    renderHook(() => useCachedDNSTraces())

    const call = useCacheCalls.find(c => c.key.startsWith('gadget:dns:'))
    const demo = call!.demoData as DNSTraceEntry[]
    expect(demo.length).toBeGreaterThan(0)

    const nxdomain = demo.find(e => e.responseCode === 'NXDOMAIN')
    expect(nxdomain).toBeDefined()
    expect(nxdomain!.pod).toBeTruthy()
  })

  it('returns isRefreshing from cache result', () => {
    useCacheReturnValue.isRefreshing = true

    const { result } = renderHook(() => useCachedDNSTraces())

    expect(result.current.isRefreshing).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// useCachedProcessTraces
// ---------------------------------------------------------------------------

describe('useCachedProcessTraces', () => {
  beforeEach(resetMocks)

  it('uses a key incorporating cluster and namespace with "realtime" category', () => {
    renderHook(() => useCachedProcessTraces('edge-1', 'kube-system'))

    const call = useCacheCalls.find(c => c.key === 'gadget:process:edge-1:kube-system')
    expect(call).toBeDefined()
    expect(call!.category).toBe('realtime')
  })

  it('provides demo process traces with binary and args', () => {
    renderHook(() => useCachedProcessTraces())

    const call = useCacheCalls.find(c => c.key.startsWith('gadget:process:'))
    const demo = call!.demoData as ProcessTraceEntry[]
    expect(demo.length).toBeGreaterThan(0)
    expect(demo[0]).toHaveProperty('binary')
    expect(demo[0]).toHaveProperty('args')
    expect(demo[0]).toHaveProperty('uid')
    expect(demo[0]).toHaveProperty('container')
  })

  it('returns data from cache result', () => {
    const fakeData: ProcessTraceEntry[] = [
      {
        pod: 'test-pod', namespace: 'default', container: 'main',
        binary: '/usr/bin/test', args: '--flag', uid: 1000,
        cluster: 'test-cluster', timestamp: new Date().toISOString(),
      },
    ]
    useCacheReturnValue.data = fakeData

    const { result } = renderHook(() => useCachedProcessTraces())

    expect(result.current.data).toEqual(fakeData)
  })
})

// ---------------------------------------------------------------------------
// useCachedSecurityAudit
// ---------------------------------------------------------------------------

describe('useCachedSecurityAudit', () => {
  beforeEach(resetMocks)

  it('uses the "normal" cache category (not realtime)', () => {
    renderHook(() => useCachedSecurityAudit())

    const call = useCacheCalls.find(c => c.key.startsWith('gadget:security:'))
    expect(call).toBeDefined()
    // The source code uses 'normal' as RefreshCategory
    expect(call!.category).toBe('normal')
  })

  it('builds key with cluster and namespace when provided', () => {
    renderHook(() => useCachedSecurityAudit('secure-cluster', 'restricted'))

    const call = useCacheCalls.find(c => c.key === 'gadget:security:secure-cluster:restricted')
    expect(call).toBeDefined()
  })

  it('provides demo security audit entries with syscall and action fields', () => {
    renderHook(() => useCachedSecurityAudit())

    const call = useCacheCalls.find(c => c.key.startsWith('gadget:security:'))
    const demo = call!.demoData as SecurityAuditEntry[]
    expect(demo.length).toBeGreaterThan(0)
    expect(demo[0]).toHaveProperty('syscall')
    expect(demo[0]).toHaveProperty('action')
    expect(demo[0]).toHaveProperty('capability')
  })

  it('returns isDemoData false when not in demo fallback', () => {
    useCacheReturnValue.isDemoFallback = false
    useCacheReturnValue.isLoading = false

    const { result } = renderHook(() => useCachedSecurityAudit())

    expect(result.current.isDemoData).toBe(false)
  })

  it('initialData is an empty array', () => {
    renderHook(() => useCachedSecurityAudit())

    const call = useCacheCalls.find(c => c.key.startsWith('gadget:security:'))
    expect(call!.initialData).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// fetchGadgetTrace (tested indirectly via hook fetchers)
// ---------------------------------------------------------------------------

describe('fetchGadgetTrace (via hook fetchers)', () => {
  beforeEach(resetMocks)

  it('network trace fetcher sends POST to /api/gadget/trace with tool "trace_tcp"', async () => {
    const parsedContent = [
      { srcPod: 'a', srcNamespace: 'b', dstPod: 'c', dstNamespace: 'd', dstPort: 80, protocol: 'TCP', bytes: 100, cluster: 'x', timestamp: '' },
    ]
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        isError: false,
        result: { content: [{ text: JSON.stringify(parsedContent) }] },
      }),
    })

    renderHook(() => useCachedNetworkTraces('c1', 'ns1'))

    const call = useCacheCalls.find(c => c.key === 'gadget:network:c1:ns1')
    const data = await call!.fetcher()

    expect(mockAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/gadget/trace'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"trace_tcp"'),
      }),
    )
    expect(data).toEqual(parsedContent)
  })

  it('fetcher throws when API response is isError: true', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        isError: true,
        result: { content: [{ text: 'tool not found' }] },
      }),
    })

    renderHook(() => useCachedNetworkTraces())
    const call = useCacheCalls.find(c => c.key.startsWith('gadget:network:'))

    await expect(call!.fetcher()).rejects.toThrow('tool not found')
  })

  it('fetcher throws when HTTP status is not ok', async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, status: 500 })

    renderHook(() => useCachedDNSTraces())
    const call = useCacheCalls.find(c => c.key.startsWith('gadget:dns:'))

    await expect(call!.fetcher()).rejects.toThrow('Gadget trace failed: 500')
  })

  it('fetcher returns empty array when content has no parseable text', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        isError: false,
        result: { content: [] },
      }),
    })

    renderHook(() => useCachedProcessTraces())
    const call = useCacheCalls.find(c => c.key.startsWith('gadget:process:'))

    const data = await call!.fetcher()
    expect(data).toEqual([])
  })

  it('fetcher handles Content (uppercase) key in result', async () => {
    const expected = [{ pod: 'x', namespace: 'y', binary: 'z', args: '', uid: 0, container: 'c', cluster: 'k', timestamp: '' }]
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        isError: false,
        result: { Content: [{ Text: JSON.stringify(expected) }] },
      }),
    })

    renderHook(() => useCachedProcessTraces())
    const call = useCacheCalls.find(c => c.key.startsWith('gadget:process:'))
    const data = await call!.fetcher()
    expect(data).toEqual(expected)
  })

  it('fetcher returns raw text when JSON.parse fails on content', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        isError: false,
        result: { content: [{ text: 'not-json-text' }] },
      }),
    })

    renderHook(() => useCachedSecurityAudit())
    const call = useCacheCalls.find(c => c.key.startsWith('gadget:security:'))
    const data = await call!.fetcher()
    expect(data).toBe('not-json-text')
  })

  it('security audit fetcher sends tool "audit_seccomp"', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        isError: false,
        result: { content: [{ text: '[]' }] },
      }),
    })

    renderHook(() => useCachedSecurityAudit('c1', 'ns1'))
    const call = useCacheCalls.find(c => c.key.startsWith('gadget:security:'))
    await call!.fetcher()

    const bodyArg = (mockAuthFetch as Mock).mock.calls[0][1].body
    const parsed = JSON.parse(bodyArg)
    expect(parsed.tool).toBe('audit_seccomp')
    expect(parsed.args.cluster).toBe('c1')
    expect(parsed.args.namespace).toBe('ns1')
  })

  it('DNS trace fetcher sends tool "trace_dns" with args', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        isError: false,
        result: { content: [{ text: '[]' }] },
      }),
    })

    renderHook(() => useCachedDNSTraces('my-cluster'))
    const call = useCacheCalls.find(c => c.key === 'gadget:dns:my-cluster:all')
    await call!.fetcher()

    const bodyArg = (mockAuthFetch as Mock).mock.calls[0][1].body
    const parsed = JSON.parse(bodyArg)
    expect(parsed.tool).toBe('trace_dns')
    expect(parsed.args.cluster).toBe('my-cluster')
    expect(parsed.args.namespace).toBeUndefined()
  })
})
