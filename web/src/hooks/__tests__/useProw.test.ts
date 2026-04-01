import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../../lib/constants', () => ({
  STORAGE_KEY_TOKEN: 'kc-auth-token',
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
}))

import { useProw } from '../useProw'

describe('useProw', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('not available'))
  })

  it('returns expected shape', () => {
    const { result } = renderHook(() => useProw())
    expect(result.current).toHaveProperty('isLoading')
  })
})
