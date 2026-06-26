/**
 * UpdateSettings Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../../hooks/useVersionCheck', () => ({
  useVersionCheck: () => ({
    hasUpdate: false,
    currentVersion: '1.0.0',
    latestVersion: '1.0.0',
    checkForUpdate: vi.fn(),
  }),
}))

describe('UpdateSettings', () => {
  it('exports UpdateSettings component', async () => {
    const mod = await import('../UpdateSettings')
    expect(mod.UpdateSettings).toBeDefined()
    expect(typeof mod.UpdateSettings).toBe('function')
  })
})
