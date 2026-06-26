/**
 * GPUDetailModal Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

/** Timeout for importing heavy modules */
const IMPORT_TIMEOUT_MS = 30000

describe('GPUDetailModal', () => {
  it('exports GPUDetailModal component', async () => {
    const mod = await import('../GPUDetailModal')
    expect(mod.GPUDetailModal).toBeDefined()
    expect(typeof mod.GPUDetailModal).toBe('function')
  }, IMPORT_TIMEOUT_MS)
})
