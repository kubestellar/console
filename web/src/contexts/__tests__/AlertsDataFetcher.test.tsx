/**
 * AlertsDataFetcher Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../hooks/useMCP', () => ({
  useGPUNodes: () => ({ nodes: [], isLoading: false, error: null }),
  usePodIssues: () => ({ issues: [], isLoading: false, error: null }),
  useClusters: () => ({ deduplicatedClusters: [], isLoading: false, error: null }),
}))

describe('AlertsDataFetcher', () => {
  it('exports AlertsDataFetcher and AlertsMCPData type', async () => {
    const mod = await import('../AlertsDataFetcher')
    expect(mod).toBeDefined()
    expect(mod.default).toBeDefined()
  })
})
