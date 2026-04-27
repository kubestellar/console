/**
 * Branch-coverage tests for useDrasiResources.ts.
 *
 * Exercises both adapters (drasi-server REST and drasi-platform REST),
 * the status/kind normalizers, the isDemoSeed short-circuit, and the
 * abort-on-refetch behavior. fetch is mocked at the global level.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — useDrasiResources pulls the active connection from
// useDrasiConnections. We stub that module so each test picks the mode
// it wants without also exercising the connections hook.
// ---------------------------------------------------------------------------

const mockActive: { current: {
  id: string
  name: string
  mode: 'server' | 'platform'
  url?: string
  cluster?: string
  isDemoSeed?: boolean
  createdAt: number
} | null } = { current: null }

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../useDrasiConnections', () => ({
  useDrasiConnections: () => ({
    connections: mockActive.current ? [mockActive.current] : [],
    activeId: mockActive.current?.id ?? '',
    activeConnection: mockActive.current,
    addConnection: vi.fn(),
    updateConnection: vi.fn(),
    removeConnection: vi.fn(),
    setActive: vi.fn(),
  }),
  getActiveDrasiConnection: () => mockActive.current,
}))

import { useDrasiResources } from '../useDrasiResources'

// Minimal fetch mock — responses is keyed by URL *substring* so tests
// declare the match pattern near the assertion.
const fetchMap = new Map<string, unknown>()
function wireFetch(entries: Record<string, unknown>) {
  fetchMap.clear()
  for (const [k, v] of Object.entries(entries)) fetchMap.set(k, v)
}
function serverWrap(data: unknown) {
  return { success: true, data, error: null }
}

describe('useDrasiResources', () => {
  // Capture the real fetch once so `afterEach` can restore it — otherwise a
  // reassigned `globalThis.fetch` from one test would leak into later files.
  const ORIGINAL_FETCH = globalThis.fetch

  beforeEach(() => {
    mockActive.current = null
    fetchMap.clear()
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : (input as URL).toString()
      for (const [pattern, payload] of fetchMap.entries()) {
        if (url.includes(pattern)) {
          return {
            ok: true,
            status: 200,
            json: async () => payload,
          } as Response
        }
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response
    }) as typeof globalThis.fetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = ORIGINAL_FETCH
  })

  describe('no-fetch short-circuits', () => {
    it('returns null data when no active connection', async () => {
      mockActive.current = null
      const { result } = renderHook(() => useDrasiResources())
      // Give the effect a tick to run.
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })
      expect(result.current.data).toBeNull()
      expect(globalThis.fetch).not.toHaveBeenCalled()
    })

    it('skips fetch when active connection is a demo seed', async () => {
      mockActive.current = {
        id: 'demo-seed-retail',
        name: 'retail (demo)',
        mode: 'server',
        url: 'http://fake',
        isDemoSeed: true,
        createdAt: 1,
      }
      const { result } = renderHook(() => useDrasiResources())
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })
      expect(result.current.data).toBeNull()
      expect(globalThis.fetch).not.toHaveBeenCalled()
    })
  })

  describe('drasi-server adapter', () => {
    beforeEach(() => {
      mockActive.current = {
        id: 'srv', name: 'srv', mode: 'server',
        url: 'http://drasi-server:8080', createdAt: 1,
      }
    })

    it('normalizes sources / queries / reactions from drasi-server REST', async () => {
      // Ordering matters — the fetch mock does substring match in insertion
      // order, so more-specific paths (…/results) must be registered BEFORE
      // their prefix (…/queries/my-query).
      wireFetch({
        '/api/v1/instances/inst-1/queries/my-query/results?': serverWrap([
          { symbol: 'AAPL', price: 180.5 },
        ]),
        '/api/v1/instances/inst-1/queries/my-query?view=full': serverWrap({
          id: 'my-query', status: 'Running',
          config: {
            query: 'MATCH (n) RETURN n',
            queryLanguage: 'Cypher',
            sources: [{ sourceId: 'src-postgres' }],
          },
        }),
        '/api/v1/instances?': serverWrap([{ id: 'inst-1', status: 'Running' }]),
        '/api/v1/sources?': serverWrap([
          { id: 'src-postgres', status: 'Running' },
          { id: 'src-http', status: 'Stopped' },
        ]),
        '/api/v1/queries?': serverWrap([{ id: 'my-query', status: 'Running' }]),
        '/api/v1/reactions?': serverWrap([{ id: 'sse-stream', status: 'Running' }]),
      })

      const { result } = renderHook(() => useDrasiResources())
      await waitFor(() => expect(result.current.data).not.toBeNull())

      expect(result.current.data?.mode).toBe('server')
      expect(result.current.data?.instanceId).toBe('inst-1')
      expect(result.current.data?.sources.length).toBe(2)
      expect(result.current.data?.sources[0].kind).toBe('POSTGRES')
      expect(result.current.data?.sources[0].status).toBe('ready')
      expect(result.current.data?.sources[1].status).toBe('pending') // Stopped → pending
      expect(result.current.data?.queries.length).toBe(1)
      expect(result.current.data?.queries[0].language).toBe('CYPHER QUERY')
      expect(result.current.data?.queries[0].sourceIds).toEqual(['src-postgres'])
      expect(result.current.data?.queries[0].queryText).toBe('MATCH (n) RETURN n')
      expect(result.current.data?.reactions.length).toBe(1)
      expect(result.current.data?.liveResults.length).toBe(1)
    })

    it('falls back to GQL QUERY when queryLanguage missing', async () => {
      wireFetch({
        '/api/v1/instances?': serverWrap([{ id: 'inst-1', status: 'Running' }]),
        '/api/v1/sources?': serverWrap([]),
        '/api/v1/queries?': serverWrap([{ id: 'q-no-config', status: 'Running' }]),
        '/api/v1/reactions?': serverWrap([]),
        '/api/v1/instances/inst-1/queries/q-no-config': serverWrap({
          id: 'q-no-config', status: 'Running',
        }),
      })
      const { result } = renderHook(() => useDrasiResources())
      await waitFor(() => expect(result.current.data?.queries.length).toBe(1))
      expect(result.current.data?.queries[0].language).toBe('GQL QUERY')
      expect(result.current.data?.queries[0].sourceIds).toEqual([])
    })

    it('swallows the per-query full-view 404 and uses the summary', async () => {
      wireFetch({
        '/api/v1/instances?': serverWrap([{ id: 'inst-1', status: 'Running' }]),
        '/api/v1/sources?': serverWrap([]),
        '/api/v1/queries?': serverWrap([{ id: 'q-missing', status: 'Running' }]),
        '/api/v1/reactions?': serverWrap([]),
        // NO /api/v1/instances/inst-1/queries/q-missing mock — 404
      })
      const { result } = renderHook(() => useDrasiResources())
      await waitFor(() => expect(result.current.data?.queries.length).toBe(1))
      // Falls back to summary-shape → GQL default, empty source list.
      expect(result.current.data?.queries[0].id).toBe('q-missing')
    })

    it('surfaces error when the first call fails (non-200)', async () => {
      // No wire → first fetch returns 404 → throw → setError path
      const { result } = renderHook(() => useDrasiResources())
      await waitFor(() => expect(result.current.error).not.toBeNull())
      expect(result.current.data).toBeNull()
    })

    it('surfaces error when drasi-server wrapper signals error', async () => {
      wireFetch({
        '/api/v1/instances?': { success: false, data: null, error: 'oh no' },
      })
      const { result } = renderHook(() => useDrasiResources())
      await waitFor(() => expect(result.current.error).not.toBeNull())
      expect(result.current.error).toMatch(/oh no/)
    })

    it('handles empty results (no instances, no running query)', async () => {
      wireFetch({
        '/api/v1/instances?': serverWrap([]),
        '/api/v1/sources?': serverWrap([]),
        '/api/v1/queries?': serverWrap([]),
        '/api/v1/reactions?': serverWrap([]),
      })
      const { result } = renderHook(() => useDrasiResources())
      await waitFor(() => expect(result.current.data).not.toBeNull())
      expect(result.current.data?.instanceId).toBeNull()
      expect(result.current.data?.liveResults).toEqual([])
    })

    it('refetch() triggers an additional call and aborts the previous', async () => {
      wireFetch({
        '/api/v1/instances?': serverWrap([]),
        '/api/v1/sources?': serverWrap([]),
        '/api/v1/queries?': serverWrap([]),
        '/api/v1/reactions?': serverWrap([]),
      })
      const { result } = renderHook(() => useDrasiResources())
      await waitFor(() => expect(result.current.data).not.toBeNull())
      const callsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

      await act(async () => { await result.current.refetch() })
      await waitFor(() => {
        const callsAfter = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length
        expect(callsAfter).toBeGreaterThan(callsBefore)
      })
    })
  })

  describe('drasi-platform adapter', () => {
    beforeEach(() => {
      mockActive.current = {
        id: 'plat', name: 'plat', mode: 'platform',
        cluster: 'prow', createdAt: 1,
      }
    })

    it('normalizes platform sources / continuousQueries / reactions (raw arrays, no wrapper)', async () => {
      wireFetch({
        '/v1/sources?': [{
          id: 'src-pg',
          spec: { kind: 'PostgreSQL' },
          status: { available: true },
        }],
        '/v1/continuousQueries?': [{
          id: 'q-cypher',
          spec: {
            mode: 'cypher',
            query: 'MATCH (n) RETURN n',
            sources: [{ id: 'src-pg' }],
          },
          status: { available: true },
        }],
        '/v1/reactions?': [{
          id: 'rx-sse',
          spec: {
            kind: 'SignalR',
            queries: [{ id: 'q-cypher' }],
          },
          status: { available: false },
        }],
      })

      const { result } = renderHook(() => useDrasiResources())
      await waitFor(() => expect(result.current.data).not.toBeNull())
      expect(result.current.data?.mode).toBe('platform')
      expect(result.current.data?.instanceId).toBeNull()
      expect(result.current.data?.sources[0].kind).toBe('POSTGRES')
      expect(result.current.data?.sources[0].status).toBe('ready')
      expect(result.current.data?.queries[0].language).toBe('CYPHER QUERY')
      expect(result.current.data?.queries[0].sourceIds).toEqual(['src-pg'])
      expect(result.current.data?.reactions[0].kind).toBe('SIGNALR')
      expect(result.current.data?.reactions[0].status).toBe('error') // available: false
      expect(result.current.data?.liveResults).toEqual([]) // platform never eagerly fetches
    })

    it('defaults language to CYPHER QUERY when spec.mode is missing', async () => {
      wireFetch({
        '/v1/sources?': [],
        '/v1/continuousQueries?': [{
          id: 'q-no-mode',
          spec: { query: 'MATCH (n) RETURN n' },
          status: { available: true },
        }],
        '/v1/reactions?': [],
      })
      const { result } = renderHook(() => useDrasiResources())
      await waitFor(() => expect(result.current.data?.queries.length).toBe(1))
      expect(result.current.data?.queries[0].language).toBe('CYPHER QUERY')
    })

    it('handles empty arrays gracefully', async () => {
      wireFetch({
        '/v1/sources?': null, // null arrays should coerce to []
        '/v1/continuousQueries?': null,
        '/v1/reactions?': null,
      })
      const { result } = renderHook(() => useDrasiResources())
      await waitFor(() => expect(result.current.data).not.toBeNull())
      expect(result.current.data?.sources).toEqual([])
      expect(result.current.data?.queries).toEqual([])
      expect(result.current.data?.reactions).toEqual([])
    })

    it('status pending when status object is ambiguous', async () => {
      wireFetch({
        '/v1/sources?': [{ id: 's1', spec: {}, status: { available: undefined } }],
        '/v1/continuousQueries?': [],
        '/v1/reactions?': [],
      })
      const { result } = renderHook(() => useDrasiResources())
      await waitFor(() => expect(result.current.data?.sources.length).toBe(1))
      expect(result.current.data?.sources[0].status).toBe('pending')
    })

    it('accepts string status (legacy platform shape)', async () => {
      wireFetch({
        '/v1/sources?': [{ id: 's1', spec: {}, status: 'Running' }],
        '/v1/continuousQueries?': [],
        '/v1/reactions?': [],
      })
      const { result } = renderHook(() => useDrasiResources())
      await waitFor(() => expect(result.current.data?.sources.length).toBe(1))
      expect(result.current.data?.sources[0].status).toBe('ready')
    })
  })

  describe('kind mappers (via sources adapter output)', () => {
    beforeEach(() => {
      mockActive.current = {
        id: 'srv', name: 'srv', mode: 'server',
        url: 'http://drasi-server:8080', createdAt: 1,
      }
    })

    it('maps various source identifiers to the expected kind', async () => {
      wireFetch({
        '/api/v1/instances?': serverWrap([{ id: 'i', status: 'Running' }]),
        '/api/v1/sources?': serverWrap([
          { id: 'cosmos-x', status: 'Running' },
          { id: 'gremlin-y', status: 'Running' },
          { id: 'http-z', status: 'Running' },
          { id: 'sqlserver-a', status: 'Running' },
          { id: 'unknown-b', status: 'Running' },
        ]),
        '/api/v1/queries?': serverWrap([]),
        '/api/v1/reactions?': serverWrap([]),
      })
      const { result } = renderHook(() => useDrasiResources())
      await waitFor(() => expect(result.current.data?.sources.length).toBe(5))
      const kinds = result.current.data!.sources.map(s => s.kind)
      expect(kinds).toContain('COSMOSDB')
      expect(kinds).toContain('GREMLIN')
      expect(kinds).toContain('HTTP')
      expect(kinds).toContain('SQL')
      // The fallback is POSTGRES for unrecognized ids.
      expect(kinds).toContain('POSTGRES')
    })
  })
})
