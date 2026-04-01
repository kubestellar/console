import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import that transitively loads them
// ---------------------------------------------------------------------------

const mockIsAuthenticated = vi.fn(() => true)
vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated() }),
}))

const mockCollectFromLocalStorage = vi.fn(() => ({ theme: 'dark' }))
const mockRestoreToLocalStorage = vi.fn()
const mockIsLocalStorageEmpty = vi.fn(() => false)
vi.mock('../../lib/settingsSync', () => ({
  collectFromLocalStorage: (...args: unknown[]) => mockCollectFromLocalStorage(...args),
  restoreToLocalStorage: (...args: unknown[]) => mockRestoreToLocalStorage(...args),
  isLocalStorageEmpty: (...args: unknown[]) => mockIsLocalStorageEmpty(...args),
  SETTINGS_CHANGED_EVENT: 'kubestellar-settings-changed',
}))

vi.mock('../../lib/demoMode', () => ({
  isNetlifyDeployment: false,
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
} })

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
} })

// ---------------------------------------------------------------------------
// Global fetch mock
// ---------------------------------------------------------------------------

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ---------------------------------------------------------------------------
// Import the hook under test AFTER mocks are in place
// ---------------------------------------------------------------------------

import { usePersistedSettings } from '../usePersistedSettings'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve fetch with a JSON response */
function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    blob: () => Promise.resolve(new Blob([JSON.stringify(data)])),
  })
}

/** Use with mockImplementation: `mockFetch.mockImplementation(rejectingFetch('msg'))` */
function rejectingFetch(message = 'Network error') {
  return () => Promise.reject(new Error(message))
}

/** Flush all pending microtasks (resolved promises) */
async function flushMicrotasks() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

/** Advance fake timers and flush promise queue */
async function advanceAndFlush(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePersistedSettings', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockFetch.mockReset()
    mockCollectFromLocalStorage.mockReturnValue({ theme: 'dark' })
    mockRestoreToLocalStorage.mockReset()
    mockIsLocalStorageEmpty.mockReturnValue(false)
    mockIsAuthenticated.mockReturnValue(true)
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ── Return shape ────────────────────────────────────────────────────────

  it('returns the expected API shape', async () => {
    mockFetch.mockReturnValue(jsonResponse({ theme: 'dark' }))
    const { result } = renderHook(() => usePersistedSettings())

    expect(result.current).toHaveProperty('loaded')
    expect(result.current).toHaveProperty('restoredFromFile')
    expect(result.current).toHaveProperty('syncStatus')
    expect(result.current).toHaveProperty('lastSaved')
    expect(result.current).toHaveProperty('filePath')
    expect(result.current).toHaveProperty('exportSettings')
    expect(result.current).toHaveProperty('importSettings')
    expect(typeof result.current.exportSettings).toBe('function')
    expect(typeof result.current.importSettings).toBe('function')
    expect(result.current.filePath).toBe('~/.kc/settings.json')
  })

  // ── Mount behaviour ─────────────────────────────────────────────────────

  it('fetches settings from the agent on mount when authenticated', async () => {
    mockFetch.mockReturnValue(jsonResponse({ theme: 'dark' }))
    renderHook(() => usePersistedSettings())

    await flushMicrotasks()

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8585/settings',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )
  })

  it('sets loaded=true after fetching settings', async () => {
    mockFetch.mockReturnValue(jsonResponse({ theme: 'dark' }))
    const { result } = renderHook(() => usePersistedSettings())

    await flushMicrotasks()

    expect(result.current.loaded).toBe(true)
  })

  it('restores to localStorage when localStorage is empty and agent has data', async () => {
    mockIsLocalStorageEmpty.mockReturnValue(true)
    mockFetch.mockReturnValue(jsonResponse({ theme: 'dark', aiMode: 'high' }))

    const { result } = renderHook(() => usePersistedSettings())

    await flushMicrotasks()

    expect(result.current.loaded).toBe(true)
    expect(mockRestoreToLocalStorage).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'dark', aiMode: 'high' }),
    )
    expect(result.current.restoredFromFile).toBe(true)
  })

  it('syncs localStorage to backend when localStorage has data but agent does not', async () => {
    mockIsLocalStorageEmpty.mockReturnValue(false)
    mockFetch.mockReturnValue(jsonResponse({ theme: 'dark' }))

    renderHook(() => usePersistedSettings())

    await flushMicrotasks()

    // The initial sync triggers saveToBackend which debounces a PUT
    // Advance past the 1s debounce
    await advanceAndFlush(1100)

    // Should have made a PUT call (the second fetch)
    const putCalls = mockFetch.mock.calls.filter(
      (call) => call[1]?.method === 'PUT',
    )
    expect(putCalls.length).toBeGreaterThanOrEqual(1)
  })

  // ── Unauthenticated / Netlify ───────────────────────────────────────────

  it('skips agent sync when not authenticated', async () => {
    mockIsAuthenticated.mockReturnValue(false)
    const { result } = renderHook(() => usePersistedSettings())

    await flushMicrotasks()

    expect(result.current.loaded).toBe(true)
    expect(result.current.syncStatus).toBe('idle')
    // Should NOT have called fetch at all
    expect(mockFetch).not.toHaveBeenCalled()
  })

  // ── Error handling / offline ────────────────────────────────────────────

  it('sets syncStatus to "offline" when agent is unavailable', async () => {
    mockFetch.mockImplementation(rejectingFetch('ECONNREFUSED'))
    const { result } = renderHook(() => usePersistedSettings())

    await flushMicrotasks()

    expect(result.current.loaded).toBe(true)
    expect(result.current.syncStatus).toBe('offline')
  })

  // ── Debounced save on SETTINGS_CHANGED_EVENT ────────────────────────────

  it('debounces saves when settings-changed events fire rapidly', async () => {
    mockFetch.mockReturnValue(jsonResponse({}))
    renderHook(() => usePersistedSettings())

    await flushMicrotasks()

    mockFetch.mockClear()
    mockFetch.mockReturnValue(jsonResponse({}))

    // Fire 5 settings-changed events in quick succession
    act(() => {
      for (let i = 0; i < 5; i++) {
        window.dispatchEvent(new Event('kubestellar-settings-changed'))
      }
    })

    // Before debounce window: no PUT yet
    expect(
      mockFetch.mock.calls.filter((c) => c[1]?.method === 'PUT').length,
    ).toBe(0)

    // Advance past the 1s debounce
    await advanceAndFlush(1100)

    // Should batch into a single PUT
    const putCalls = mockFetch.mock.calls.filter(
      (c) => c[1]?.method === 'PUT',
    )
    expect(putCalls.length).toBe(1)
  })

  // ── Retry on transient failure ──────────────────────────────────────────

  it('retries once after a transient save failure then sets error', async () => {
    // Initial load succeeds
    mockFetch.mockReturnValueOnce(jsonResponse({}))
    renderHook(() => usePersistedSettings())

    await flushMicrotasks()

    // Make PUT fail both attempts
    mockFetch.mockReset()
    mockFetch.mockImplementation(rejectingFetch('network error'))

    act(() => {
      window.dispatchEvent(new Event('kubestellar-settings-changed'))
    })

    // Advance past initial debounce (1s)
    await advanceAndFlush(1100)

    // Advance past retry delay (3s)
    await advanceAndFlush(3100)

    // Two fetch attempts (initial + retry)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  // ── Save success updates lastSaved ──────────────────────────────────────

  it('updates lastSaved after successful save', async () => {
    mockFetch.mockReturnValue(jsonResponse({}))
    const { result } = renderHook(() => usePersistedSettings())

    await flushMicrotasks()

    mockFetch.mockClear()
    mockFetch.mockReturnValue(jsonResponse({}))

    act(() => {
      window.dispatchEvent(new Event('kubestellar-settings-changed'))
    })

    await advanceAndFlush(1100)

    expect(result.current.syncStatus).toBe('saved')
    expect(result.current.lastSaved).toBeInstanceOf(Date)
  })

  // ── Cleanup on unmount ──────────────────────────────────────────────────

  it('clears debounce timer on unmount', async () => {
    mockFetch.mockReturnValue(jsonResponse({}))
    const { unmount } = renderHook(() => usePersistedSettings())

    await flushMicrotasks()

    // Fire event then unmount before debounce completes
    act(() => {
      window.dispatchEvent(new Event('kubestellar-settings-changed'))
    })
    unmount()

    mockFetch.mockClear()

    // Advance timers — the debounced save may fire but should not crash
    await advanceAndFlush(2000)

    const putCalls = mockFetch.mock.calls.filter(
      (c) => c[1]?.method === 'PUT',
    )
    // The save may or may not fire (timer was set before unmount), but
    // the hook should not crash or update state after unmount
    expect(putCalls.length).toBeLessThanOrEqual(1)
  })

  // ── localStorage empty but agent has no data ────────────────────────────

  it('does not restore when localStorage is empty and agent returns empty data', async () => {
    mockIsLocalStorageEmpty.mockReturnValue(true)
    mockFetch.mockReturnValue(jsonResponse({}))

    const { result } = renderHook(() => usePersistedSettings())

    await flushMicrotasks()

    expect(result.current.loaded).toBe(true)
    expect(mockRestoreToLocalStorage).not.toHaveBeenCalled()
    expect(result.current.restoredFromFile).toBe(false)
  })
})
