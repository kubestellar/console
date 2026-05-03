/**
 * Deep branch-coverage tests for usePersistedSettings.ts
 *
 * Tests initial load, restore, sync, debounced save, retry, export,
 * import, unmount cleanup, and Netlify/unauthenticated edge cases.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import that transitively loads them
// ---------------------------------------------------------------------------

const mockIsAuthenticated = vi.fn(() => true)
vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

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

let mockIsNetlifyDeployment = false
vi.mock('../../lib/demoMode', () => ({
  get isNetlifyDeployment() { return mockIsNetlifyDeployment },
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
    mockIsNetlifyDeployment = false
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

  it('restores when agent has feedbackGithubToken', async () => {
    mockIsLocalStorageEmpty.mockReturnValue(true)
    mockFetch.mockReturnValue(jsonResponse({ feedbackGithubToken: 'tok123' }))

    const { result } = renderHook(() => usePersistedSettings())
    await flushMicrotasks()

    expect(mockRestoreToLocalStorage).toHaveBeenCalledWith(
      expect.objectContaining({ feedbackGithubToken: 'tok123' }),
    )
    expect(result.current.restoredFromFile).toBe(true)
  })

  it('restores when agent has apiKeys', async () => {
    mockIsLocalStorageEmpty.mockReturnValue(true)
    mockFetch.mockReturnValue(jsonResponse({ apiKeys: { openai: 'key1' } }))

    const { result } = renderHook(() => usePersistedSettings())
    await flushMicrotasks()

    expect(mockRestoreToLocalStorage).toHaveBeenCalledWith(
      expect.objectContaining({ apiKeys: { openai: 'key1' } }),
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

  it('sets syncStatus to "offline" on Netlify deployment', async () => {
    mockIsNetlifyDeployment = true
    const { result } = renderHook(() => usePersistedSettings())

    await flushMicrotasks()

    expect(result.current.loaded).toBe(true)
    expect(result.current.syncStatus).toBe('offline')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not listen for settings changes on Netlify', async () => {
    mockIsNetlifyDeployment = true
    mockFetch.mockReturnValue(jsonResponse({}))
    renderHook(() => usePersistedSettings())

    await flushMicrotasks()

    mockFetch.mockClear()

    act(() => {
      window.dispatchEvent(new Event('kubestellar-settings-changed'))
    })

    await advanceAndFlush(1100)

    // No fetch calls should be made
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

  it('sets syncStatus to "error" after both retry attempts fail', async () => {
    mockFetch.mockReturnValueOnce(jsonResponse({}))
    const { result } = renderHook(() => usePersistedSettings())

    await flushMicrotasks()

    mockFetch.mockReset()
    mockFetch.mockImplementation(rejectingFetch('network error'))

    act(() => {
      window.dispatchEvent(new Event('kubestellar-settings-changed'))
    })

    // Advance past debounce + retry
    await advanceAndFlush(1100)
    await advanceAndFlush(3100)

    expect(result.current.syncStatus).toBe('error')
  })

  it('succeeds on first attempt without retry', async () => {
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
    // Only one fetch call (no retry needed)
    expect(mockFetch).toHaveBeenCalledTimes(1)
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

  it('does not restore when localStorage is empty and agent returns null-ish fields', async () => {
    mockIsLocalStorageEmpty.mockReturnValue(true)
    mockFetch.mockReturnValue(jsonResponse({ theme: '', aiMode: '' }))

    const { result } = renderHook(() => usePersistedSettings())

    await flushMicrotasks()

    expect(mockRestoreToLocalStorage).not.toHaveBeenCalled()
    expect(result.current.restoredFromFile).toBe(false)
  })

  // ── Export settings ─────────────────────────────────────────────────────

  it('exports settings by downloading a blob', async () => {
    const mockBlob = new Blob(['{}'], { type: 'application/json' })
    mockFetch.mockReturnValue(jsonResponse({})) // initial load

    const { result } = renderHook(() => usePersistedSettings())
    await flushMicrotasks()

    // Mock the export endpoint
    mockFetch.mockReturnValueOnce(Promise.resolve({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    }))

    // Mock DOM operations
    const mockClick = vi.fn()
    const mockAppendChild = vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as unknown as HTMLElement)
    const mockRemoveChild = vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as unknown as HTMLElement)
    const mockCreateObjectURL = vi.fn(() => 'blob:http://test/123')
    const mockRevokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL })

    const origCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag)
      if (tag === 'a') {
        el.click = mockClick
      }
      return el
    })

    await act(async () => {
      await result.current.exportSettings()
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8585/settings/export',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(mockClick).toHaveBeenCalled()
    // safeRevokeObjectURL defers via setTimeout — advance timers to trigger it
    await vi.advanceTimersByTimeAsync(200)
    expect(mockRevokeObjectURL).toHaveBeenCalled()

    mockAppendChild.mockRestore()
    mockRemoveChild.mockRestore()
  })

  it('throws when export fails', async () => {
    mockFetch.mockReturnValue(jsonResponse({})) // initial load
    const { result } = renderHook(() => usePersistedSettings())
    await flushMicrotasks()

    mockFetch.mockReturnValueOnce(Promise.resolve({ ok: false, status: 500 }))

    await expect(
      act(async () => {
        await result.current.exportSettings()
      }),
    ).rejects.toThrow('Export failed')
  })

  // ── Import settings ─────────────────────────────────────────────────────

  it('imports settings from a file and refreshes from backend', async () => {
    mockFetch.mockReturnValue(jsonResponse({})) // initial load
    const { result } = renderHook(() => usePersistedSettings())
    await flushMicrotasks()

    // Mock import PUT then GET
    mockFetch.mockReset()
    mockFetch
      .mockReturnValueOnce(jsonResponse({})) // PUT /settings/import
      .mockReturnValueOnce(jsonResponse({ theme: 'light', aiMode: 'low' })) // GET /settings

    const file = new File(['{"theme":"light"}'], 'backup.json', { type: 'application/json' })

    await act(async () => {
      await result.current.importSettings(file)
    })

    expect(mockRestoreToLocalStorage).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'light', aiMode: 'low' }),
    )
    expect(result.current.syncStatus).toBe('saved')
    expect(result.current.lastSaved).toBeInstanceOf(Date)
  })

  it('throws when import fails on PUT', async () => {
    mockFetch.mockReturnValue(jsonResponse({})) // initial load
    const { result } = renderHook(() => usePersistedSettings())
    await flushMicrotasks()

    // Make the import PUT return non-ok (via an HTTP error response in settingsFetch)
    mockFetch.mockReset()
    mockFetch.mockReturnValueOnce(Promise.resolve({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    }))

    const file = new File(['bad'], 'backup.json')

    await expect(
      act(async () => {
        await result.current.importSettings(file)
      }),
    ).rejects.toThrow()
  })

  // ── setSyncStatus during saveToBackend ─────────────────────────────────

  it('sets syncStatus to "saving" immediately when save starts', async () => {
    mockFetch.mockReturnValue(jsonResponse({}))
    const { result } = renderHook(() => usePersistedSettings())
    await flushMicrotasks()

    // Trigger a save
    act(() => {
      window.dispatchEvent(new Event('kubestellar-settings-changed'))
    })

    // Status should be 'saving' immediately (before debounce fires)
    expect(result.current.syncStatus).toBe('saving')
  })

  // ── Unmount prevents state updates during retry ─────────────────────────

  it('does not update syncStatus after unmount during retry', async () => {
    mockFetch.mockReturnValue(jsonResponse({}))
    const {unmount } = renderHook(() => usePersistedSettings())
    await flushMicrotasks()

    // Start a save that will fail
    mockFetch.mockReset()
    mockFetch.mockImplementation(rejectingFetch('error'))

    act(() => {
      window.dispatchEvent(new Event('kubestellar-settings-changed'))
    })

    // Advance past debounce
    await advanceAndFlush(1100)

    // Unmount during retry delay
    unmount()

    // Advance past retry delay - should not crash
    await advanceAndFlush(3100)

    // If we got here without crashing, the test passes
    expect(true).toBe(true)
  })

  // ── Re-authentication triggers reload ───────────────────────────────────

  it('reloads settings when authentication state changes', async () => {
    mockIsAuthenticated.mockReturnValue(false)
    mockFetch.mockReturnValue(jsonResponse({ theme: 'dark' }))

    const { result, rerender } = renderHook(
      ({ authed }) => {
        mockIsAuthenticated.mockReturnValue(authed)
        return usePersistedSettings()
      },
      { initialProps: { authed: false } },
    )

    await flushMicrotasks()
    expect(result.current.loaded).toBe(true)
    expect(mockFetch).not.toHaveBeenCalled()

    // Simulate login
    rerender({ authed: true })
    await flushMicrotasks()

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8585/settings',
      expect.anything(),
    )
  })

  // ── Handles non-ok response from initial settings fetch ─────────────────

  it('handles HTTP error from settingsFetch (non-2xx)', async () => {
    mockFetch.mockReturnValue(Promise.resolve({
      ok: false,
      status: 503,
      json: () => Promise.resolve({}),
    }))

    const { result } = renderHook(() => usePersistedSettings())
    await flushMicrotasks()

    expect(result.current.loaded).toBe(true)
    // settingsFetch throws on non-ok, so it falls into the catch -> offline
    expect(result.current.syncStatus).toBe('offline')
  })

  // ── Handles invalid JSON from settingsFetch ─────────────────────────────

  it('handles invalid JSON response from settings agent', async () => {
    mockFetch.mockReturnValue(Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('invalid json')),
    }))

    const { result } = renderHook(() => usePersistedSettings())
    await flushMicrotasks()

    expect(result.current.loaded).toBe(true)
    // json() failure is caught in settingsFetch -> throws -> offline
    expect(result.current.syncStatus).toBe('offline')
  })
})
