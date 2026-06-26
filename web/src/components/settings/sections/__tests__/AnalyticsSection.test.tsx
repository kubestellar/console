/**
 * AnalyticsSection Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

describe('AnalyticsSection', () => {
  it('exports AnalyticsSection', async () => {
    const mod = await import('../AnalyticsSection')
    expect(mod.AnalyticsSection).toBeDefined()
    expect(typeof mod.AnalyticsSection).toBe('function')
  })
})
