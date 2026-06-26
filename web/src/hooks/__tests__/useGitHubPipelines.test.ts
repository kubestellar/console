/**
 * Tests for useGitHubPipelines.ts — pure exports + demo data shapes.
 * The hooks themselves delegate to useCache; we test the config they
 * pass rather than re-testing the cache layer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const lastCacheArgs: { calls: Array<Record<string, unknown>> } = { calls: [] }

vi.mock('../mcp/shared', () => ({
    createCachedHook: vi.fn(),
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (args: Record<string, unknown>) => {
    lastCacheArgs.calls.push(args)
    return {
      data: args.demoData ?? args.initialData,
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: true,
      error: null,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
      refetch: vi.fn(),
    }
  },
}))
vi.mock('../../lib/demoMode', () => ({
    createCachedHook: vi.fn(),
  isDemoMode: () => true,
  isNetlifyDeployment: false,
}))
vi.mock('../../hooks/useDemoMode', () => ({
    createCachedHook: vi.fn(),
  getDemoMode: () => true,
  useDemoMode: () => ({ isDemoMode: true }),
}))
vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    STORAGE_KEY_TOKEN: 'token',
  }
})
vi.mock('../../lib/constants/network', () => ({
    createCachedHook: vi.fn(),
  FETCH_DEFAULT_TIMEOUT_MS: 30000,
}))

import {
  getPipelineRepos,
  DEMO_PULSE,
  DEMO_MATRIX,
  DEMO_FLOW,
  DEMO_FAILURES,
  usePipelinePulse,
  usePipelineMatrix,
  usePipelineFlow,
  usePipelineFailures,
  useUnifiedPipelineData,
  usePipelineMutations,
  fetchPipelineLog,
} from '../useGitHubPipelines'

describe('getPipelineRepos', () => {
  it('returns an array of strings', () => {
    const repos = getPipelineRepos()
    expect(Array.isArray(repos)).toBe(true)
  })
})

describe('DEMO_PULSE', () => {
  it('has lastRun with conclusion', () => {
    expect(DEMO_PULSE.lastRun).toBeDefined()
    expect(typeof DEMO_PULSE.lastRun.conclusion).toBe('string')
    expect(DEMO_PULSE.lastRun.htmlUrl).toBeDefined()
  })

  it('has recent array with 14 entries', () => {
    expect(Array.isArray(DEMO_PULSE.recent)).toBe(true)
    expect(DEMO_PULSE.recent.length).toBe(14)
  })

  it('has streak + streakKind + nextCron', () => {
    expect(typeof DEMO_PULSE.streak).toBe('number')
    expect(DEMO_PULSE.streakKind).toBeTruthy()
    expect(DEMO_PULSE.nextCron).toBeTruthy()
  })

  it('each recent entry has conclusion + createdAt', () => {
    for (const r of DEMO_PULSE.recent) {
      expect(typeof r.conclusion).toBe('string')
      expect(r.createdAt).toBeTruthy()
    }
  })
})

describe('DEMO_MATRIX', () => {
  it('has workflows array + days + range', () => {
    expect(Array.isArray(DEMO_MATRIX.workflows)).toBe(true)
    expect(DEMO_MATRIX.workflows.length).toBeGreaterThan(0)
    expect(DEMO_MATRIX.days).toBeGreaterThan(0)
    expect(DEMO_MATRIX.range.length).toBe(DEMO_MATRIX.days)
  })

  it('each workflow has name + cells array', () => {
    for (const w of DEMO_MATRIX.workflows) {
      expect(w.name).toBeTruthy()
      expect(Array.isArray(w.cells)).toBe(true)
      expect(w.cells.length).toBe(DEMO_MATRIX.days)
    }
  })
})

describe('DEMO_FLOW', () => {
  it('has runs array with at least one entry', () => {
    expect(Array.isArray(DEMO_FLOW.runs)).toBe(true)
    expect(DEMO_FLOW.runs.length).toBeGreaterThan(0)
  })

  it('each run has run.name + jobs array', () => {
    for (const r of DEMO_FLOW.runs) {
      expect(r.run.name).toBeTruthy()
      expect(Array.isArray(r.jobs)).toBe(true)
    }
  })
})

describe('DEMO_FAILURES', () => {
  it('has runs array', () => {
    expect(Array.isArray(DEMO_FAILURES.runs)).toBe(true)
    expect(DEMO_FAILURES.runs.length).toBeGreaterThan(0)
  })

  it('each failure run has workflow + conclusion + repo', () => {
    for (const f of DEMO_FAILURES.runs) {
      expect(f.workflow).toBeTruthy()
      expect(typeof f.conclusion).toBe('string')
      expect(f.repo).toBeTruthy()
    }
  })
})

describe('hooks pass correct useCache config', () => {
  beforeEach(() => { lastCacheArgs.calls = [] })

  it('usePipelinePulse with null repo uses key gh-pipelines-pulse:all', () => {
    renderHook(() => usePipelinePulse(null))
    expect(lastCacheArgs.calls.some(a => a.key === 'gh-pipelines-pulse:all')).toBe(true)
  })

  it('usePipelinePulse with specific repo includes repo in key', () => {
    renderHook(() => usePipelinePulse('kubestellar/docs'))
    expect(lastCacheArgs.calls.some(a => (a.key as string).includes('kubestellar/docs'))).toBe(true)
  })

  it('usePipelineMatrix uses key containing the repo', () => {
    renderHook(() => usePipelineMatrix('kubestellar/console', 14))
    expect(lastCacheArgs.calls.some(a => (a.key as string).includes('kubestellar/console'))).toBe(true)
  })

  it('usePipelineFlow uses key containing gh-pipelines-flow', () => {
    renderHook(() => usePipelineFlow('kubestellar/console'))
    expect(lastCacheArgs.calls.some(a => (a.key as string).includes('gh-pipelines-flow'))).toBe(true)
  })

  it('usePipelineFailures uses key containing gh-pipelines-failures', () => {
    renderHook(() => usePipelineFailures('kubestellar/console'))
    expect(lastCacheArgs.calls.some(a => (a.key as string).includes('gh-pipelines-failures'))).toBe(true)
  })

  it('useUnifiedPipelineData with null repo uses key gh-pipelines-all:all:14', () => {
    renderHook(() => useUnifiedPipelineData(null))
    expect(lastCacheArgs.calls.some(a => a.key === 'gh-pipelines-all:all:14')).toBe(true)
  })

  it('useUnifiedPipelineData with repo includes repo and days in key', () => {
    renderHook(() => useUnifiedPipelineData('kubestellar/console', 7))
    expect(lastCacheArgs.calls.some(a => (a.key as string).includes('kubestellar/console') && (a.key as string).includes(':7'))).toBe(true)
  })
})

describe('usePipelineMutations', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('run calls fetch with POST and correct params on rerun', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    })
    vi.stubGlobal('fetch', mockFetch)
    const { result } = renderHook(() => usePipelineMutations())
    const res = await result.current.run('rerun', 'kubestellar/console', 42)
    expect(res.ok).toBe(true)
    expect(res.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('op=rerun'),
      expect.objectContaining({ method: 'POST' })
    )
    vi.unstubAllGlobals()
  })

  it('run returns error shape when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failure')))
    const { result } = renderHook(() => usePipelineMutations())
    const res = await result.current.run('cancel', 'kubestellar/console', 99)
    expect(res.ok).toBe(false)
    expect(res.status).toBe(0)
    expect(res.error).toBe('network failure')
    vi.unstubAllGlobals()
  })

  it('run returns ok:false when server returns non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ error: 'unprocessable' }),
    }))
    const { result } = renderHook(() => usePipelineMutations())
    const res = await result.current.run('rerun', 'kubestellar/console', 7)
    expect(res.ok).toBe(false)
    expect(res.status).toBe(422)
    expect(res.error).toBe('unprocessable')
    vi.unstubAllGlobals()
  })
})

describe('fetchPipelineLog', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('returns log shape on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ log: 'hello world', lines: 1, truncatedFrom: 0 }),
    }))
    const res = await fetchPipelineLog('kubestellar/console', 55)
    expect('log' in res).toBe(true)
    if ('log' in res) {
      expect(res.log).toBe('hello world')
      expect(res.lines).toBe(1)
      expect(res.truncatedFrom).toBe(0)
    }
    vi.unstubAllGlobals()
  })

  it('returns error shape when server returns non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'not found' }),
    }))
    const res = await fetchPipelineLog('kubestellar/console', 55)
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error).toBe('not found')
    vi.unstubAllGlobals()
  })

  it('returns error shape when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))
    const res = await fetchPipelineLog('kubestellar/console', 55)
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error).toBe('timeout')
    vi.unstubAllGlobals()
  })

  it('handles non-JSON response body gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    }))
    const res = await fetchPipelineLog('kubestellar/console', 77)
    // Guard against non-JSON should return defaults
    expect('log' in res).toBe(true)
    if ('log' in res) {
      expect(res.log).toBe('')
      expect(res.lines).toBe(0)
    }
    vi.unstubAllGlobals()
  })

  it('returns server error message when response not ok and no error field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    }))
    const res = await fetchPipelineLog('kubestellar/console', 10)
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error).toBe('HTTP 500')
    vi.unstubAllGlobals()
  })
})

describe('usePipelineMutations - additional edge cases', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('run cancel operation sends correct params', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    })
    vi.stubGlobal('fetch', mockFetch)
    const { result } = renderHook(() => usePipelineMutations())
    const res = await result.current.run('cancel', 'kubestellar/docs', 123)
    expect(res.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('op=cancel'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('repo=kubestellar'),
      expect.anything()
    )
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('run=123'),
      expect.anything()
    )
    vi.unstubAllGlobals()
  })

  it('run handles non-JSON error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new SyntaxError('bad json')),
    }))
    const { result } = renderHook(() => usePipelineMutations())
    const res = await result.current.run('rerun', 'kubestellar/console', 1)
    expect(res.ok).toBe(false)
    expect(res.status).toBe(500)
    // error from the catch fallback
    expect(res.error).toBeUndefined()
    vi.unstubAllGlobals()
  })
})

describe('hook fetcher callbacks', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('usePipelinePulse fetcher calls /api/github-pipelines with view=pulse', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ lastRun: null, streak: 0, streakKind: 'mixed', recent: [], nextCron: '' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    // The useCache mock captures the fetcher — we can call it directly
    lastCacheArgs.calls = []
    renderHook(() => usePipelinePulse('kubestellar/console'))
    const call = lastCacheArgs.calls.find(a => (a.key as string).includes('pulse'))
    expect(call).toBeDefined()
    const fetcher = call!.fetcher as () => Promise<unknown>
    await fetcher()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('view=pulse'),
      expect.anything()
    )
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('repo=kubestellar'),
      expect.anything()
    )
    vi.unstubAllGlobals()
  })

  it('usePipelinePulse fetcher with null repo does not set repo param', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ lastRun: null, streak: 0, streakKind: 'mixed', recent: [], nextCron: '' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    lastCacheArgs.calls = []
    renderHook(() => usePipelinePulse(null))
    const call = lastCacheArgs.calls.find(a => (a.key as string).includes('pulse'))
    const fetcher = call!.fetcher as () => Promise<unknown>
    await fetcher()
    const fetchedUrl = mockFetch.mock.calls[0][0] as string
    expect(fetchedUrl).not.toContain('repo=')
    vi.unstubAllGlobals()
  })

  it('usePipelineMatrix fetcher calls with view=matrix and days param', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ days: 7, range: [], workflows: [] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    lastCacheArgs.calls = []
    renderHook(() => usePipelineMatrix('kubestellar/console', 7))
    const call = lastCacheArgs.calls.find(a => (a.key as string).includes('matrix'))
    const fetcher = call!.fetcher as () => Promise<unknown>
    await fetcher()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('view=matrix'),
      expect.anything()
    )
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('days=7'),
      expect.anything()
    )
    vi.unstubAllGlobals()
  })

  it('usePipelineMatrix fetcher normalizes null workflow names', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        days: 7,
        range: ['2026-01-01'],
        workflows: [
          { repo: null, name: null, cells: null },
        ],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    lastCacheArgs.calls = []
    renderHook(() => usePipelineMatrix(null, 7))
    const call = lastCacheArgs.calls.find(a => (a.key as string).includes('matrix'))
    const fetcher = call!.fetcher as () => Promise<unknown>
    const result = await fetcher() as { workflows: Array<{ name: string; repo: string; cells: unknown[] }> }
    expect(result.workflows[0].name).toBe('')
    expect(result.workflows[0].repo).toBe('')
    expect(Array.isArray(result.workflows[0].cells)).toBe(true)
    vi.unstubAllGlobals()
  })

  it('usePipelineFlow fetcher calls with view=flow', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ runs: [] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    lastCacheArgs.calls = []
    renderHook(() => usePipelineFlow('kubestellar/console'))
    const call = lastCacheArgs.calls.find(a => (a.key as string).includes('flow'))
    const fetcher = call!.fetcher as () => Promise<unknown>
    await fetcher()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('view=flow'),
      expect.anything()
    )
    vi.unstubAllGlobals()
  })

  it('usePipelineFailures fetcher calls with view=failures', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ runs: [] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    lastCacheArgs.calls = []
    renderHook(() => usePipelineFailures('kubestellar/console'))
    const call = lastCacheArgs.calls.find(a => (a.key as string).includes('failures'))
    const fetcher = call!.fetcher as () => Promise<unknown>
    await fetcher()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('view=failures'),
      expect.anything()
    )
    vi.unstubAllGlobals()
  })

  it('useUnifiedPipelineData fetcher calls with view=all and normalizes matrix', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        pulse: DEMO_PULSE,
        matrix: { days: 14, range: [], workflows: [{ name: null, repo: 'r', cells: [] }] },
        failures: DEMO_FAILURES,
        flow: DEMO_FLOW,
        repos: ['kubestellar/console', 'kubestellar/docs'],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    lastCacheArgs.calls = []
    renderHook(() => useUnifiedPipelineData('kubestellar/console', 14))
    const call = lastCacheArgs.calls.find(a => (a.key as string).includes('all'))
    const fetcher = call!.fetcher as () => Promise<unknown>
    const result = await fetcher() as { matrix: { workflows: Array<{ name: string }> } }
    // Verify normalization applied
    expect(result.matrix.workflows[0].name).toBe('')
    // Verify repos were updated from server response
    const repos = getPipelineRepos()
    expect(repos).toContain('kubestellar/console')
    expect(repos).toContain('kubestellar/docs')
    vi.unstubAllGlobals()
  })

  it('useUnifiedPipelineData fetcher with null matrix passes through', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        pulse: DEMO_PULSE,
        matrix: null,
        failures: DEMO_FAILURES,
        flow: DEMO_FLOW,
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    lastCacheArgs.calls = []
    renderHook(() => useUnifiedPipelineData(null))
    const call = lastCacheArgs.calls.find(a => (a.key as string).includes('all'))
    const fetcher = call!.fetcher as () => Promise<unknown>
    const result = await fetcher() as { matrix: null }
    expect(result.matrix).toBeNull()
    vi.unstubAllGlobals()
  })

  it('fetchView updates serverRepos when response has repos array', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        runs: [],
        repos: ['custom/repo-a', 'custom/repo-b'],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    lastCacheArgs.calls = []
    renderHook(() => usePipelineFlow(null))
    const call = lastCacheArgs.calls.find(a => (a.key as string).includes('flow'))
    const fetcher = call!.fetcher as () => Promise<unknown>
    await fetcher()
    const repos = getPipelineRepos()
    expect(repos).toContain('custom/repo-a')
    expect(repos).toContain('custom/repo-b')
    vi.unstubAllGlobals()
  })

  it('fetchView does not update serverRepos when repos array is empty', async () => {
    // First set known repos
    const setupFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ runs: [], repos: ['known/repo'] }),
    })
    vi.stubGlobal('fetch', setupFetch)

    lastCacheArgs.calls = []
    renderHook(() => usePipelineFlow(null))
    const setupCall = lastCacheArgs.calls.find(a => (a.key as string).includes('flow'))
    await (setupCall!.fetcher as () => Promise<unknown>)()
    expect(getPipelineRepos()).toContain('known/repo')

    // Now fetch with empty repos — should NOT clear
    const emptyFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ runs: [], repos: [] }),
    })
    vi.stubGlobal('fetch', emptyFetch)

    lastCacheArgs.calls = []
    renderHook(() => usePipelineFailures(null))
    const emptyCall = lastCacheArgs.calls.find(a => (a.key as string).includes('failures'))
    await (emptyCall!.fetcher as () => Promise<unknown>)()
    expect(getPipelineRepos()).toContain('known/repo')
    vi.unstubAllGlobals()
  })

  it('fetchView throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({}),
    }))

    lastCacheArgs.calls = []
    renderHook(() => usePipelinePulse(null))
    const call = lastCacheArgs.calls.find(a => (a.key as string).includes('pulse'))
    const fetcher = call!.fetcher as () => Promise<unknown>
    await expect(fetcher()).rejects.toThrow('HTTP 503')
    vi.unstubAllGlobals()
  })
})

describe('useUnifiedPipelineData with custom days', () => {
  beforeEach(() => { lastCacheArgs.calls = [] })

  it('uses custom demo matrix when days != 14', () => {
    renderHook(() => useUnifiedPipelineData(null, 7))
    const call = lastCacheArgs.calls.find(a => (a.key as string).includes('all'))
    expect(call).toBeDefined()
    const initial = call!.initialData as { matrix: { days: number; range: string[] } }
    expect(initial.matrix.days).toBe(7)
    expect(initial.matrix.range).toHaveLength(7)
  })

  it('uses DEMO_MATRIX when days == 14', () => {
    renderHook(() => useUnifiedPipelineData(null, 14))
    const call = lastCacheArgs.calls.find(a => (a.key as string).includes('all'))
    const initial = call!.initialData as { matrix: { days: number } }
    expect(initial.matrix.days).toBe(14)
    expect(initial.matrix).toBe(DEMO_MATRIX)
  })
})

describe('hook enabled flag', () => {
  beforeEach(() => { lastCacheArgs.calls = [] })

  it('usePipelinePulse passes enabled:false to useCache', () => {
    renderHook(() => usePipelinePulse(null, false))
    const call = lastCacheArgs.calls.find(a => (a.key as string).includes('pulse'))
    expect(call!.enabled).toBe(false)
  })

  it('usePipelineMatrix passes enabled:false to useCache', () => {
    renderHook(() => usePipelineMatrix(null, 14, false))
    const call = lastCacheArgs.calls.find(a => (a.key as string).includes('matrix'))
    expect(call!.enabled).toBe(false)
  })

  it('usePipelineFlow passes enabled:false to useCache', () => {
    renderHook(() => usePipelineFlow(null, false))
    const call = lastCacheArgs.calls.find(a => (a.key as string).includes('flow'))
    expect(call!.enabled).toBe(false)
  })

  it('usePipelineFailures passes enabled:false to useCache', () => {
    renderHook(() => usePipelineFailures(null, false))
    const call = lastCacheArgs.calls.find(a => (a.key as string).includes('failures'))
    expect(call!.enabled).toBe(false)
  })
})
