/**
 * LearnDropdown Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

describe('LearnDropdown', () => {
  it('exports LearnDropdown component', async () => {
    const mod = await import('../LearnDropdown')
    expect(mod.LearnDropdown).toBeDefined()
    expect(typeof mod.LearnDropdown).toBe('function')
  })
})
