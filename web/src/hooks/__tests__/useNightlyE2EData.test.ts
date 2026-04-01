import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

import { useNightlyE2EData } from '../useNightlyE2EData'
import { api } from '../../lib/api'

describe('useNightlyE2EData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns expected shape', () => {
    vi.mocked(api.get).mockResolvedValue({ data: { runs: [] } })
    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('error')
  })

  it('handles API failure gracefully', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useNightlyE2EData())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should not throw
  })
})
