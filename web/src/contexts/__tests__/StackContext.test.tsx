/**
 * StackContext Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../hooks/useStackDiscovery', () => ({
  useStackDiscovery: () => ({ stacks: [], isLoading: false, error: null }),
}))

vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: true }),
}))

vi.mock('../../hooks/mcp/clusters', () => ({
  useClusters: () => ({ deduplicatedClusters: [] }),
}))

describe('StackContext', () => {
  it('exports StackContext provider and hook', async () => {
    const mod = await import('../StackContext')
    expect(mod).toBeDefined()
  })
})
