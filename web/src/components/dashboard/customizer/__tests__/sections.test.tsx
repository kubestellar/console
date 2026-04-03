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
  it('is a function component', async () => {
    const mod = await import('../sections/CardCatalogSection')
    expect(typeof mod.CardCatalogSection).toBe('function')
  })
})

describe('AISuggestionsSection', () => {
  it('is a function component', async () => {
    const mod = await import('../sections/AISuggestionsSection')
    expect(typeof mod.AISuggestionsSection).toBe('function')
  })
})

describe('TemplateGallerySection', () => {
  it('is a function component', async () => {
    const mod = await import('../sections/TemplateGallerySection')
    expect(typeof mod.TemplateGallerySection).toBe('function')
  })
})

describe('DashboardSettingsSection', () => {
  it('is a function component', async () => {
    const mod = await import('../sections/DashboardSettingsSection')
    expect(typeof mod.DashboardSettingsSection).toBe('function')
  })
})

describe('shared/cardCatalog', () => {
  it('CARD_CATALOG has more than 10 categories', async () => {
    const mod = await import('../../shared/cardCatalog')
    const categories = Object.keys(mod.CARD_CATALOG)
    expect(categories.length).toBeGreaterThan(10)
  })

  it('generateCardSuggestions returns typed results for gpu query', async () => {
    const mod = await import('../../shared/cardCatalog')
    const results = mod.generateCardSuggestions('gpu')
    expect(results.length).toBeGreaterThan(0)
    expect(typeof results[0].type).toBe('string')
    expect(typeof results[0].visualization).toBe('string')
  })

  it('RECOMMENDED_CARD_TYPES is a non-empty array', async () => {
    const mod = await import('../../shared/cardCatalog')
    expect(mod.RECOMMENDED_CARD_TYPES.length).toBeGreaterThan(0)
  })

  it('visualizationIcons maps known types to emoji strings', async () => {
    const mod = await import('../../shared/cardCatalog')
    expect(typeof mod.visualizationIcons['gauge']).toBe('string')
    expect(typeof mod.visualizationIcons['table']).toBe('string')
    expect(typeof mod.visualizationIcons['status']).toBe('string')
  })
})

describe('shared/CardPreview', () => {
  it('is a function component', async () => {
    const mod = await import('../../shared/CardPreview')
    expect(typeof mod.CardPreview).toBe('function')
  })
})
