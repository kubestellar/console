/**
 * NodeDetailPanel Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

describe('NodeDetailPanel', () => {
  it('exports NodeDetailPanel component', async () => {
    const mod = await import('../NodeDetailPanel')
    expect(mod.NodeDetailPanel).toBeDefined()
    expect(typeof mod.NodeDetailPanel).toBe('function')
  })
})
