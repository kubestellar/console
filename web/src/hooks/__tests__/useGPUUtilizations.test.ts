import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

import { useGPUUtilizations } from '../useGPUUtilizations'
import { api } from '../../lib/api'

describe('useGPUUtilizations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty data when no IDs provided', () => {
    const { result } = renderHook(() => useGPUUtilizations([]))
    expect(result.current.utilizations).toEqual({})
    expect(result.current.isLoading).toBe(false)
  })

  it('fetches data for provided reservation IDs', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        'res-1': [{ id: 's1', reservation_id: 'res-1', gpu_utilization_pct: 80, memory_utilization_pct: 60, active_gpu_count: 2, total_gpu_count: 4, timestamp: '2024-01-01' }],
      },
    })

    const { result } = renderHook(() => useGPUUtilizations(['res-1']))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.utilizations).toHaveProperty('res-1')
  })

  it('handles API failure gracefully', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useGPUUtilizations(['res-1']))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should not throw
  })

  it('handles null API response', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: null })
    const { result } = renderHook(() => useGPUUtilizations(['res-1']))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.utilizations).toEqual({})
  })
})
