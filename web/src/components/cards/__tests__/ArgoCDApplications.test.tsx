import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArgoCDApplications } from '../ArgoCDApplications'

const mockUseCardData = vi.fn()
const mockUseCardLoadingState = vi.fn()

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key.split('.').pop() ?? key }),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}))

vi.mock('../../../hooks/useArgoCD', () => ({
  useArgoCDApplications: () => ({
    applications: [
      {
        name: 'app-one',
        namespace: 'default',
        cluster: 'cluster-a',
        syncStatus: 'Synced',
        healthStatus: 'Healthy',
        source: 'git',
        lastSynced: '2026-08-16T00:00:00Z',
      },
    ],
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoData: false,
  }),
  useArgoCDTriggerSync: () => ({
    triggerSync: vi.fn(),
    isSyncing: false,
    lastResult: null,
  }),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToArgoApp: vi.fn() }),
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: (...args: unknown[]) => mockUseCardData(...args),
  commonComparators: {
    string: () => () => 0,
  },
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  CardControlsRow: () => <div data-testid="card-controls" />,
  CardPaginationFooter: () => null,
  CardEmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock('../ui/Button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('../DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
  mockUseCardData.mockReturnValue({
    items: [
      {
        name: 'app-one',
        namespace: 'default',
        cluster: 'cluster-a',
        syncStatus: 'Synced',
        healthStatus: 'Healthy',
        source: 'git',
        lastSynced: '2026-08-16T00:00:00Z',
      },
    ],
    totalItems: 1,
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
      sortBy: 'syncStatus',
      setSortBy: vi.fn(),
      sortDirection: 'asc',
      setSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: {},
  })
})

describe('ArgoCDApplications', () => {
  it('renders an application row', () => {
    render(<ArgoCDApplications />)
    expect(screen.getByText('app-one')).toBeInTheDocument()
  })
})
