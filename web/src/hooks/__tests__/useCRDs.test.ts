import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../useMCP', () => ({
  useClusters: vi.fn(() => ({
    deduplicatedClusters: [{ name: 'prod', reachable: true }],
    isLoading: false,
  })),
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: vi.fn() },
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
}))

import { useCRDs } from '../useCRDs'

describe('useCRDs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns expected shape', () => {
    const { result } = renderHook(() => useCRDs())
    expect(result.current).toHaveProperty('isLoading')
  })
})
