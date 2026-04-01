import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
}))

import { useMarketplace } from '../useMarketplace'

describe('useMarketplace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('not available'))
  })

  it('returns expected shape', () => {
    const { result } = renderHook(() => useMarketplace())
    expect(result.current).toHaveProperty('isLoading')
  })
})
