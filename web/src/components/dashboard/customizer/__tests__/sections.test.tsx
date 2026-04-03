import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, d?: string) => d || k }),
}))

vi.mock('../../../../lib/modals', () => ({
  BaseModal: Object.assign(
    () => null,
    { Header: () => null, Content: () => null, Footer: () => null }
  ),
  useModalState: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}))

vi.mock('../../../cards/cardRegistry', () => ({
  CARD_COMPONENTS: {},
  DEMO_DATA_CARDS: [],
  LIVE_DATA_CARDS: [],
  MODULE_MAP: {},
  CARD_SIZES: {},
  registerDynamicCardType: vi.fn(),
}))

vi.mock('../../../../lib/dynamic-cards', () => ({
  getAllDynamicCards: () => [],
  onRegistryChange: () => () => {},
}))

vi.mock('../../../shared/TechnicalAcronym', () => ({
  TechnicalAcronym: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, FOCUS_DELAY_MS: 0, RETRY_DELAY_MS: 0 }
})

vi.mock('../../../../lib/analytics', () => ({
  emitAddCardModalOpened: vi.fn(),
  emitAddCardModalAbandoned: vi.fn(),
  emitCardCategoryBrowsed: vi.fn(),
  emitRecommendedCardShown: vi.fn(),
}))

vi.mock('../../../../config/cards', () => ({
  isCardVisibleForProject: () => true,
}))

vi.mock('../../../cards/cardDescriptor', () => ({
  getDescriptorsByCategory: () => new Map(),
}))

describe('CardCatalogSection', () => {
  it('exports CardCatalogSection component', async () => {
    const mod = await import('../sections/CardCatalogSection')
    expect(mod.CardCatalogSection).toBeDefined()
    expect(typeof mod.CardCatalogSection).toBe('function')
  })
})

describe('AISuggestionsSection', () => {
  it('exports AISuggestionsSection component', async () => {
    const mod = await import('../sections/AISuggestionsSection')
    expect(mod.AISuggestionsSection).toBeDefined()
    expect(typeof mod.AISuggestionsSection).toBe('function')
  })
})

describe('TemplateGallerySection', () => {
  it('exports TemplateGallerySection component', async () => {
    const mod = await import('../sections/TemplateGallerySection')
    expect(mod.TemplateGallerySection).toBeDefined()
    expect(typeof mod.TemplateGallerySection).toBe('function')
  })
})

describe('DashboardSettingsSection', () => {
  it('exports DashboardSettingsSection component', async () => {
    const mod = await import('../sections/DashboardSettingsSection')
    expect(mod.DashboardSettingsSection).toBeDefined()
    expect(typeof mod.DashboardSettingsSection).toBe('function')
  })
})

describe('shared/cardCatalog', () => {
  it('exports CARD_CATALOG with multiple categories', async () => {
    const mod = await import('../../shared/cardCatalog')
    expect(mod.CARD_CATALOG).toBeDefined()
    const categories = Object.keys(mod.CARD_CATALOG)
    expect(categories.length).toBeGreaterThan(10)
  })

  it('exports generateCardSuggestions function', async () => {
    const mod = await import('../../shared/cardCatalog')
    expect(typeof mod.generateCardSuggestions).toBe('function')
    const results = mod.generateCardSuggestions('gpu')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].type).toBeDefined()
    expect(results[0].visualization).toBeDefined()
  })

  it('exports RECOMMENDED_CARD_TYPES', async () => {
    const mod = await import('../../shared/cardCatalog')
    expect(mod.RECOMMENDED_CARD_TYPES).toBeDefined()
    expect(mod.RECOMMENDED_CARD_TYPES.length).toBeGreaterThan(0)
  })

  it('exports visualizationIcons', async () => {
    const mod = await import('../../shared/cardCatalog')
    expect(mod.visualizationIcons).toBeDefined()
    expect(mod.visualizationIcons['gauge']).toBeDefined()
    expect(mod.visualizationIcons['table']).toBeDefined()
  })
})

describe('shared/CardPreview', () => {
  it('exports CardPreview component', async () => {
    const mod = await import('../../shared/CardPreview')
    expect(mod.CardPreview).toBeDefined()
    expect(typeof mod.CardPreview).toBe('function')
  })
})
