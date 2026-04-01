/**
 * ClusterGroupsSection Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

describe('ClusterGroupsSection', () => {
  it('exports ClusterGroupsSection component', async () => {
    const mod = await import('../ClusterGroupsSection')
    expect(mod.ClusterGroupsSection).toBeDefined()
    expect(typeof mod.ClusterGroupsSection).toBe('function')
  })
})
