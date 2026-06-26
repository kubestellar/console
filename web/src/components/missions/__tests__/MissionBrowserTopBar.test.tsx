import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'missions.browser.hideFilters': 'Hide Filters',
        'missions.browser.showFilters': 'Show Filters',
      }
      return map[key] ?? key
    },
  }),
}))

import { MissionBrowserTopBar } from '../MissionBrowserTopBar'

function renderTopBar(
  overrides: Partial<ComponentProps<typeof MissionBrowserTopBar>> = {},
) {
  const props: ComponentProps<typeof MissionBrowserTopBar> = {
    searchQuery: '',
    onSearchChange: vi.fn(),
    activeTab: 'recommended',
    showFilters: false,
    onToggleFilters: vi.fn(),
    activeFilterCount: 0,
    viewMode: 'grid',
    onViewModeChange: vi.fn(),
    onClose: vi.fn(),
    isSmallScreen: false,
    ...overrides,
  }
  return { props, ...render(<MissionBrowserTopBar {...props} />) }
}

describe('MissionBrowserTopBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the search input with testid', () => {
    renderTopBar()
    expect(screen.getByTestId('mission-search')).toBeInTheDocument()
  })

  it('shows recommended placeholder by default', () => {
    renderTopBar({ activeTab: 'recommended' })
    expect(screen.getByTestId('mission-search')).toHaveAttribute(
      'placeholder',
      expect.stringContaining('Search missions'),
    )
  })

  it('shows installers placeholder on installers tab', () => {
    renderTopBar({ activeTab: 'installers' })
    expect(screen.getByTestId('mission-search')).toHaveAttribute(
      'placeholder',
      expect.stringContaining('Search installers'),
    )
  })

  it('shows fixes placeholder on fixes tab', () => {
    renderTopBar({ activeTab: 'fixes' })
    expect(screen.getByTestId('mission-search')).toHaveAttribute(
      'placeholder',
      expect.stringContaining('Search fixes'),
    )
  })

  it('disables search input on schedule tab', () => {
    renderTopBar({ activeTab: 'schedule' })
    expect(screen.getByTestId('mission-search')).toBeDisabled()
  })

  it('search input is enabled on non-schedule tabs', () => {
    renderTopBar({ activeTab: 'recommended' })
    expect(screen.getByTestId('mission-search')).not.toBeDisabled()
  })

  it('calls onSearchChange when typing in the search input', async () => {
    const user = userEvent.setup()
    const { props } = renderTopBar()
    await user.type(screen.getByTestId('mission-search'), 'cert-manager')
    expect(props.onSearchChange).toHaveBeenCalled()
  })

  it('reflects current searchQuery value', () => {
    renderTopBar({ searchQuery: 'argo' })
    expect(screen.getByTestId('mission-search')).toHaveValue('argo')
  })

  it('filter button has aria-expanded=false when filters are hidden', () => {
    renderTopBar({ showFilters: false })
    expect(screen.getByRole('button', { name: /show filters/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('filter button has aria-expanded=true when filters are shown', () => {
    renderTopBar({ showFilters: true })
    expect(screen.getByRole('button', { name: /hide filters/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('calls onToggleFilters when filter button is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderTopBar()
    await user.click(screen.getByRole('button', { name: /show filters/i }))
    expect(props.onToggleFilters).toHaveBeenCalledOnce()
  })

  it('shows active filter count badge when activeFilterCount > 0', () => {
    renderTopBar({ activeFilterCount: 3 })
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('hides active filter count badge when activeFilterCount is 0', () => {
    renderTopBar({ activeFilterCount: 0 })
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('grid view button has aria-pressed=true when viewMode is grid', () => {
    renderTopBar({ viewMode: 'grid' })
    expect(screen.getByRole('button', { name: /grid view/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /list view/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('list view button has aria-pressed=true when viewMode is list', () => {
    renderTopBar({ viewMode: 'list' })
    expect(screen.getByRole('button', { name: /list view/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /grid view/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('calls onViewModeChange("grid") when grid button is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderTopBar({ viewMode: 'list' })
    await user.click(screen.getByRole('button', { name: /grid view/i }))
    expect(props.onViewModeChange).toHaveBeenCalledWith('grid')
  })

  it('calls onViewModeChange("list") when list button is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderTopBar({ viewMode: 'grid' })
    await user.click(screen.getByRole('button', { name: /list view/i }))
    expect(props.onViewModeChange).toHaveBeenCalledWith('list')
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderTopBar()
    await user.click(screen.getByRole('button', { name: /close mission browser/i }))
    expect(props.onClose).toHaveBeenCalledOnce()
  })

  it('shows filter label text on small screen', () => {
    renderTopBar({ isSmallScreen: true, showFilters: false })
    expect(screen.getByText('Show Filters')).toBeInTheDocument()
  })

  it('hides filter label text on large screen', () => {
    renderTopBar({ isSmallScreen: false, showFilters: false })
    expect(screen.queryByText('Show Filters')).not.toBeInTheDocument()
  })
})
