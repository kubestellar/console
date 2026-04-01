import { describe, it, expect, vi } from 'vitest'
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

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
} })

import { usePrometheusMetrics } from '../usePrometheusMetrics'

describe('usePrometheusMetrics', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => usePrometheusMetrics())
    expect(result.current).toHaveProperty('loading')
  })
})
