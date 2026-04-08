/**
 * Extended coverage tests for buildpacks.ts — Part 1
 *
 * Covers: Netlify early-return, success path (URL, auth, AbortSignal),
 * no-token auth omission, 404 empty-list handling.
 *
 * NOTE: renderHook + this hook's module-level shared cache causes OOM in
 * workers after ~4 renders, so tests are split across two files.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockUseDemoMode,
  mockIsNetlifyDeployment,
  mockRegisterRefetch,
  mockRegisterCacheReset,
  mockSubscribePolling,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockIsNetlifyDeployment: { value: false },
  mockRegisterRefetch: vi.fn(() => vi.fn()),
  mockRegisterCacheReset: vi.fn(() => vi.fn()),
  mockSubscribePolling: vi.fn(() => vi.fn()),
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
  get isNetlifyDeployment() { return mockIsNetlifyDeployment.value },
}))

vi.mock('../../useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
}))

vi.mock('../shared', () => ({
  MIN_REFRESH_INDICATOR_MS: 0,
  getEffectiveInterval: (ms: number) => ms,
}))

vi.mock('../pollingManager', () => ({
  subscribePolling: (...args: unknown[]) => mockSubscribePolling(...args),
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, MCP_HOOK_TIMEOUT_MS: 5_000 }
})

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'token' }
})

import { useBuildpackImages } from '../buildpacks'

let cnt = 0
const uc = (p = 'p1') => `${p}${++cnt}`

const IMG = [
  { name: 'web', namespace: 'ns', builder: 'pak', image: 'r/w:1', status: 'succeeded' as const, updated: '', cluster: 'a' },
]

const okFetch = (imgs = IMG) => vi.fn().mockResolvedValue({
  ok: true, status: 200, json: async () => ({ images: imgs }),
})

const origFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('token', 'tk')
  mockIsDemoMode.mockReturnValue(false)
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  mockIsNetlifyDeployment.value = false
  mockRegisterRefetch.mockReturnValue(vi.fn())
  mockSubscribePolling.mockReturnValue(vi.fn())
})

afterEach(() => { globalThis.fetch = origFetch })

describe('buildpacks coverage part 1', () => {
  it('Netlify: skips fetch, registers polling, cleanup works', async () => {
    mockIsNetlifyDeployment.value = true
    const unsub = vi.fn()
    const unreg = vi.fn()
    mockSubscribePolling.mockReturnValue(unsub)
    mockRegisterRefetch.mockReturnValue(unreg)
    const spy = vi.fn()
    globalThis.fetch = spy
    const c = uc()

    const { result, unmount } = renderHook(() => useBuildpackImages(c))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isRefreshing).toBe(false)
    expect(spy).not.toHaveBeenCalled()
    expect(mockSubscribePolling).toHaveBeenCalled()
    const pCall = mockSubscribePolling.mock.calls.find((a: unknown[]) => (a[0] as string).includes(c))
    expect(pCall![0]).toBe(`buildpackImages:${c}`)
    const rCall = mockRegisterRefetch.mock.calls.find((a: unknown[]) => (a[0] as string).includes(c))
    expect(rCall![0]).toBe(`buildpack-images:${c}`)
    unmount()
    expect(unsub).toHaveBeenCalled()
    expect(unreg).toHaveBeenCalled()
  })

  it('success: full path with URL, auth, AbortSignal, images, lastRefresh', async () => {
    localStorage.setItem('token', 'jwt-xyz')
    const spy = okFetch(IMG)
    globalThis.fetch = spy
    const c = uc()
    const t0 = Date.now()

    const { result, unmount } = renderHook(() => useBuildpackImages(c))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.images).toEqual(IMG)
    expect(result.current.error).toBeNull()
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.consecutiveFailures).toBe(0)
    expect(result.current.isFailed).toBe(false)
    expect(result.current.lastRefresh).toBeGreaterThanOrEqual(t0)

    const url = spy.mock.calls[0][0] as string
    expect(url).toMatch(/^\/api\/gitops\/buildpack-images\?cluster=/)
    expect(url).toContain(c)
    const opts = spy.mock.calls[0][1]
    expect(opts.method).toBe('GET')
    expect(opts.headers['Authorization']).toBe('Bearer jwt-xyz')
    expect(opts.headers['Content-Type']).toBe('application/json')
    expect(opts.signal).toBeDefined()
    unmount()
  })

  it('no-token: omits Authorization header', async () => {
    localStorage.removeItem('token')
    const spy = okFetch([])
    globalThis.fetch = spy
    const { result, unmount } = renderHook(() => useBuildpackImages(uc()))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(spy.mock.calls[0][1].headers['Authorization']).toBeUndefined()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    unmount()
  })

  it('404: returns empty list, clears error, sets lastRefresh', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    const t0 = Date.now()
    const { result, unmount } = renderHook(() => useBuildpackImages(uc()))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.images).toEqual([])
    expect(result.current.error).toBeNull()
    expect(result.current.lastRefresh).toBeGreaterThanOrEqual(t0)
    expect(result.current.consecutiveFailures).toBe(0)
    unmount()
  })

  it('null images in response: defaults to empty array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ images: null }) })
    const { result, unmount } = renderHook(() => useBuildpackImages(uc()))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.images).toEqual([])
    expect(result.current.error).toBeNull()
    unmount()
  })
})
