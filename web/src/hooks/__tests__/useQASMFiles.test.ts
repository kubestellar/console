import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useQASMFiles } from '../useQASMFiles'

const { mockUseAuth, mockIsQuantumForcedToDemo } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(() => ({ isAuthenticated: false })),
  mockIsQuantumForcedToDemo: vi.fn(() => false),
}))

vi.mock('../../lib/auth', () => ({ useAuth: () => mockUseAuth() }))
vi.mock('../../lib/demoMode', () => ({ isQuantumForcedToDemo: () => mockIsQuantumForcedToDemo() }))
vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/constants/network')>()
  return {
    ...actual,
    FETCH_DEFAULT_TIMEOUT_MS: 5000,
  }
})

const MOCK_FILES = [
  { name: 'grover.qasm', size: 512 },
  { name: 'shor.qasm', size: 1024 },
]

function makeFetchResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({ isAuthenticated: true })
  mockIsQuantumForcedToDemo.mockReturnValue(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useQASMFiles', () => {
  it('starts with isLoading=true and empty files before fetch resolves', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))

    const { result } = renderHook(() => useQASMFiles())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.files).toHaveLength(0)
    expect(result.current.error).toBeNull()
  })

  it('returns files when fetch succeeds with an array response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(MOCK_FILES)))

    const { result } = renderHook(() => useQASMFiles())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.files).toEqual(MOCK_FILES)
    expect(result.current.error).toBeNull()
  })

  it('returns files when fetch succeeds with a { files: [] } shaped response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse({ files: MOCK_FILES })))

    const { result } = renderHook(() => useQASMFiles())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.files).toEqual(MOCK_FILES)
    expect(result.current.error).toBeNull()
  })

  it('returns an error and empty files when the fetch response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(null, false, 403)))

    const { result } = renderHook(() => useQASMFiles())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe('Failed to fetch QASM files (403)')
    expect(result.current.files).toHaveLength(0)
  })

  it('does not fetch and sets isLoading=false when isAuthenticated is false', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderHook(() => useQASMFiles())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.current.files).toHaveLength(0)
    expect(result.current.error).toBeNull()
  })

  it('does not fetch and sets isLoading=false when isQuantumForcedToDemo returns true', async () => {
    mockIsQuantumForcedToDemo.mockReturnValue(true)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderHook(() => useQASMFiles())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.current.files).toHaveLength(0)
    expect(result.current.error).toBeNull()
  })

  it('does not fetch and sets isLoading=false when enabled is false', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderHook(() => useQASMFiles(false))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.current.files).toHaveLength(0)
    expect(result.current.error).toBeNull()
  })

  it('fetches after demo mode transitions from true to false and user authenticates', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false })
    mockIsQuantumForcedToDemo.mockReturnValue(true)
    const fetchMock = vi.fn().mockResolvedValue(makeFetchResponse(MOCK_FILES))
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(() => useQASMFiles())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(fetchMock).not.toHaveBeenCalled()

    mockIsQuantumForcedToDemo.mockReturnValue(false)
    mockUseAuth.mockReturnValue({ isAuthenticated: true })
    rerender()

    await waitFor(() => expect(result.current.files).toEqual(MOCK_FILES))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
  })

  it('refetch triggers a new fetch and updates files', async () => {
    const updatedFiles = [{ name: 'bernstein-vazirani.qasm', size: 256 }]
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeFetchResponse(MOCK_FILES))
      .mockResolvedValueOnce(makeFetchResponse(updatedFiles))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useQASMFiles())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.files).toEqual(MOCK_FILES)

    await act(async () => {
      await result.current.refetch()
    })

    await waitFor(() => expect(result.current.files).toEqual(updatedFiles))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
