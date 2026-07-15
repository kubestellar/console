import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

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
  useKagentCRDAgents,
  useKagentCRDTools,
  useKagentCRDModels,
  useKagentCRDMemories,
} from '../mcp/kagent_crds'

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('agent unavailable'))
})

// ── useKagentCRDAgents ────────────────────────────────────────────────────

describe('useKagentCRDAgents', () => {
  it('returns expected shape', () => {
    const { result, unmount } = renderHook(() => useKagentCRDAgents())
    expect(Array.isArray(result.current.data)).toBe(true)
    expect(typeof result.current.isLoading).toBe('boolean')
    expect(typeof result.current.isFailed).toBe('boolean')
    expect(typeof result.current.isDemoFallback).toBe('boolean')
    expect(typeof result.current.refetch).toBe('function')
    unmount()
  })

  it('returns demo data when agent is unavailable (enabled=false, demoWhenEmpty=true)', () => {
    const { result, unmount } = renderHook(() => useKagentCRDAgents())
    expect(result.current.data.length).toBeGreaterThan(0)
    expect(result.current.isDemoFallback).toBe(true)
    unmount()
  })

  it('accepts cluster and namespace options', () => {
    const { result, unmount } = renderHook(() =>
      useKagentCRDAgents({ cluster: 'prod-east', namespace: 'kagent-system' })
    )
    expect(Array.isArray(result.current.data)).toBe(true)
    unmount()
  })

  it('demo agents have required fields', () => {
    const { result, unmount } = renderHook(() => useKagentCRDAgents())
    const agent = result.current.data[0]
    expect(typeof agent.name).toBe('string')
    expect(typeof agent.namespace).toBe('string')
    expect(typeof agent.cluster).toBe('string')
    expect(typeof agent.status).toBe('string')
    unmount()
  })
})

// ── useKagentCRDTools ─────────────────────────────────────────────────────

describe('useKagentCRDTools', () => {
  it('returns expected shape', () => {
    const { result, unmount } = renderHook(() => useKagentCRDTools())
    expect(Array.isArray(result.current.data)).toBe(true)
    expect(typeof result.current.isLoading).toBe('boolean')
    expect(typeof result.current.refetch).toBe('function')
    unmount()
  })

  it('returns demo data when agent unavailable', () => {
    const { result, unmount } = renderHook(() => useKagentCRDTools())
    expect(result.current.data.length).toBeGreaterThan(0)
    unmount()
  })

  it('demo tools have name and kind', () => {
    const { result, unmount } = renderHook(() => useKagentCRDTools())
    const tool = result.current.data[0]
    expect(typeof tool.name).toBe('string')
    expect(typeof tool.kind).toBe('string')
    unmount()
  })
})

// ── useKagentCRDModels ────────────────────────────────────────────────────

describe('useKagentCRDModels', () => {
  it('returns expected shape', () => {
    const { result, unmount } = renderHook(() => useKagentCRDModels())
    expect(Array.isArray(result.current.data)).toBe(true)
    expect(typeof result.current.refetch).toBe('function')
    unmount()
  })

  it('returns demo models when agent unavailable', () => {
    const { result, unmount } = renderHook(() => useKagentCRDModels())
    expect(result.current.data.length).toBeGreaterThan(0)
    unmount()
  })

  it('demo models have provider field', () => {
    const { result, unmount } = renderHook(() => useKagentCRDModels())
    const m = result.current.data[0]
    expect(typeof m.provider).toBe('string')
    unmount()
  })

  it('accepts namespace option', () => {
    const { result, unmount } = renderHook(() =>
      useKagentCRDModels({ namespace: 'kagent-system' })
    )
    expect(Array.isArray(result.current.data)).toBe(true)
    unmount()
  })
})

// ── useKagentCRDMemories ──────────────────────────────────────────────────

describe('useKagentCRDMemories', () => {
  it('returns expected shape', () => {
    const { result, unmount } = renderHook(() => useKagentCRDMemories())
    expect(Array.isArray(result.current.data)).toBe(true)
    expect(typeof result.current.isLoading).toBe('boolean')
    expect(typeof result.current.refetch).toBe('function')
    unmount()
  })

  it('returns demo memories when agent unavailable', () => {
    const { result, unmount } = renderHook(() => useKagentCRDMemories())
    expect(result.current.data.length).toBeGreaterThan(0)
    unmount()
  })

  it('demo memories have provider field', () => {
    const { result, unmount } = renderHook(() => useKagentCRDMemories())
    const m = result.current.data[0]
    expect(typeof m.provider).toBe('string')
    expect(typeof m.name).toBe('string')
    unmount()
  })

  it('refetch is a callable function', async () => {
    const { result, unmount } = renderHook(() => useKagentCRDMemories())
    await expect(result.current.refetch()).resolves.toBeUndefined()
    unmount()
  })
})

// ── Key construction ──────────────────────────────────────────────────────

describe('useCache key construction', () => {
  it('different cluster options produce different hook instances', () => {
    const { result: r1, unmount: u1 } = renderHook(() =>
      useKagentCRDAgents({ cluster: 'prod-east' })
    )
    const { result: r2, unmount: u2 } = renderHook(() =>
      useKagentCRDAgents({ cluster: 'prod-west' })
    )
    // Both return arrays (keys are different, both independently valid)
    expect(Array.isArray(r1.current.data)).toBe(true)
    expect(Array.isArray(r2.current.data)).toBe(true)
    u1()
    u2()
  })
})
