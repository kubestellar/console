/**
 * NodeListItem Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

describe('NodeListItem', () => {
  it('exports NodeListItem component', async () => {
    const mod = await import('../NodeListItem')
    expect(mod.NodeListItem).toBeDefined()
    expect(typeof mod.NodeListItem).toBe('function')
  })
})
