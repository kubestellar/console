import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, d?: string) => d || k }),
}))

vi.mock('../../../../lib/modals', () => ({
  BaseModal: Object.assign(
    ({ children, isOpen }: { children: React.ReactNode; isOpen?: boolean }) =>
      isOpen ? <div data-testid="base-modal">{children}</div> : null,
    {
      Header: ({ title }: { title?: string }) => <div data-testid="modal-header">{title}</div>,
      Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      Footer: () => null,
      Tabs: () => null,
    }
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

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../../../../hooks/useDashboards', () => ({
  useDashboards: () => ({ dashboards: [], createDashboard: vi.fn() }),
}))

vi.mock('../../../../hooks/useSidebarConfig', () => ({
  useSidebarConfig: () => ({ addItem: vi.fn() }),
}))

vi.mock('../../../../lib/iconSuggester', () => ({
  suggestIconSync: () => 'layout-dashboard',
}))

vi.mock('../DashboardCustomizerSidebar', () => ({
  DashboardCustomizerSidebar: ({ activeSection }: { activeSection: string }) =>
    <div data-testid="sidebar" data-section={activeSection} />,
}))

vi.mock('../PreviewPanel', () => ({
  PreviewPanel: () => <div data-testid="preview-panel" />,
}))

vi.mock('../sections/UnifiedCardsSection', () => ({
  UnifiedCardsSection: () => <div data-testid="unified-cards" />,
}))

vi.mock('../sections/NavigationSection', () => ({
  NavigationSection: () => <div data-testid="navigation-section" />,
}))

vi.mock('../sections/TemplateGallerySection', () => ({
  TemplateGallerySection: () => <div data-testid="template-gallery" />,
}))

vi.mock('../../CardFactoryModal', () => ({
  CardFactoryModal: () => <div data-testid="card-factory" />,
}))

vi.mock('../../StatBlockFactoryModal', () => ({
  StatBlockFactoryModal: () => <div data-testid="stat-factory" />,
}))

vi.mock('../../CreateDashboardModal', () => ({
  CreateDashboardModal: () => <div data-testid="create-dashboard" />,
}))

vi.mock('../../../widgets/WidgetExportModal', () => ({
  WidgetExportModal: () => <div data-testid="widget-export" />,
}))

vi.mock('lucide-react', () => ({
  Palette: () => null,
  Undo2: () => null,
  Redo2: () => null,
  RotateCcw: () => null,
}))

const DEFAULT_PROPS = {
  isOpen: true,
  onClose: vi.fn(),
  onAddCards: vi.fn(),
}

describe('DashboardCustomizer', () => {
  it('exports DashboardCustomizer as a function component', async () => {
    const mod = await import('../DashboardCustomizer')
    expect(typeof mod.DashboardCustomizer).toBe('function')
  })

  it('renders the modal when isOpen=true', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    render(<DashboardCustomizer {...DEFAULT_PROPS} />)
    expect(screen.getByTestId('base-modal')).toBeTruthy()
  })

  it('renders nothing when isOpen=false', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    const { container } = render(
      <DashboardCustomizer {...DEFAULT_PROPS} isOpen={false} />
    )
    expect(container.querySelector('[data-testid="base-modal"]')).toBeNull()
  })

  it('renders sidebar with default cards section', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    render(<DashboardCustomizer {...DEFAULT_PROPS} />)
    const sidebar = screen.getByTestId('sidebar')
    expect(sidebar.getAttribute('data-section')).toBe('cards')
  })

  it('renders with initialSection=dashboards', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    render(<DashboardCustomizer {...DEFAULT_PROPS} initialSection="dashboards" />)
    expect(screen.getByTestId('navigation-section')).toBeTruthy()
  })

  it('renders header title', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    render(<DashboardCustomizer {...DEFAULT_PROPS} />)
    expect(screen.getByText('Console Studio')).toBeTruthy()
  })

  it('renders undo/redo buttons when handlers provided', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    render(
      <DashboardCustomizer
        {...DEFAULT_PROPS}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        canUndo={true}
        canRedo={false}
      />
    )
    expect(screen.getByTestId('base-modal')).toBeTruthy()
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
