import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../useMCP', () => ({
  useClusters: vi.fn(() => ({ deduplicatedClusters: [], isLoading: false })),
}))
vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: vi.fn() },
}))
vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
}))

import { useKyverno } from '../useKyverno'

describe('useKyverno', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useKyverno())
    expect(result.current).toHaveProperty('isLoading')
  })
})
