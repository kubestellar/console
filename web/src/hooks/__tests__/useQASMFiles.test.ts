/**
 * Tests for useQASMFiles hook
 *
 * Covers: fetch lifecycle, auth guards, demo mode guard,
 * enabled flag, error handling, and refetch behaviour
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useQASMFiles } from '../useQASMFiles'

// ---------- Mocks ----------

const mockIsAuthenticated = vi.fn(() => true)
const mockIsQuantumForcedToDemo = vi.fn(() => false)

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated() }),
}))

vi.mock('../../lib/demoMode', () => ({
  isQuantumForcedToDemo: () => mockIsQuantumForcedToDemo(),
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
}))

// ---------- Setup ----------

beforeEach(() => {
  vi.resetAllMocks()
  mockIsAuthenticated.mockReturnValue(true)
  mockIsQuantumForcedToDemo.mockReturnValue(false)
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Helper: mock a successful fetch with array response
function mockFetchSuccess(files = [{ name: 'test.qasm', size: 100 }]) {
  ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    json: async () => files,
  })
}

// Helper: mock a successful fetch with object response
function mockFetchSuccessObject(files = [{ name: 'test.qasm' }]) {
  ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ files }),
  })
}

// Helper: mock a failed fetch (non-ok status)
function mockFetchError(status = 500) {
  ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: false,
    status,
  })
}

// Helper: mock fetch throwing an exception
function mockFetchThrows(message = 'Network error') {
  ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error(message))
}

// ── Initial state ──

describe('useQASMFiles — initial state', () => {
  it('starts with isLoading true when fetch will be called', async () => {
    mockFetchSuccess()
    const { result } = renderHook(() => useQASMFiles())
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it('starts with empty files array', async () => {
    mockFetchSuccess([])
    const { result } = renderHook(() => useQASMFiles())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.files).toEqual([])
  })

  it('starts with null error', async () => {
    mockFetchSuccess()
    const { result } = renderHook(() => useQASMFiles())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeNull()
  })
})

// ── Successful fetch ──

describe('useQASMFiles — successful fetch', () => {
  it('sets files from array response', async () => {
    const files = [{ name: 'circuit.qasm', size: 200 }]
    mockFetchSuccess(files)
    const { result } = renderHook(() => useQASMFiles())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.files).toEqual(files)
    expect(result.current.error).toBeNull()
  })

  it('sets files from object response with files property', async () => {
    const files = [{ name: 'bell.qasm' }, { name: 'grover.qasm' }]
    mockFetchSuccessObject(files)
    const { result } = renderHook(() => useQASMFiles())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.files).toEqual(files)
  })

  it('calls the correct API endpoint', async () => {
    mockFetchSuccess()
    renderHook(() => useQASMFiles())
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/quantum/qasm/listfiles',
        expect.objectContaining({ method: 'GET' })
      )
    )
  })

  it('sends credentials include', async () => {
    mockFetchSuccess()
    renderHook(() => useQASMFiles())
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: 'include' })
      )
    )
  })

  it('sets isLoading false after fetch completes', async () => {
    mockFetchSuccess()
    const { result } = renderHook(() => useQASMFiles())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })
})

// ── Auth guard ──

describe('useQASMFiles — auth guard', () => {
  it('does not fetch when user is not authenticated', async () => {
    mockIsAuthenticated.mockReturnValue(false)
    const { result } = renderHook(() => useQASMFiles())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(result.current.files).toEqual([])
  })

  it('sets isLoading false when not authenticated', async () => {
    mockIsAuthenticated.mockReturnValue(false)
    const { result } = renderHook(() => useQASMFiles())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it('fetches when user is authenticated', async () => {
    mockIsAuthenticated.mockReturnValue(true)
    mockFetchSuccess()
    renderHook(() => useQASMFiles())
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1))
  })
})

// ── Demo mode guard ──

describe('useQASMFiles — demo mode guard', () => {
  it('does not fetch when quantum is forced to demo mode', async () => {
    mockIsQuantumForcedToDemo.mockReturnValue(true)
    const { result } = renderHook(() => useQASMFiles())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('sets isLoading false in demo mode', async () => {
    mockIsQuantumForcedToDemo.mockReturnValue(true)
    const { result } = renderHook(() => useQASMFiles())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it('returns demo files in demo mode', async () => {
  mockIsQuantumForcedToDemo.mockReturnValue(true)
  const { result } = renderHook(() => useQASMFiles())
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(globalThis.fetch).not.toHaveBeenCalled()
  expect(result.current.files).toEqual([{ name: 'bell.qasm' }])
})
})
// ── enabled flag ──

describe('useQASMFiles — enabled flag', () => {
  it('does not fetch when enabled is false', async () => {
    const { result } = renderHook(() => useQASMFiles(false))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('sets isLoading false when enabled is false', async () => {
    const { result } = renderHook(() => useQASMFiles(false))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it('fetches when enabled is true', async () => {
    mockFetchSuccess()
    renderHook(() => useQASMFiles(true))
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1))
  })

  it('fetches when enabled is undefined (default)', async () => {
    mockFetchSuccess()
    renderHook(() => useQASMFiles())
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1))
  })
})

// ── Error handling ──

describe('useQASMFiles — error handling', () => {
  it('sets error when response is not ok', async () => {
    mockFetchError(500)
    const { result } = renderHook(() => useQASMFiles())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toContain('500')
    expect(result.current.files).toEqual([])
  })

  it('sets error when fetch throws', async () => {
    mockFetchThrows('Network error')
    const { result } = renderHook(() => useQASMFiles())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Network error')
    expect(result.current.files).toEqual([])
  })

  it('sets generic error message for non-Error throws', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce('string error')
    const { result } = renderHook(() => useQASMFiles())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Failed to fetch QASM files')
  })

  it('sets isLoading false after error', async () => {
    mockFetchThrows()
    const { result } = renderHook(() => useQASMFiles())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it('clears previous error on successful refetch', async () => {
    mockFetchThrows()
    const { result } = renderHook(() => useQASMFiles())
    await waitFor(() => expect(result.current.error).not.toBeNull())

    mockFetchSuccess([{ name: 'ok.qasm', size: 0 }])
    await act(async () => {
      await result.current.refetch()
    })
    expect(result.current.error).toBeNull()
    expect(result.current.files).toEqual([{ name: 'ok.qasm', size:0 }])
  })
})

// ── refetch ──

describe('useQASMFiles — refetch', () => {
  it('refetch triggers a new fetch call', async () => {
    mockFetchSuccess()
    const { result } = renderHook(() => useQASMFiles())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    mockFetchSuccess([{ name: 'new.qasm', size: 0 }])
    await act(async () => {
      await result.current.refetch()
    })
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('refetch updates files with new data', async () => {
    mockFetchSuccess([{ name: 'old.qasm', size: 0 }])
    const { result } = renderHook(() => useQASMFiles())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    mockFetchSuccess([{ name: 'new.qasm', size:0 }])
    await act(async () => {
      await result.current.refetch()
    })
    expect(result.current.files).toEqual([{ name: 'new.qasm', size:0 }])
  })

  it('refetch sets isLoading true then false', async () => {
    mockFetchSuccess()
    const { result } = renderHook(() => useQASMFiles())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    mockFetchSuccess()
    await act(async () => {
      await result.current.refetch()
    })
    expect(result.current.isLoading).toBe(false)
  })
})
