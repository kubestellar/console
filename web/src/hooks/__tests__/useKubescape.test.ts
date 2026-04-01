import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../useMCP', () => ({
  useClusters: vi.fn(() => ({ deduplicatedClusters: [], clusters: [], isLoading: false })),
}))
vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: vi.fn() },
}))
vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
} })
vi.mock('../useDemoMode', () => ({
  useDemoMode: vi.fn(() => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })),
}))
vi.mock('../../lib/modeTransition', () => ({
  registerRefetch: vi.fn(() => vi.fn()),
  registerCacheReset: vi.fn(),
  unregisterCacheReset: vi.fn(),
}))
vi.mock('../../lib/utils/concurrency', () => ({
  settledWithConcurrency: vi.fn(async (tasks: Array<() => Promise<unknown>>) => Promise.all(tasks.map(t => t()))),
}))

import { useKubescape } from '../useKubescape'

describe('useKubescape', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useKubescape())
    expect(result.current).toHaveProperty('isLoading')
  })
})
