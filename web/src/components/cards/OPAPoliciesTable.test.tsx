import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OPAPoliciesTable } from './OPAPoliciesTable'
import type { Policy } from './opa'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'messages.offline') return 'Offline'
      if (key === 'messages.checking') return 'Checking status...'
      if (key === 'cards:opaPolicies.createOPAPolicy') return 'Create OPA Policy'
      if (key === 'common:common.searchClusters') return 'Search clusters...'
      
      // Handle pluralization/counts gracefully for test matches
      if (options && typeof options.count === 'number') {
        const count = options.count
        if (key.includes('cluster')) return `${count} cluster${count !== 1 ? 's' : ''}`
      }
      return key
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

// ---------------------------------------------------------------------------
// Default Mock Props
// ---------------------------------------------------------------------------

const defaultProps = {
  installedCount: 1,
  activePolicies: 3,
  totalViolations: 0,
  isRefreshing: false,
  lastRefresh: 1716710400000,
  containerRef: { current: null },
  containerStyle: {},
  paginatedClusters: [
    { name: 'cluster-1', cluster: 'cluster-1', healthy: true, reachable: true }
  ],
  totalItems: 1,
  currentPage: 1,
  totalPages: 1,
  itemsPerPage: 5 as const,
  goToPage: vi.fn(),
  needsPagination: false,
  setItemsPerPage: vi.fn(),
  statuses: {
    'cluster-1': {
      cluster: 'cluster-1',
      installed: true,
      loading: false,
      policyCount: 3,
      violationCount: 0,
      policies: [
        { name: 'require-labels', kind: 'K8sRequiredLabels', violations: 0, mode: 'warn' as const },
        { name: 'allowed-repos', kind: 'K8sAllowedRepos', violations: 0, mode: 'enforce' as const },
        { name: 'require-limits', kind: 'K8sRequireResourceLimits', violations: 0, mode: 'warn' as const }
      ]
    }
  },
  search: '',
  setSearch: vi.fn(),
  availableClusters: [{ name: 'cluster-1', healthy: true }],
  localClusterFilter: [],
  toggleClusterFilter: vi.fn(),
  clearClusterFilter: vi.fn(),
  showClusterFilter: false,
  setShowClusterFilter: vi.fn(),
  clusterFilterRef: { current: null },
  sorting: {
    sortBy: 'name' as const,
    setSortBy: vi.fn(),
    sortDirection: 'asc' as const,
    setSortDirection: vi.fn()
  },
  onShowViolations: vi.fn(),
  onInstallOPA: vi.fn(),
  onPolicyClick: vi.fn(),
  onCreatePolicy: vi.fn()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OPAPoliciesTable Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Scenario 1: All clusters online, all policies installed → healthy status rows
  it('Scenario 1: renders healthy status rows when all clusters are online and policies are installed', () => {
    render(<OPAPoliciesTable {...defaultProps} />)

    expect(screen.getByText('cluster-1')).toBeInTheDocument()
    expect(screen.getByText('Policies Active')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument() // activePolicies count
    expect(screen.getByText('Violations')).toBeInTheDocument()
    expect(screen.getAllByText('0').length).toBeGreaterThan(0) // totalViolations count
    
    // Cluster status info check
    expect(screen.getByText('3 policies')).toBeInTheDocument()
    expect(screen.queryByText(/violation/)).not.toBeInTheDocument() // no violation badge since violationCount = 0

    // Active policies preview section check
    expect(screen.getByText('Active Policies')).toBeInTheDocument()
    expect(screen.getByText('require-labels')).toBeInTheDocument()
    expect(screen.getByText('allowed-repos')).toBeInTheDocument()
    expect(screen.getByText('require-limits')).toBeInTheDocument()
  })

  // Scenario 2: One cluster offline → shows offline indicator for that cluster; others unaffected
  it('Scenario 2: shows offline indicator for offline cluster, others remain unaffected', () => {
    const props = {
      ...defaultProps,
      paginatedClusters: [
        { name: 'cluster-online', cluster: 'cluster-online', healthy: true, reachable: true },
        { name: 'cluster-offline', cluster: 'cluster-offline', healthy: false, reachable: false }
      ],
      statuses: {
        'cluster-online': {
          cluster: 'cluster-online',
          installed: true,
          loading: false,
          policyCount: 1,
          violationCount: 0,
          policies: [{ name: 'require-labels', kind: 'K8sRequiredLabels', violations: 0, mode: 'warn' as const }]
        },
        'cluster-offline': {
          cluster: 'cluster-offline',
          installed: false,
          loading: false
        }
      }
    }

    render(<OPAPoliciesTable {...props} />)

    // Online cluster behaves normally
    expect(screen.getByText('cluster-online')).toBeInTheDocument()
    expect(screen.getByText('1 policy')).toBeInTheDocument()

    // Offline cluster displays offline text
    expect(screen.getByText('cluster-offline')).toBeInTheDocument()
    expect(screen.getByText('Offline')).toBeInTheDocument()
  })

  // Scenario 3: Policy not installed on a cluster → shows "uninstalled" badge for that row
  it('Scenario 3: shows uninstalled badge for cluster without OPA installed and calls install callback', async () => {
    const user = userEvent.setup()
    const props = {
      ...defaultProps,
      statuses: {
        'cluster-1': {
          cluster: 'cluster-1',
          installed: false,
          loading: false
        }
      }
    }

    render(<OPAPoliciesTable {...props} />)

    expect(screen.getByText('cluster-1')).toBeInTheDocument()
    expect(screen.getByText('Not installed')).toBeInTheDocument()

    const installBtn = screen.getByText('Install with an AI Mission →')
    expect(installBtn).toBeInTheDocument()

    await user.click(installBtn)
    expect(props.onInstallOPA).toHaveBeenCalledWith('cluster-1')
  })

  // Scenario 4: Violations count > 0 → shows violations badge with correct number
  it('Scenario 4: shows violations badge with the correct count when violations exist', () => {
    const props = {
      ...defaultProps,
      statuses: {
        'cluster-1': {
          cluster: 'cluster-1',
          installed: true,
          loading: false,
          policyCount: 2,
          violationCount: 5,
          policies: [
            { name: 'require-labels', kind: 'K8sRequiredLabels', violations: 5, mode: 'warn' as const }
          ]
        }
      }
    }

    render(<OPAPoliciesTable {...props} />)

    expect(screen.getByText('5 violations')).toBeInTheDocument()
  })

  // Scenario 5: Violations badge click / row click → calls drilldown callback with correct policy + cluster
  it('Scenario 5: calls correct drilldown callbacks on row and policy click', async () => {
    const user = userEvent.setup()
    render(<OPAPoliciesTable {...defaultProps} />)

    // Click cluster row -> triggers onShowViolations
    const rowBtn = screen.getByRole('button', { name: /cluster-1/ })
    await user.click(rowBtn)
    expect(defaultProps.onShowViolations).toHaveBeenCalledWith('cluster-1')

    // Click policy list item -> triggers onPolicyClick
    const policyBtn = screen.getByRole('button', { name: /require-labels/ })
    await user.click(policyBtn)
    expect(defaultProps.onPolicyClick).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'require-labels' })
    )
  })

  // Scenario 6: Create policy button visible for admin users
  it('Scenario 6: renders create policy button in toolbar and link in footer when onCreatePolicy is provided', () => {
    render(<OPAPoliciesTable {...defaultProps} />)

    // Toolbar button is visible
    expect(screen.getByTitle('Create OPA Policy')).toBeInTheDocument()
    // Footer link button is visible
    expect(screen.getByRole('button', { name: 'Create Policy' })).toBeInTheDocument()
  })

  // Scenario 7: Create policy button absent for read-only users
  it('Scenario 7: does not render create policy button or footer link when onCreatePolicy is omitted', () => {
    const props = {
      ...defaultProps,
      onCreatePolicy: undefined
    }

    render(<OPAPoliciesTable {...props} />)

    // Toolbar button should be absent
    expect(screen.queryByTitle('Create OPA Policy')).not.toBeInTheDocument()
    // Footer link should be absent
    expect(screen.queryByRole('button', { name: 'Create Policy' })).not.toBeInTheDocument()
  })

  // Scenario 8: isLoading=true → scanning / details loading states are shown
  it('Scenario 8: displays checking and details loading states during status checks', () => {
    const props = {
      ...defaultProps,
      statuses: {} // empty statuses triggers isInitialLoading
    }

    const { rerender } = render(<OPAPoliciesTable {...props} />)

    expect(screen.getByText('Checking status...')).toBeInTheDocument()

    // Status has installed=true but loading=true -> triggers isLoadingDetails
    const loadingDetailsProps = {
      ...defaultProps,
      statuses: {
        'cluster-1': {
          cluster: 'cluster-1',
          installed: true,
          loading: true,
          policyCount: 3,
          violationCount: 0
        }
      }
    }

    rerender(<OPAPoliciesTable {...loadingDetailsProps} />)

    expect(screen.getByText('Loading policies...')).toBeInTheDocument()
  })

  // Scenario 9: Empty policy list → renders friendly empty state, not a blank table
  it('Scenario 9: renders a friendly empty state when there are no clusters available', () => {
    const props = {
      ...defaultProps,
      paginatedClusters: [],
      totalItems: 0
    }

    render(<OPAPoliciesTable {...props} />)

    expect(screen.getByText('No clusters available')).toBeInTheDocument()
  })
})
