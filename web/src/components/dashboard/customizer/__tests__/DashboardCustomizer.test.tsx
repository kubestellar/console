import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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
  DashboardCustomizerSidebar: ({ activeSection, onSectionChange }: { activeSection: string; onSectionChange?: (s: string) => void }) =>
    <div data-testid="sidebar" data-section={activeSection}>
      <button data-testid="sidebar-go-widgets" onClick={() => onSectionChange?.('widgets')}>widgets</button>
      <button data-testid="sidebar-go-collections" onClick={() => onSectionChange?.('collections')}>collections</button>
      <button data-testid="sidebar-go-card-factory" onClick={() => onSectionChange?.('card-factory')}>card-factory</button>
      <button data-testid="sidebar-go-stat-factory" onClick={() => onSectionChange?.('stat-factory')}>stat-factory</button>
      <button data-testid="sidebar-go-create-dashboard" onClick={() => onSectionChange?.('create-dashboard')}>create-dashboard</button>
    </div>,
}))

vi.mock('../PreviewPanel', () => ({
  PreviewPanel: ({ hoveredCard }: { hoveredCard?: { title?: string } | null }) => (
    <div data-testid="preview-panel">{hoveredCard?.title || 'empty'}</div>
  ),
}))

vi.mock('../sections/UnifiedCardsSection', () => ({
  UnifiedCardsSection: ({
    onAddCards,
    onHoverCard,
    onSelectPreviewCard,
  }: {
    onAddCards?: (cards: Array<{ type: string; title: string; description: string; visualization: string; config: Record<string, unknown> }>) => void
    onHoverCard?: (card: { type: string; title: string; description: string; visualization: string } | null) => void
    onSelectPreviewCard?: (card: { type: string; title: string; description: string; visualization: string }) => void
  }) =>
    <div data-testid="unified-cards">
      <button
        data-testid="trigger-preview-card"
        onClick={() => onSelectPreviewCard?.({ type: 'pods', title: 'Pods', description: '', visualization: 'status' })}
      >preview</button>
      <button
        data-testid="trigger-hover-card"
        onClick={() => onHoverCard?.({ type: 'pods', title: 'Pods', description: '', visualization: 'status' })}
      >hover</button>
      <button
        data-testid="trigger-clear-hover"
        onClick={() => onHoverCard?.(null)}
      >clear hover</button>
      <button
        data-testid="trigger-add-cards"
        onClick={() => onAddCards?.([{ type: 'pods', title: 'Pods', description: '', visualization: 'status', config: {} }])}
      >add</button>
    </div>,
}))

vi.mock('../sections/NavigationSection', () => ({
  NavigationSection: () => <div data-testid="navigation-section" />,
}))

vi.mock('../sections/TemplateGallerySection', () => ({
  TemplateGallerySection: ({
    onReplaceWithTemplate,
    onAddTemplate,
  }: {
    onReplaceWithTemplate?: (tpl: unknown) => void
    onAddTemplate?: (tpl: { cards?: Array<{ card_type: string; config?: Record<string, unknown> }> }) => void
  }) =>
    <div data-testid="template-gallery">
      <button
        data-testid="trigger-replace-template"
        onClick={() => onReplaceWithTemplate?.({ id: 'tpl1', name: 'My Template' })}
      >replace</button>
      <button
        data-testid="trigger-add-template"
        onClick={() => onAddTemplate?.({ cards: [{ card_type: 'pods', config: {} }] })}
      >add template</button>
    </div>,
}))

vi.mock('../../CardFactoryModal', () => ({
  CardFactoryModal: ({ onCardCreated }: { onCardCreated?: (cardId: string) => void }) =>
    <div data-testid="card-factory">
      <button
        data-testid="trigger-card-created"
        onClick={() => onCardCreated?.('my-new-card-id')}
      >created</button>
    </div>,
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
  Layout: () => null,
  LayoutDashboard: () => null,
  LayoutGrid: () => null,
  Palette: () => null,
  Undo2: () => null,
  Redo2: () => null,
  RotateCcw: () => null,
  Wand2: () => null,
  Activity: () => null,
  FolderPlus: () => null,
  Download: () => null,
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

  it('renders WidgetExportModal when initialSection=widgets', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    render(<DashboardCustomizer {...DEFAULT_PROPS} initialSection="widgets" />)
    expect(screen.getByTestId('widget-export')).toBeTruthy()
  })

  it('renders CreateDashboardModal when initialSection=create-dashboard', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    render(<DashboardCustomizer {...DEFAULT_PROPS} initialSection="create-dashboard" />)
    expect(screen.getByTestId('create-dashboard')).toBeTruthy()
  })

  it('renders CardFactoryModal when initialSection=card-factory', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    render(<DashboardCustomizer {...DEFAULT_PROPS} initialSection="card-factory" />)
    expect(screen.getByTestId('card-factory')).toBeTruthy()
  })

  it('renders StatBlockFactoryModal when initialSection=stat-factory', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    render(<DashboardCustomizer {...DEFAULT_PROPS} initialSection="stat-factory" />)
    expect(screen.getByTestId('stat-factory')).toBeTruthy()
  })

  it('renders TemplateGallerySection when initialSection=collections and onApplyTemplate provided', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    render(
      <DashboardCustomizer
        {...DEFAULT_PROPS}
        initialSection="collections"
        onApplyTemplate={vi.fn()}
      />
    )
    expect(screen.getByTestId('template-gallery')).toBeTruthy()
  })

  it('does NOT render TemplateGallerySection when initialSection=collections but onApplyTemplate is absent', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    render(<DashboardCustomizer {...DEFAULT_PROPS} initialSection="collections" />)
    expect(screen.queryByTestId('template-gallery')).toBeNull()
  })

  it('renders Reset Dashboard button when isCustomized=true and onReset provided', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    render(
      <DashboardCustomizer
        {...DEFAULT_PROPS}
        isCustomized={true}
        onReset={vi.fn()}
      />
    )
    expect(screen.getByText('Reset Dashboard')).toBeTruthy()
  })

  it('calls onReset when Reset Dashboard button is clicked', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    const onReset = vi.fn()
    render(
      <DashboardCustomizer
        {...DEFAULT_PROPS}
        isCustomized={true}
        onReset={onReset}
      />
    )
    fireEvent.click(screen.getByText('Reset Dashboard'))
    expect(onReset).toHaveBeenCalledOnce()
  })

  it('shows preview panel for cards section (SECTIONS_WITH_PREVIEW)', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    render(<DashboardCustomizer {...DEFAULT_PROPS} initialSection="cards" />)
    expect(screen.getByTestId('preview-panel')).toBeTruthy()
  })

  it('shows preview panel for collections section (SECTIONS_WITH_PREVIEW)', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    render(
      <DashboardCustomizer
        {...DEFAULT_PROPS}
        initialSection="collections"
        onApplyTemplate={vi.fn()}
      />
    )
    expect(screen.getByTestId('preview-panel')).toBeTruthy()
  })

  it('does NOT show preview panel for widgets section', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    render(<DashboardCustomizer {...DEFAULT_PROPS} initialSection="widgets" />)
    expect(screen.queryByTestId('preview-panel')).toBeNull()
  })

  it('keeps the last selected preview card when hover clears', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    render(<DashboardCustomizer {...DEFAULT_PROPS} initialSection="cards" />)

    fireEvent.click(screen.getByTestId('trigger-preview-card'))
    expect(screen.getByTestId('preview-panel').textContent).toBe('Pods')

    fireEvent.click(screen.getByTestId('trigger-hover-card'))
    fireEvent.click(screen.getByTestId('trigger-clear-hover'))
    expect(screen.getByTestId('preview-panel').textContent).toBe('Pods')
  })

  it('handleAddCards calls onAddCards and onClose when UnifiedCardsSection triggers', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    const onAddCards = vi.fn()
    const onClose = vi.fn()
    render(
      <DashboardCustomizer
        isOpen={true}
        onClose={onClose}
        onAddCards={onAddCards}
        initialSection="cards"
      />
    )
    fireEvent.click(screen.getByTestId('trigger-add-cards'))
    expect(onAddCards).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ type: 'pods' })]))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('handleApplyTemplate calls onApplyTemplate and onClose when TemplateGallerySection triggers replace', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    const onApplyTemplate = vi.fn()
    const onClose = vi.fn()
    render(
      <DashboardCustomizer
        isOpen={true}
        onClose={onClose}
        onAddCards={vi.fn()}
        onApplyTemplate={onApplyTemplate}
        initialSection="collections"
      />
    )
    fireEvent.click(screen.getByTestId('trigger-replace-template'))
    expect(onApplyTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: 'tpl1' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('onAddTemplate converts template cards to CardSuggestion and calls handleAddCards', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    const onAddCards = vi.fn()
    const onClose = vi.fn()
    render(
      <DashboardCustomizer
        isOpen={true}
        onClose={onClose}
        onAddCards={onAddCards}
        onApplyTemplate={vi.fn()}
        initialSection="collections"
      />
    )
    fireEvent.click(screen.getByTestId('trigger-add-template'))
    expect(onAddCards).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: 'pods', visualization: 'status' }),
      ])
    )
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('onCardCreated adds a dynamic_card CardSuggestion and changes section to cards', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    const onAddCards = vi.fn()
    render(
      <DashboardCustomizer
        isOpen={true}
        onClose={vi.fn()}
        onAddCards={onAddCards}
        initialSection="card-factory"
      />
    )
    fireEvent.click(screen.getByTestId('trigger-card-created'))
    expect(onAddCards).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: 'dynamic_card', config: expect.objectContaining({ dynamicCardId: 'my-new-card-id' }) }),
      ])
    )
  })

  it('sidebar onSectionChange switches the active section to widgets', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    render(<DashboardCustomizer {...DEFAULT_PROPS} />)
    // Default is cards
    expect(screen.getByTestId('sidebar').getAttribute('data-section')).toBe('cards')
    fireEvent.click(screen.getByTestId('sidebar-go-widgets'))
    expect(screen.getByTestId('sidebar').getAttribute('data-section')).toBe('widgets')
    expect(screen.getByTestId('widget-export')).toBeTruthy()
  })

  it('sidebar onSectionChange switches to card-factory section', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    render(<DashboardCustomizer {...DEFAULT_PROPS} />)
    fireEvent.click(screen.getByTestId('sidebar-go-card-factory'))
    expect(screen.getByTestId('card-factory')).toBeTruthy()
  })

  it('sidebar onSectionChange switches to stat-factory section', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    render(<DashboardCustomizer {...DEFAULT_PROPS} />)
    fireEvent.click(screen.getByTestId('sidebar-go-stat-factory'))
    expect(screen.getByTestId('stat-factory')).toBeTruthy()
  })

  it('sidebar onSectionChange switches to create-dashboard section', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    render(<DashboardCustomizer {...DEFAULT_PROPS} />)
    fireEvent.click(screen.getByTestId('sidebar-go-create-dashboard'))
    expect(screen.getByTestId('create-dashboard')).toBeTruthy()
  })

  it('Undo button calls onUndo when canUndo=true', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    const onUndo = vi.fn()
    render(
      <DashboardCustomizer {...DEFAULT_PROPS} onUndo={onUndo} canUndo={true} />
    )
    fireEvent.click(screen.getByText('Undo'))
    expect(onUndo).toHaveBeenCalledOnce()
  })

  it('Redo button calls onRedo when canRedo=true', async () => {
    const { DashboardCustomizer } = await import('../DashboardCustomizer')
    const onRedo = vi.fn()
    render(
      <DashboardCustomizer {...DEFAULT_PROPS} onRedo={onRedo} canRedo={true} />
    )
    fireEvent.click(screen.getByText('Redo'))
    expect(onRedo).toHaveBeenCalledOnce()
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
