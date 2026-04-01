/**
 * AddClusterDialog Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

describe('AddClusterDialog', () => {
  it('exports AddClusterDialog component', async () => {
    const mod = await import('../AddClusterDialog')
    expect(mod.AddClusterDialog).toBeDefined()
    expect(typeof mod.AddClusterDialog).toBe('function')
  })
})
