import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ClusterFilterPanel } from '../ClusterFilterPanel'

const filterMocks = {
  toggleCluster: vi.fn(),
  selectAllClusters: vi.fn(),
  deselectAllClusters: vi.fn(),
  toggleSeverity: vi.fn(),
  selectAllSeverities: vi.fn(),
  deselectAllSeverities: vi.fn(),
  toggleStatus: vi.fn(),
  selectAllStatuses: vi.fn(),
  deselectAllStatuses: vi.fn(),
  setCustomFilter: vi.fn(),
  clearCustomFilter: vi.fn(),
  clearAllFilters: vi.fn(),
  toggleDistribution: vi.fn(),
  selectAllDistributions: vi.fn(),
  deselectAllDistributions: vi.fn(),
  saveCurrentFilters: vi.fn(),
  applySavedFilterSet: vi.fn(),
  deleteSavedFilterSet: vi.fn(),
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => String(options?.defaultValue ?? key),
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../../../../hooks/useGlobalFilters', () => ({
  SEVERITY_LEVELS: ['critical', 'warning'],
  SEVERITY_CONFIG: {
    critical: { label: 'Critical', color: 'text-red-400', bgColor: 'bg-red-500/20' },
    warning: { label: 'Warning', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
  },
  STATUS_LEVELS: ['healthy', 'degraded'],
  STATUS_CONFIG: {
    healthy: { label: 'Healthy', color: 'text-green-400', bgColor: 'bg-green-500/20' },
    degraded: { label: 'Degraded', color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
  },
  useGlobalFilters: () => ({
    selectedClusters: ['alpha'],
    availableClusters: ['alpha', 'beta'],
    clusterInfoMap: {
      alpha: { healthy: true, nodeCount: 3, podCount: 12, reachable: true },
      beta: { healthy: false, errorType: 'network', nodeCount: 0, reachable: false },
    },
    isAllClustersSelected: false,
    selectedSeverities: ['critical'],
    isAllSeveritiesSelected: false,
    selectedStatuses: ['healthy'],
    isAllStatusesSelected: false,
    customFilter: 'prod',
    hasCustomFilter: true,
    isFiltered: true,
    selectedDistributions: ['eks'],
    availableDistributions: ['eks', 'kind'],
    isAllDistributionsSelected: false,
    savedFilterSets: [{ id: 'saved-1', name: 'Prod', color: '#8B5CF6' }],
    activeFilterSetId: 'saved-1',
    ...filterMocks,
  }),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: Array<string | false | null | undefined>) => args.filter(Boolean).join(' '),
}))

vi.mock('../../../ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}))

describe('ClusterFilterPanel', () => {
  beforeEach(() => {
    Object.values(filterMocks).forEach((mockFn) => mockFn.mockReset())
  })

  it('exposes dialog semantics and restores focus on Escape', () => {
    render(<ClusterFilterPanel />)

    const trigger = screen.getByRole('button', { name: 'layout.navbar.filtersActive' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', { name: 'navbar.clusterFilter' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(dialog).toHaveAttribute('id', 'navbar-cluster-filter-panel')

    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('dialog', { name: 'navbar.clusterFilter' })).not.toBeInTheDocument()
  })

  it('adds toggle semantics and accessible names for filter controls', () => {
    render(<ClusterFilterPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'layout.navbar.filtersActive' }))

    expect(screen.getByRole('button', { name: 'Delete filter set Prod' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'common:filters.clearCustomFilter' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Critical' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'kind' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /alpha/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders the desktop panel as an overlay anchored to the trigger', () => {
    render(<ClusterFilterPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'layout.navbar.filtersActive' }))

    expect(screen.getByTestId('navbar-cluster-filter-dropdown')).toHaveClass('absolute', 'top-full', 'right-0')
  })
})
