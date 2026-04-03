import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, d?: string) => d || k }),
}))

vi.mock('../../../../lib/modals', () => ({
  BaseModal: Object.assign(
    ({ children }: { children: React.ReactNode }) => children,
    { Header: () => null, Content: ({ children }: { children: React.ReactNode }) => children, Footer: () => null, Tabs: () => null }
  ),
  useModalState: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: string[]) => (args || []).filter(Boolean).join(' '),
}))

vi.mock('../../../cards/cardRegistry', () => ({
  CARD_COMPONENTS: {},
  DEMO_DATA_CARDS: [],
  LIVE_DATA_CARDS: [],
  MODULE_MAP: {},
  CARD_SIZES: {},
  registerDynamicCardType: vi.fn(),
}))

describe('DashboardCustomizer', () => {
  it('exports DashboardCustomizer component', async () => {
    const mod = await import('../DashboardCustomizer')
    expect(mod.DashboardCustomizer).toBeDefined()
    expect(typeof mod.DashboardCustomizer).toBe('function')
  })
})

describe('DashboardCustomizerSidebar', () => {
  it('exports DashboardCustomizerSidebar component', async () => {
    const mod = await import('../DashboardCustomizerSidebar')
    expect(mod.DashboardCustomizerSidebar).toBeDefined()
    expect(typeof mod.DashboardCustomizerSidebar).toBe('function')
  })
})

describe('PreviewPanel', () => {
  it('exports PreviewPanel component', async () => {
    const mod = await import('../PreviewPanel')
    expect(mod.PreviewPanel).toBeDefined()
    expect(typeof mod.PreviewPanel).toBe('function')
  })
})

describe('customizerNav', () => {
  it('exports CUSTOMIZER_NAV with expected structure', async () => {
    const mod = await import('../customizerNav')
    expect(mod.CUSTOMIZER_NAV).toBeDefined()
    expect(Array.isArray(mod.CUSTOMIZER_NAV)).toBe(true)
    expect(mod.CUSTOMIZER_NAV.length).toBeGreaterThan(0)
    // Each group has items
    for (const group of mod.CUSTOMIZER_NAV) {
      expect(group.labelKey).toBeDefined()
      expect(Array.isArray(group.items)).toBe(true)
      expect(group.items.length).toBeGreaterThan(0)
    }
  })

  it('exports DEFAULT_SECTION as cards-browse', async () => {
    const mod = await import('../customizerNav')
    expect(mod.DEFAULT_SECTION).toBe('cards-browse')
  })
})
