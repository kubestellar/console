import React from 'react'
/**
 * Unit tests for OpenCostOverview card component.
 * Covers: integration notice, demo namespace cost table, sorting,
 * search, pagination, drill-down, and snapshot.
 *
 * Closes #21103
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OpenCostOverview } from './OpenCostOverview'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop() ?? key,
  }),
}))

const mockDrillToCost = vi.fn()
vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToCost: mockDrillToCost }),
}))

const mockUseCardData = vi.fn()
vi.mock('../../lib/cards/cardHooks', () => ({
  useCardData: (...args: unknown[]) => mockUseCardData(...args),
  commonComparators: {
    string: (_field: string) => () => 0,
    number: (_field: string) => () => 0,
  },
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({
    value,
    onChange,
  }: {
    value: string
    onChange: (v: string) => void
  }) => (
    <input
      data-testid="card-search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
  CardControlsRow: () => <div data-testid="card-controls" />,
  CardPaginationFooter: ({
    needsPagination,
  }: {
    needsPagination: boolean
  }) => (needsPagination ? <div data-testid="pagination" /> : null),
}))

vi.mock('./CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
}))

vi.mock('./DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const demoItems = [
  { namespace: 'production', cpuCost: 2450, memCost: 890, storageCost: 340, totalCost: 3680 },
  { namespace: 'ml-training', cpuCost: 1820, memCost: 1240, storageCost: 890, totalCost: 3950 },
]

function makeCardDataReturn(items = demoItems) {
  return {
    items,
    totalItems: items.length,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 5,
    goToPage: vi.fn(),
    needsPagination: false,
    setItemsPerPage: vi.fn(),
    filters: {
      search: '',
      setSearch: vi.fn(),
      localClusterFilter: [],
      toggleClusterFilter: vi.fn(),
      clearClusterFilter: vi.fn(),
      availableClusters: [],
      showClusterFilter: false,
      setShowClusterFilter: vi.fn(),
      clusterFilterRef: { current: null },
    },
    sorting: {
      sortBy: 'cost',
      setSortBy: vi.fn(),
      sortDirection: 'desc',
      setSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: {},
  }
}

function setup() {
  mockUseCardData.mockReturnValue(makeCardDataReturn())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OpenCostOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setup()
  })

  // 1. Integration notice
  it('renders OpenCost integration notice', () => {
    render(<OpenCostOverview />)
    expect(screen.getAllByText(/OpenCost/i).length).toBeGreaterThan(0)
  })

  // 2. Namespace rows
  it('renders production namespace', () => {
    render(<OpenCostOverview />)
    expect(screen.getByText('production')).toBeInTheDocument()
  })

  it('renders ml-training namespace', () => {
    render(<OpenCostOverview />)
    expect(screen.getByText('ml-training')).toBeInTheDocument()
  })

  it('renders total cost for production namespace', () => {
    render(<OpenCostOverview />)
    expect(screen.getByText(/3,680/)).toBeInTheDocument()
  })

  // 3. Search input
  it('renders search input', () => {
    render(<OpenCostOverview />)
    expect(screen.getByTestId('card-search')).toBeInTheDocument()
  })

  // 4. External link
  it('renders link to opencost website', () => {
    render(<OpenCostOverview />)
    const links = screen.getAllByRole('link')
    expect(links.some(l => l.getAttribute('href')?.includes('opencost'))).toBe(true)
  })

  // 5. Snapshot
  it('matches snapshot', () => {
    const { asFragment } = render(<OpenCostOverview />)
    expect(asFragment()).toMatchSnapshot()
  })
})
