/**
 * ResourceDetailModals Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

describe('ResourceDetailModals', () => {
  it('exports ResourceDetailModals component', async () => {
    const mod = await import('../ResourceDetailModals')
    expect(mod).toBeDefined()
  })
})
