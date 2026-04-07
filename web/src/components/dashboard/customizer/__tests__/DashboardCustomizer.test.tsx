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
  it('exports DashboardCustomizer as a function component', async () => {
    const mod = await import('../DashboardCustomizer')
    expect(typeof mod.DashboardCustomizer).toBe('function')
  })
})

describe('DashboardCustomizerSidebar', () => {
  it('exports DashboardCustomizerSidebar as a function component', async () => {
    const mod = await import('../DashboardCustomizerSidebar')
    expect(typeof mod.DashboardCustomizerSidebar).toBe('function')
  })
})

describe('PreviewPanel', () => {
  it('exports PreviewPanel as a function component', async () => {
    const mod = await import('../PreviewPanel')
    expect(typeof mod.PreviewPanel).toBe('function')
  })
})

describe('customizerNav', () => {
  it('CUSTOMIZER_NAV has expected items', async () => {
    const mod = await import('../customizerNav')
    expect(mod.CUSTOMIZER_NAV.length).toBeGreaterThanOrEqual(3)
    for (const item of mod.CUSTOMIZER_NAV) {
      expect(typeof item.label).toBe('string')
      expect(typeof item.id).toBe('string')
    }
    // Must include the core sections
    const ids = mod.CUSTOMIZER_NAV.map((i: { id: string }) => i.id)
    expect(ids).toContain('cards')
    expect(ids).toContain('collections')
    expect(ids).toContain('dashboards')
  })

  it('DEFAULT_SECTION is cards', async () => {
    const mod = await import('../customizerNav')
    expect(mod.DEFAULT_SECTION).toBe('cards')
  })
})
