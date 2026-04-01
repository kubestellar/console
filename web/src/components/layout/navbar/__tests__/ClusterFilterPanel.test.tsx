/**
 * ClusterFilterPanel Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [],
    setSelectedClusters: vi.fn(),
    selectedNamespaces: [],
    setSelectedNamespaces: vi.fn(),
  }),
}))

vi.mock('../../../../hooks/mcp/clusters', () => ({
  useClusters: () => ({ deduplicatedClusters: [] }),
}))

describe('ClusterFilterPanel', () => {
  it('exports ClusterFilterPanel component', async () => {
    const mod = await import('../ClusterFilterPanel')
    expect(mod.ClusterFilterPanel).toBeDefined()
    expect(typeof mod.ClusterFilterPanel).toBe('function')
  })
})
