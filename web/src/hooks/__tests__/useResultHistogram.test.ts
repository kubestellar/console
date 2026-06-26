import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useResultHistogram } from '../useResultHistogram'
import * as authModule from '../../lib/auth'

vi.mock('../../lib/auth')

vi.mock('../../lib/demoMode', async () => {
  const actual = await vi.importActual<typeof import('../../lib/demoMode')>('../../lib/demoMode')

  return {
    ...actual,
    isQuantumForcedToDemo: () => false,
  }
})

describe('useResultHistogram', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null data and isLoading false when not authenticated', () => {
    vi.mocked(authModule.useAuth).mockReturnValue({
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
      isLoading: false,
      user: null,
    } as any)

    const { result } = renderHook(() => useResultHistogram())

    expect(result.current.data).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('includes sortBy in query parameters', async () => {
    vi.mocked(authModule.useAuth).mockReturnValue({
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      isLoading: false,
      user: { id: 'user1' },
    } as any)

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers([['content-type', 'application/json']]),
      json: async () => ({
        histogram: [],
        sort: 'pattern',
        num_patterns: 0,
        total_shots: 0,
        num_qubits: null,
        timestamp: null,
        backend: null,
        backend_type: null,
        execution_sequence: null,
      }),
    } as any)

    renderHook(() => useResultHistogram('pattern'))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('sort=pattern'),
        expect.any(Object),
      )
    })

    fetchSpy.mockRestore()
  })

  it('returns refetch function', () => {
    vi.mocked(authModule.useAuth).mockReturnValue({
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      isLoading: false,
      user: { id: 'user1' },
    } as any)

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({}),
    } as any)

    const { result } = renderHook(() => useResultHistogram())

    expect(typeof result.current.refetch).toBe('function')
  })
})
