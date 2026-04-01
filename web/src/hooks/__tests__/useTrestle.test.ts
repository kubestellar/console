import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../useMCP', () => ({
  useClusters: vi.fn(() => ({ deduplicatedClusters: [], isLoading: false })),
}))
vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: vi.fn() },
}))

import { useTrestle } from '../useTrestle'

describe('useTrestle', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useTrestle())
    expect(result.current).toHaveProperty('isLoading')
  })
})
