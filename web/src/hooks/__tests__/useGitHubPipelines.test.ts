/**
 * Tests for useGitHubPipelines.ts — pure exports + demo data shapes.
 * The hooks themselves delegate to useCache; we test the config they
 * pass rather than re-testing the cache layer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const lastCacheArgs: { calls: Array<Record<string, unknown>> } = { calls: [] }

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../lib/cache', () => ({
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
  isDemoMode: () => true,
  isNetlifyDeployment: false,
}))
vi.mock('../../hooks/useDemoMode', () => ({
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
})
