/**
 * ClusterGroups Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

describe('ClusterGroups', () => {
  it('exports ClusterGroups component', async () => {
    const mod = await import('../ClusterGroups')
    expect(mod.ClusterGroups).toBeDefined()
    expect(typeof mod.ClusterGroups).toBe('function')
  })
})
