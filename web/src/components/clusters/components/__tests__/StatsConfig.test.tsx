/**
 * StatsConfig Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

describe('StatsConfig', () => {
  it('exports StatsConfigModal and useStatsConfig', async () => {
    const mod = await import('../StatsConfig')
    expect(mod.StatsConfigModal).toBeDefined()
    expect(typeof mod.StatsConfigModal).toBe('function')
    expect(mod.useStatsConfig).toBeDefined()
    expect(typeof mod.useStatsConfig).toBe('function')
  })
})
