/**
 * Tests for the internal fetcher callback of useNightlyE2EData.
 *
 * The main test files mock useCache entirely, which means the fetcher
 * function (lines 78-147 of useNightlyE2EData.ts) is never exercised.
 * This file captures the fetcher from the useCache config and calls it
 * directly to cover those paths.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'kc-auth-token' }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual }
})

vi.mock('../../lib/demoMode', () => ({
  isNetlifyDeployment: vi.fn(() => false),
}))

// Capture the fetcher passed to useCache so we can invoke it directly.
let capturedFetcher: (() => Promise<unknown>) | null = null

vi.mock('../../lib/cache', () => ({
  useCache: vi.fn((config: { fetcher?: () => Promise<unknown> }) => {
    if (config.fetcher) capturedFetcher = config.fetcher
    return {
      data: { guides: [], isDemo: false },
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      isFailed: false,
      consecutiveFailures: 0,
      refetch: vi.fn(),
    }
  }),
}))

import { useNightlyE2EData } from '../useNightlyE2EData'

type NightlyRunRaw = {
  id: number; status: string; conclusion: string; createdAt: string;
  updatedAt: string; htmlUrl: string; runNumber: number;
  failureReason?: string; model?: string; gpuType?: string;
  gpuCount?: number; event?: string; llmdImages?: string[]; otherImages?: string[];
}
type NightlyGuideRaw = {
  guide: string; acronym: string; platform: string; repo: string;
  workflowFile: string; runs: NightlyRunRaw[];
  passRate?: number; trend?: string; latestConclusion?: string;
  model?: string; gpuType?: string; gpuCount?: number;
  llmdImages?: string[]; otherImages?: string[];
}

function renderAndGetFetcher() {
  capturedFetcher = null
  renderHook(() => useNightlyE2EData())
  return capturedFetcher
}

const FULL_GUIDE: NightlyGuideRaw = {
  guide: 'KubeStellar Core',
  acronym: 'KSC',
  platform: 'x86',
  repo: 'kubestellar/kubestellar',
  workflowFile: 'e2e.yml',
  passRate: 0.9,
  trend: 'stable',
  latestConclusion: 'success',
  model: 'gpt-4',
  gpuType: 'A100',
  gpuCount: 2,
  runs: [{
    id: 101,
    status: 'completed',
    conclusion: 'success',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T01:00:00Z',
    htmlUrl: 'https://github.com/actions/runs/101',
    runNumber: 42,
    failureReason: '',
    model: 'gpt-4',
    gpuType: 'A100',
    gpuCount: 2,
    event: 'schedule',
    llmdImages: ['img:v1'],
    otherImages: ['img2:v1'],
  }],
}

describe('useNightlyE2EData fetcher callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ guides: [] }), { status: 200 })
    )
  })

  it('captures a fetcher function from useCache', () => {
    const fetcher = renderAndGetFetcher()
    expect(typeof fetcher).toBe('function')
  })

  it('returns transformed guides when primary endpoint succeeds', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ guides: [FULL_GUIDE] }), { status: 200 })
    )
    const fetcher = renderAndGetFetcher()!
    const result = await fetcher() as { guides: Array<{ guide: string; runs: NightlyRunRaw[] }>; isDemo: boolean }
    expect(result.guides).toHaveLength(1)
    expect(result.guides[0].guide).toBe('KubeStellar Core')
    expect(result.isDemo).toBe(false)
  })

  it('maps optional run fields with defaults', async () => {
    const guideNoOptionals: NightlyGuideRaw = {
      guide: 'Minimal',
      acronym: 'M',
      platform: 'arm',
      repo: 'test/test',
      workflowFile: 'ci.yml',
      runs: [{
        id: 1,
        status: 'completed',
        conclusion: 'failure',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        htmlUrl: 'https://github.com',
        runNumber: 1,
        // no model, gpuType, gpuCount, event, failureReason, llmdImages, otherImages
      }],
    }
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ guides: [guideNoOptionals] }), { status: 200 })
    )
    const fetcher = renderAndGetFetcher()!
    const result = await fetcher() as { guides: Array<{ model: string; gpuType: string; gpuCount: number; runs: Array<{ event: string; model: string; failureReason: string }> }> }
    const g = result.guides[0]
    expect(g.model).toBe('Unknown')
    expect(g.gpuType).toBe('Unknown')
    expect(g.gpuCount).toBe(0)
    const r = g.runs[0]
    expect(r.event).toBe('schedule')
    expect(r.model).toBe('Unknown')
    expect(r.failureReason).toBe('')
  })

  it('falls back to public endpoint when primary returns non-ok', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ guides: [FULL_GUIDE] }), { status: 200 })
      )
    const fetcher = renderAndGetFetcher()!
    const result = await fetcher() as { guides: unknown[] }
    expect(result.guides).toHaveLength(1)
  })

  it('falls back to public endpoint when primary throws', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ guides: [FULL_GUIDE] }), { status: 200 })
      )
    const fetcher = renderAndGetFetcher()!
    const result = await fetcher() as { guides: unknown[] }
    expect(result.guides).toHaveLength(1)
  })

  it('throws when response has no guides array', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 })
    )
    const fetcher = renderAndGetFetcher()!
    await expect(fetcher()).rejects.toThrow('No nightly E2E data available')
  })

  it('throws when all endpoints fail', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'))
    const fetcher = renderAndGetFetcher()!
    await expect(fetcher()).rejects.toThrow('No nightly E2E data available')
  })

  it('caches to localStorage when guides have runs', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ guides: [FULL_GUIDE] }), { status: 200 })
    )
    const fetcher = renderAndGetFetcher()!
    await fetcher()
    const stored = localStorage.getItem('nightly-e2e-cache')
    expect(stored).toBeTruthy()
    const parsed = JSON.parse(stored!) as { guides: unknown[] }
    expect(parsed.guides).toHaveLength(1)
  })

  it('does not cache to localStorage when no runs', async () => {
    const emptyGuide = { ...FULL_GUIDE, runs: [] }
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ guides: [emptyGuide] }), { status: 200 })
    )
    const fetcher = renderAndGetFetcher()!
    await fetcher()
    // saveCachedData is only called when hasAnyRuns is true
    expect(localStorage.getItem('nightly-e2e-cache')).toBeNull()
  })

  it('includes auth header for primary endpoint when token exists', async () => {
    localStorage.setItem('kc-auth-token', 'test-jwt')
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ guides: [FULL_GUIDE] }), { status: 200 })
    )
    const fetcher = renderAndGetFetcher()!
    await fetcher()
    const call = vi.mocked(fetch).mock.calls[0]
    const headers = call[1]?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer test-jwt')
  })

  it('does not include auth header for public endpoint', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ guides: [FULL_GUIDE] }), { status: 200 })
      )
    const fetcher = renderAndGetFetcher()!
    await fetcher()
    const publicCall = vi.mocked(fetch).mock.calls[1]
    const headers = publicCall[1]?.headers as Record<string, string> | undefined
    expect(headers?.Authorization).toBeUndefined()
  })
})
