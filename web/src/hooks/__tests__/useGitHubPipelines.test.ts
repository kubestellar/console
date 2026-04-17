/**
 * Tests for useGitHubPipelines.ts — pure exports + demo data shapes.
 * The hooks themselves delegate to useCache; we test the config they
 * pass rather than re-testing the cache layer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const lastCacheArgs: { calls: Array<Record<string, unknown>> } = { calls: [] }

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
vi.mock('../../lib/constants', () => ({
  STORAGE_KEY_TOKEN: 'token',
}))
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
})
