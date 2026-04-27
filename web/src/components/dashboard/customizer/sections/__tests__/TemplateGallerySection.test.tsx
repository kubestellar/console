import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, fallback?: string) => fallback ?? k,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('lucide-react', () => ({
  Check: (props: Record<string, unknown>) => <span data-testid="check-icon" {...props} />,
  Search: (props: Record<string, unknown>) => <span data-testid="search-icon" {...props} />,
}))

vi.mock('../../../../../lib/formatCardTitle', () => ({
  formatCardTitle: (type: string) => type.replace(/_/g, ' '),
}))

vi.mock('../../../../../lib/icons', () => ({
  getIcon: () => (props: Record<string, unknown>) => <span data-testid="cat-icon" {...props} />,
}))

vi.mock('../../../templates', () => ({
  DASHBOARD_TEMPLATES: [
    {
      id: 'tpl-1',
      name: 'Test Template',
      description: 'A test template',
      icon: 'Globe',
      category: 'cluster',
      cards: [
        { card_type: 'cluster_health', position: { w: 4, h: 2 } },
        { card_type: 'pod_issues', position: { w: 4, h: 2 } },
      ],
    },
    {
      id: 'tpl-2',
      name: 'Another Template',
      description: 'Another test template',
      icon: 'Box',
      category: 'workloads',
      cards: [
        { card_type: 'deployment_status', position: { w: 4, h: 2 } },
      ],
    },
  ],
  TEMPLATE_CATEGORIES: [
    { id: 'cluster', name: 'Cluster', icon: 'Globe' },
    { id: 'workloads', name: 'Workloads', icon: 'Box' },
  ],
}))

import { TemplateGallerySection } from '../TemplateGallerySection'

describe('TemplateGallerySection', () => {
  const onReplace = vi.fn()
  const onAdd = vi.fn()

  const renderComponent = (dashboardName?: string) =>
    render(
      <TemplateGallerySection
        onReplaceWithTemplate={onReplace}
        onAddTemplate={onAdd}
        dashboardName={dashboardName}
      />
    )

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders template cards', () => {
    renderComponent()
    expect(screen.getByText('Test Template Collection')).toBeDefined()
    expect(screen.getByText('Another Template Collection')).toBeDefined()
  })

  it('renders template descriptions', () => {
    renderComponent()
    expect(screen.getByText('A test template')).toBeDefined()
    expect(screen.getByText('Another test template')).toBeDefined()
  })

  it('renders card count for each template', () => {
    renderComponent()
    expect(screen.getByText('2 cards')).toBeDefined()
    expect(screen.getByText('1 cards')).toBeDefined()
  })

  it('shows dashboard name in description when provided', () => {
    renderComponent('MyDash')
    expect(screen.getByText(/MyDash dashboard/)).toBeDefined()
  })

  it('shows generic text when no dashboard name', () => {
    renderComponent()
    expect(screen.getByText(/current dashboard/)).toBeDefined()
  })

  it('renders category filter buttons', () => {
    renderComponent()
    expect(screen.getByText('All')).toBeDefined()
    expect(screen.getByText('Cluster')).toBeDefined()
    expect(screen.getByText('Workloads')).toBeDefined()
  })

  it('filters templates by category', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Workloads'))
    expect(screen.queryByText('Test Template Collection')).toBeNull()
    expect(screen.getByText('Another Template Collection')).toBeDefined()
  })

  it('shows all templates when All filter is clicked', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Workloads'))
    fireEvent.click(screen.getByText('All'))
    expect(screen.getByText('Test Template Collection')).toBeDefined()
    expect(screen.getByText('Another Template Collection')).toBeDefined()
  })

  it('filters templates by search text', () => {
    renderComponent()
    const searchInput = screen.getByPlaceholderText('Search collections...')
    fireEvent.change(searchInput, { target: { value: 'Another' } })
    expect(screen.queryByText('Test Template Collection')).toBeNull()
    expect(screen.getByText('Another Template Collection')).toBeDefined()
  })

  it('calls onAddTemplate when + Add is clicked', () => {
    renderComponent()
    const addButtons = screen.getAllByText('+ Add')
    fireEvent.click(addButtons[0])
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'tpl-1' }))
  })

  it('calls onReplaceWithTemplate when Replace is clicked', () => {
    renderComponent()
    const replaceButtons = screen.getAllByText('Replace')
    fireEvent.click(replaceButtons[0])
    expect(onReplace).toHaveBeenCalledTimes(1)
    expect(onReplace).toHaveBeenCalledWith(expect.objectContaining({ id: 'tpl-1' }))
  })

  it('shows Applied confirmation after clicking Add', () => {
    renderComponent()
    const addButtons = screen.getAllByText('+ Add')
    fireEvent.click(addButtons[0])
    expect(screen.getByText('Applied')).toBeDefined()
  })

  it('renders search input', () => {
    renderComponent()
    expect(screen.getByPlaceholderText('Search collections...')).toBeDefined()
  })
})
