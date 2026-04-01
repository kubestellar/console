import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../useMCP', () => ({
  useClusters: vi.fn(() => ({
    deduplicatedClusters: [],
    isLoading: false,
  })),
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: vi.fn() },
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
}))

import { useServiceExports } from '../useServiceExports'

describe('useServiceExports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns expected shape', () => {
    const { result } = renderHook(() => useServiceExports())
    expect(result.current).toHaveProperty('isLoading')
  })
})
