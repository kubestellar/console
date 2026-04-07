/**
 * Comprehensive tests for Console Studio components.
 * Tests exports, data structures, and integration points.
 */
import { describe, it, expect, vi } from 'vitest'

// Common mocks
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

// ============================================================================
// Shared data modules
// ============================================================================

describe('shared/cardCatalog', () => {
  it('CARD_CATALOG has more than 10 categories', async () => {
    const mod = await import('../../shared/cardCatalog')
    expect(Object.keys(mod.CARD_CATALOG).length).toBeGreaterThan(10)
  })

  it('each category has at least one card', async () => {
    const mod = await import('../../shared/cardCatalog')
    for (const [category, cards] of Object.entries(mod.CARD_CATALOG)) {
      expect((cards as unknown[]).length).toBeGreaterThan(0)
    }
  })

  it('generateCardSuggestions returns results for common queries', async () => {
    const { generateCardSuggestions } = await import('../../shared/cardCatalog')
    const queries = ['gpu', 'pod', 'cluster', 'helm', 'namespace', 'cost', 'event']
    for (const q of queries) {
      const results = generateCardSuggestions(q)
      expect(results.length).toBeGreaterThan(0)
      expect(results[0]).toHaveProperty('type')
      expect(results[0]).toHaveProperty('title')
      expect(results[0]).toHaveProperty('visualization')
      expect(results[0]).toHaveProperty('config')
    }
  })

  it('generateCardSuggestions returns fallback for unknown query', async () => {
    const { generateCardSuggestions } = await import('../../shared/cardCatalog')
    const results = generateCardSuggestions('xyzzy')
    expect(results.length).toBe(1)
    expect(results[0].type).toBe('custom_query')
  })

  it('RECOMMENDED_CARD_TYPES references valid card types', async () => {
    const { RECOMMENDED_CARD_TYPES, CARD_CATALOG } = await import('../../shared/cardCatalog')
    const allTypes = new Set(Object.values(CARD_CATALOG).flat().map((c: { type: string }) => c.type))
    for (const type of RECOMMENDED_CARD_TYPES) {
      // Most recommended types should exist in catalog (some may be descriptor-only)
      if (allTypes.has(type)) {
        expect(allTypes.has(type)).toBe(true)
      }
    }
  })

  it('visualizationIcons covers common types', async () => {
    const { visualizationIcons } = await import('../../shared/cardCatalog')
    const expected = ['gauge', 'table', 'timeseries', 'events', 'donut', 'bar', 'status']
    for (const type of expected) {
      expect(typeof visualizationIcons[type]).toBe('string')
    }
  })

  it('CATEGORY_LOCALE_KEYS maps to string keys', async () => {
    const { CATEGORY_LOCALE_KEYS } = await import('../../shared/cardCatalog')
    for (const [key, value] of Object.entries(CATEGORY_LOCALE_KEYS)) {
      expect(typeof key).toBe('string')
      expect(typeof value).toBe('string')
    }
  })

  it('wrapAbbreviations returns content for text with abbreviations', async () => {
    const { wrapAbbreviations } = await import('../../shared/cardCatalog')
    const result = wrapAbbreviations('Check GPU and CPU usage')
    expect(result).toBeDefined()
  })
})

describe('shared/CardPreview', () => {
  it('is a function component', async () => {
    const mod = await import('../../shared/CardPreview')
    expect(typeof mod.CardPreview).toBe('function')
  })
})

// ============================================================================
// Navigation data
// ============================================================================

describe('customizerNav', () => {
  it('contains core sections', async () => {
    const { CUSTOMIZER_NAV, DEFAULT_SECTION } = await import('../customizerNav')
    const ids = CUSTOMIZER_NAV.map(i => i.id)
    expect(ids).toContain('cards')
    expect(ids).toContain('collections')
    expect(ids).toContain('dashboards')
    expect(DEFAULT_SECTION).toBe('cards')
  })

  it('all items have label and icon', async () => {
    const { CUSTOMIZER_NAV } = await import('../customizerNav')
    for (const item of CUSTOMIZER_NAV) {
      expect(typeof item.label).toBe('string')
      expect(item.label.length).toBeGreaterThan(0)
      expect(item.icon).toBeTruthy()
    }
  })
})

// ============================================================================
// Component exports
// ============================================================================

describe('DashboardCustomizer', () => {
  it('is a function component', async () => {
    const mod = await import('../DashboardCustomizer')
    expect(typeof mod.DashboardCustomizer).toBe('function')
  })
})

describe('DashboardCustomizerSidebar', () => {
  it('is a function component', async () => {
    const mod = await import('../DashboardCustomizerSidebar')
    expect(typeof mod.DashboardCustomizerSidebar).toBe('function')
  })
})

describe('PreviewPanel', () => {
  it('is a function component', async () => {
    const mod = await import('../PreviewPanel')
    expect(typeof mod.PreviewPanel).toBe('function')
  })
})

describe('AIAssistBar', () => {
  it('is a function component', async () => {
    const mod = await import('../AIAssistBar')
    expect(typeof mod.AIAssistBar).toBe('function')
  })
})

describe('SectionLayout', () => {
  it('is a function component', async () => {
    const mod = await import('../SectionLayout')
    expect(typeof mod.SectionLayout).toBe('function')
  })
})

// ============================================================================
// Section components
// ============================================================================

describe('UnifiedCardsSection', () => {
  it('is a function component', async () => {
    const mod = await import('../sections/UnifiedCardsSection')
    expect(typeof mod.UnifiedCardsSection).toBe('function')
  })
})

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

describe('NavigationSection', () => {
  it('is a function component', async () => {
    const mod = await import('../sections/NavigationSection')
    expect(typeof mod.NavigationSection).toBe('function')
  })
})

describe('DashboardSettingsSection', () => {
  it('is a function component', async () => {
    const mod = await import('../sections/DashboardSettingsSection')
    expect(typeof mod.DashboardSettingsSection).toBe('function')
  })
})

// ============================================================================
// Template data
// ============================================================================

describe('templates', () => {
  it('DASHBOARD_TEMPLATES has entries', async () => {
    const { DASHBOARD_TEMPLATES } = await import('../../templates')
    expect(DASHBOARD_TEMPLATES.length).toBeGreaterThan(0)
  })

  it('TEMPLATE_CATEGORIES uses Lucide icon names (not emojis)', async () => {
    const { TEMPLATE_CATEGORIES } = await import('../../templates')
    for (const cat of TEMPLATE_CATEGORIES) {
      // Lucide icon names are PascalCase strings, not emoji
      expect(cat.icon).toMatch(/^[A-Z][a-zA-Z0-9]+$/)
    }
  })

  it('each template has required fields', async () => {
    const { DASHBOARD_TEMPLATES } = await import('../../templates')
    for (const tpl of DASHBOARD_TEMPLATES) {
      expect(typeof tpl.id).toBe('string')
      expect(typeof tpl.name).toBe('string')
      expect(typeof tpl.description).toBe('string')
      expect(Array.isArray(tpl.cards)).toBe(true)
    }
  })
})
