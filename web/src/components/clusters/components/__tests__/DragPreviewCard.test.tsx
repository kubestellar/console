/**
 * DragPreviewCard Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

describe('DragPreviewCard', () => {
  it('exports DragPreviewCard component', async () => {
    const mod = await import('../DragPreviewCard')
    expect(mod.DragPreviewCard).toBeDefined()
    expect(typeof mod.DragPreviewCard).toBe('function')
  })
})
