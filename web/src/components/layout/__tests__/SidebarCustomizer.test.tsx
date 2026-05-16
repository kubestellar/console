/**
 * SidebarCustomizer Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../../hooks/useSidebarConfig', () => ({
  useSidebarConfig: () => ({
    config: { collapsed: false, items: [], width: 240 },
    toggleCollapsed: vi.fn(),
    reorderItems: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
  }),
  PROTECTED_SIDEBAR_IDS: new Set(['home']),
}))

vi.mock('../../../lib/cn', () => ({
  cn: (...args: string[]) => (args || []).filter(Boolean).join(' '),
}))

/** Timeout for importing heavy modules */
const IMPORT_TIMEOUT_MS = 15000

describe('SidebarCustomizer', () => {
  it('exports SidebarCustomizer component', async () => {
    const mod = await import('../SidebarCustomizer')
    expect(mod.SidebarCustomizer).toBeDefined()
    expect(typeof mod.SidebarCustomizer).toBe('function')
  }, IMPORT_TIMEOUT_MS)
})
