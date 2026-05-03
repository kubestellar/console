import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

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

vi.mock('../../DashboardHealthIndicator', () => ({
  DashboardHealthIndicator: () => React.createElement('div', { 'data-testid': 'dashboard-health' }),
}))

vi.mock('../../../layout/SidebarCustomizer', () => ({
  SidebarCustomizer: ({ isOpen }: { isOpen: boolean }) =>
    React.createElement('div', { 'data-testid': 'sidebar-customizer', 'data-open': isOpen }),
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

  it('renders without props', async () => {
    const { DashboardSettingsSection } = await import('../sections/DashboardSettingsSection')
    const { container } = render(React.createElement(DashboardSettingsSection))
    expect(container.firstChild).not.toBeNull()
  })

  it('renders export button when onExport is provided', async () => {
    const { DashboardSettingsSection } = await import('../sections/DashboardSettingsSection')
    const onExport = vi.fn()
    const { getByText } = render(React.createElement(DashboardSettingsSection, { onExport }))
    expect(getByText('Export dashboard as JSON')).toBeTruthy()
  })

  it('renders reset button when onReset and isCustomized are provided', async () => {
    const { DashboardSettingsSection } = await import('../sections/DashboardSettingsSection')
    const onReset = vi.fn()
    const { getByText } = render(
      React.createElement(DashboardSettingsSection, { onReset, isCustomized: true })
    )
    expect(getByText('Reset to defaults')).toBeTruthy()
  })

  it('does not render reset button when isCustomized is false', async () => {
    const { DashboardSettingsSection } = await import('../sections/DashboardSettingsSection')
    const onReset = vi.fn()
    const { queryByText } = render(
      React.createElement(DashboardSettingsSection, { onReset, isCustomized: false })
    )
    expect(queryByText('Reset to defaults')).toBeNull()
  })

  it('calls onExport when export button clicked', async () => {
    const { DashboardSettingsSection } = await import('../sections/DashboardSettingsSection')
    const onExport = vi.fn()
    const { getByText } = render(React.createElement(DashboardSettingsSection, { onExport }))
    getByText('Export dashboard as JSON').click()
    expect(onExport).toHaveBeenCalledTimes(1)
  })
})

describe('NavigationSection', () => {
  it('is a function component', async () => {
    const mod = await import('../sections/NavigationSection')
    expect(typeof mod.NavigationSection).toBe('function')
  })

  it('renders SidebarCustomizer in embedded mode', async () => {
    const { NavigationSection } = await import('../sections/NavigationSection')
    const onClose = vi.fn()
    const { getByTestId } = render(React.createElement(NavigationSection, { onClose }))
    expect(getByTestId('sidebar-customizer')).toBeTruthy()
  })

  it('shows dashboard name when provided', async () => {
    const { NavigationSection } = await import('../sections/NavigationSection')
    const onClose = vi.fn()
    const { container } = render(
      React.createElement(NavigationSection, { onClose, dashboardName: 'My Dashboard' })
    )
    expect(container.innerHTML).toContain('My Dashboard')
  })

  it('renders without dashboardName', async () => {
    const { NavigationSection } = await import('../sections/NavigationSection')
    const onClose = vi.fn()
    const { container } = render(React.createElement(NavigationSection, { onClose }))
    expect(container.firstChild).not.toBeNull()
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
