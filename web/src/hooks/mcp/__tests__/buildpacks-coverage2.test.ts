/**
 * Extended coverage tests for buildpacks.ts — Part 2
 *
 * Covers: non-404 HTTP errors, Error message extraction, registerCacheReset.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

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
vi.mock('../../useDemoMode', () => ({ useDemoMode: () => mockUseDemoMode() }))
vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
}))
vi.mock('../shared', () => ({ MIN_REFRESH_INDICATOR_MS: 0, getEffectiveInterval: (ms: number) => ms }))
vi.mock('../pollingManager', () => ({ subscribePolling: (...args: unknown[]) => mockSubscribePolling(...args) }))
vi.mock('../../../lib/constants/network', async (i) => ({ ...(await i() as Record<string, unknown>), MCP_HOOK_TIMEOUT_MS: 5_000 }))
vi.mock('../../../lib/constants', async (i) => ({ ...(await i() as Record<string, unknown>), STORAGE_KEY_TOKEN: 'token' }))

import { useBuildpackImages } from '../buildpacks'

const cacheResetCalls = [...mockRegisterCacheReset.mock.calls]

let cnt = 200
const uc = (p = 'q') => `${p}${++cnt}`
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

describe('buildpacks coverage part 2', () => {
  it('registerCacheReset: registered at module level, clears localStorage', () => {
    const call = cacheResetCalls.find((c: unknown[]) => c[0] === 'buildpack-images')
    expect(call).toBeTruthy()
    const resetFn = call![1] as () => void
    localStorage.setItem('kc-buildpack-images-cache', JSON.stringify({ data: [1], timestamp: 99 }))
    resetFn()
    expect(localStorage.getItem('kc-buildpack-images-cache')).toBeNull()
  })

  it('non-404 HTTP error + Error.message extraction', async () => {
    // HTTP 503 error
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    const { result, unmount } = renderHook(() => useBuildpackImages(uc()))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('API error: 503')
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
    unmount()
  })

  it('non-Error thrown: generic fallback message', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(42)
    const { result, unmount } = renderHook(() => useBuildpackImages(uc()))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Failed to fetch Buildpack images')
    unmount()
  })
})
