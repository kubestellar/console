import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports
// ---------------------------------------------------------------------------

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: vi.fn(() => true),
  reportAgentDataSuccess: vi.fn(),
  reportAgentDataError: vi.fn(),
  reportAgentActivity: vi.fn(),
  isAgentConnected: vi.fn(() => false),
}))

vi.mock('../mcp/dedup', () => ({
  deduplicateClustersByServer: vi.fn((c: unknown[]) => c),
}))

vi.mock('../../lib/utils/concurrency', () => ({
  mapSettledWithConcurrency: vi.fn(async () => []),
  settledWithConcurrency: vi.fn(async () => []),
  DEFAULT_CLUSTER_CONCURRENCY: 4,
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
    MCP_HOOK_TIMEOUT_MS: 10000,
  }
})

vi.mock('../../lib/cache', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react')

  const useCacheMock = ({
    fetcher,
    initialData,
    demoData,
    demoWhenEmpty = false,
    enabled = true,
  }: {
    fetcher?: () => Promise<unknown>
    initialData: unknown
    demoData?: unknown
    demoWhenEmpty?: boolean
    enabled?: boolean
    [k: string]: unknown
  }) => {
    const [data, setData] = React.useState(
      !enabled && demoWhenEmpty && demoData ? demoData : initialData
    )
    const [isLoading, setIsLoading] = React.useState(!!enabled)
    const [error, setError] = React.useState<string | null>(null)
    const [consecutiveFailures, setCF] = React.useState(0)
    const [isDemoFallback, setIsDemoFallback] = React.useState(!enabled && demoWhenEmpty && !!demoData)
    const [lastRefresh, setLastRefresh] = React.useState<number | null>(null)
    const cfRef = React.useRef(0)
    const fetcherRef = React.useRef(fetcher)
    fetcherRef.current = fetcher

    const doFetch = React.useCallback(() => {
      if (!fetcherRef.current) return Promise.resolve()
      return Promise.resolve()
        .then(() => fetcherRef.current!())
        .then((result: unknown) => {
          cfRef.current = 0
          setCF(0)
          setData(result)
          setError(null)
          setIsDemoFallback(false)
          setLastRefresh(Date.now())
          setIsLoading(false)
        })
        .catch((err: unknown) => {
          cfRef.current += 1
          setCF(cfRef.current)
          setError(err instanceof Error ? err.message : 'fetch failed')
          if (demoWhenEmpty && demoData) {
            setData(demoData)
            setIsDemoFallback(true)
          }
          setIsLoading(false)
        })
    }, [demoData, demoWhenEmpty])

    React.useEffect(() => {
      if (!enabled) { setIsLoading(false); return }
      doFetch()
    }, [enabled, doFetch])

    return {
      data,
      isLoading,
      isRefreshing: false,
      isFailed: consecutiveFailures >= 3,
      isDemoFallback,
      error,
      consecutiveFailures,
      lastRefresh,
      refetch: () => doFetch(),
      retryFetch: () => { cfRef.current = 0; setCF(0); return doFetch() },
      clearAndRefetch: () => doFetch(),
    }
  }

  return {
    useCache: useCacheMock,
    useArrayCache: useCacheMock,
    useObjectCache: useCacheMock,
    createCachedHook: ({ fetcher, initialData, demoData, demoWhenEmpty, enabled }: {
      fetcher: () => Promise<unknown>
      initialData: unknown
      demoData?: unknown
      demoWhenEmpty?: boolean
      enabled?: boolean
      [k: string]: unknown
    }) => () => useCacheMock({ fetcher, initialData, demoData, demoWhenEmpty, enabled }),
  }
})

// Import after mocks
import {
  useKagentiAgents,
  useKagentiBuilds,
  useKagentiCards,
  useKagentiTools,
  useKagentiSummary,
} from '../mcp/kagenti'

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('agent unavailable'))
})

// ── useKagentiAgents ──────────────────────────────────────────────────────

describe('useKagentiAgents', () => {
  it('returns expected shape', () => {
    const { result, unmount } = renderHook(() => useKagentiAgents())
    expect(Array.isArray(result.current.data)).toBe(true)
    expect(typeof result.current.isLoading).toBe('boolean')
    expect(typeof result.current.isFailed).toBe('boolean')
    expect(typeof result.current.isDemoFallback).toBe('boolean')
    expect(typeof result.current.refetch).toBe('function')
    unmount()
  })

  it('returns demo agents when agent is unavailable', () => {
    const { result, unmount } = renderHook(() => useKagentiAgents())
    expect(result.current.data.length).toBeGreaterThan(0)
    expect(result.current.isDemoFallback).toBe(true)
    unmount()
  })

  it('demo agents have required fields', () => {
    const { result, unmount } = renderHook(() => useKagentiAgents())
    const a = result.current.data[0]
    expect(typeof a.name).toBe('string')
    expect(typeof a.namespace).toBe('string')
    expect(typeof a.framework).toBe('string')
    expect(typeof a.status).toBe('string')
    expect(typeof a.cluster).toBe('string')
    unmount()
  })

  it('accepts cluster and namespace options', () => {
    const { result, unmount } = renderHook(() =>
      useKagentiAgents({ cluster: 'prod-east', namespace: 'kagenti-system' })
    )
    expect(Array.isArray(result.current.data)).toBe(true)
    unmount()
  })
})

// ── useKagentiBuilds ──────────────────────────────────────────────────────

describe('useKagentiBuilds', () => {
  it('returns expected shape', () => {
    const { result, unmount } = renderHook(() => useKagentiBuilds())
    expect(Array.isArray(result.current.data)).toBe(true)
    expect(typeof result.current.isLoading).toBe('boolean')
    expect(typeof result.current.refetch).toBe('function')
    unmount()
  })

  it('returns demo builds when agent unavailable', () => {
    const { result, unmount } = renderHook(() => useKagentiBuilds())
    expect(result.current.data.length).toBeGreaterThan(0)
    unmount()
  })

  it('demo builds have status field', () => {
    const { result, unmount } = renderHook(() => useKagentiBuilds())
    const b = result.current.data[0]
    expect(typeof b.name).toBe('string')
    expect(typeof b.status).toBe('string')
    expect(typeof b.pipeline).toBe('string')
    unmount()
  })
})

// ── useKagentiCards ───────────────────────────────────────────────────────

describe('useKagentiCards', () => {
  it('returns expected shape', () => {
    const { result, unmount } = renderHook(() => useKagentiCards())
    expect(Array.isArray(result.current.data)).toBe(true)
    expect(typeof result.current.isLoading).toBe('boolean')
    unmount()
  })

  it('demo cards have identityBinding field', () => {
    const { result, unmount } = renderHook(() => useKagentiCards())
    const c = result.current.data[0]
    expect(typeof c.identityBinding).toBe('string')
    expect(typeof c.agentName).toBe('string')
    unmount()
  })

  it('skills is an array on demo cards', () => {
    const { result, unmount } = renderHook(() => useKagentiCards())
    const c = result.current.data[0]
    expect(Array.isArray(c.skills)).toBe(true)
    unmount()
  })
})

// ── useKagentiTools ───────────────────────────────────────────────────────

describe('useKagentiTools', () => {
  it('returns expected shape', () => {
    const { result, unmount } = renderHook(() => useKagentiTools())
    expect(Array.isArray(result.current.data)).toBe(true)
    expect(typeof result.current.isLoading).toBe('boolean')
    expect(typeof result.current.refetch).toBe('function')
    unmount()
  })

  it('returns demo tools when agent unavailable', () => {
    const { result, unmount } = renderHook(() => useKagentiTools())
    expect(result.current.data.length).toBeGreaterThan(0)
    unmount()
  })

  it('demo tools have toolPrefix', () => {
    const { result, unmount } = renderHook(() => useKagentiTools())
    const t = result.current.data[0]
    expect(typeof t.name).toBe('string')
    expect(typeof t.toolPrefix).toBe('string')
    unmount()
  })
})

// ── useKagentiSummary ─────────────────────────────────────────────────────

describe('useKagentiSummary', () => {
  it('returns expected shape', async () => {
    const { result, unmount } = renderHook(() => useKagentiSummary())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.isLoading).toBe('boolean')
    expect(typeof result.current.isDemoData).toBe('boolean')
    expect(typeof result.current.refetch).toBe('function')
    unmount()
  })

  it('computes summary from demo data', async () => {
    const { result, unmount } = renderHook(() => useKagentiSummary())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.summary).not.toBeNull()
    const s = result.current.summary!
    expect(typeof s.agentCount).toBe('number')
    expect(s.agentCount).toBeGreaterThan(0)
    expect(typeof s.buildCount).toBe('number')
    expect(typeof s.toolCount).toBe('number')
    expect(typeof s.cardCount).toBe('number')
    unmount()
  })

  it('summary clusterBreakdown is an array', async () => {
    const { result, unmount } = renderHook(() => useKagentiSummary())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(result.current.summary?.clusterBreakdown)).toBe(true)
    unmount()
  })

  it('summary.readyAgents is <= agentCount', async () => {
    const { result, unmount } = renderHook(() => useKagentiSummary())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const s = result.current.summary!
    expect(s.readyAgents).toBeLessThanOrEqual(s.agentCount)
    unmount()
  })

  it('summary frameworks is a record', async () => {
    const { result, unmount } = renderHook(() => useKagentiSummary())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.summary?.frameworks).toBe('object')
    unmount()
  })

  it('spiffeBound is <= spiffeTotal', async () => {
    const { result, unmount } = renderHook(() => useKagentiSummary())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const s = result.current.summary!
    expect(s.spiffeBound).toBeLessThanOrEqual(s.spiffeTotal)
    unmount()
  })

  it('isDemoData is true when agent unavailable', async () => {
    const { result, unmount } = renderHook(() => useKagentiSummary())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    unmount()
  })

  it('refetch resolves without throwing', async () => {
    const { result, unmount } = renderHook(() => useKagentiSummary())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await expect(result.current.refetch()).resolves.toBeUndefined()
    unmount()
  })
})
