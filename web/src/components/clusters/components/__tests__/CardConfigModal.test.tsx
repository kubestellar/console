/**
 * CardConfigModal Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

describe('CardConfigModal', () => {
  it('exports CardConfigModal component', async () => {
    const mod = await import('../CardConfigModal')
    expect(mod.CardConfigModal).toBeDefined()
    expect(typeof mod.CardConfigModal).toBe('function')
  })
})
