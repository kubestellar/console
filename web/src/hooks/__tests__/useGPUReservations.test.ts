import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import { useGPUReservations } from '../useGPUReservations'
import { api } from '../../lib/api'

describe('useGPUReservations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockResolvedValue({ data: [] })
  })

  it('returns expected shape', () => {
    const { result } = renderHook(() => useGPUReservations())
    expect(result.current).toHaveProperty('reservations')
    expect(result.current).toHaveProperty('isLoading')
  })

  it('loads reservations on mount', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [{ id: 'r1', namespace: 'default', gpu_count: 2, status: 'active' }],
    })
    const { result } = renderHook(() => useGPUReservations())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.reservations).toHaveLength(1)
  })

  it('handles API failure', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useGPUReservations())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should not throw
  })
})
