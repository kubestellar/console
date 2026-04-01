import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
}))

import { useAllConsoleCRs } from '../useConsoleCRs'

describe('useAllConsoleCRs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('not available'))
  })

  it('returns expected shape', () => {
    const { result } = renderHook(() => useAllConsoleCRs())
    expect(result.current).toHaveProperty('loading')
  })
})
