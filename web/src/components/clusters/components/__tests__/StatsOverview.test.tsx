import React from 'react'
/**
 * StatsOverview Component Tests
 * 
 * StatsOverview displays health status via color-coded stat blocks and value indicators.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

/** Timeout for importing heavy modules */
const IMPORT_TIMEOUT_MS = 30000

describe('StatsOverview', () => {
  it('exports StatsOverview component', async () => {
    const mod = await import('../StatsOverview')
    expect(mod.StatsOverview).toBeDefined()
    expect(typeof mod.StatsOverview).toBe('function')
  }, IMPORT_TIMEOUT_MS)
})
