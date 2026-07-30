import React from 'react'
/**
 * Unit tests for KagentAgentListCard component.
 * Covers: loading skeleton, empty state, metric tiles, health badge,
 * per-cluster breakdown, agent list rows, and snapshot.
 *
 * Closes #21103
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KagentAgentListCard } from './KagentAgentListCard'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts === 'object' && 'count' in opts) return `${opts.count}`
      return key.split('.').pop() ?? key
    },
  }),
}))

const mockUseCachedKagentStatus = vi.fn()
vi.mock('../../hooks/useCachedKagentStatus', () => ({
  useCachedKagentStatus: () => mockUseCachedKagentStatus(),
  HEALTH_THRESHOLD_HEALTHY: 80,
  HEALTH_THRESHOLD_WARNING: 50,
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeAgent = (overrides = {}) => ({
  name: 'agent-1',
  cluster: 'prod',
  namespace: 'default',
  status: 'Ready',
  replicas: 2,
  readyReplicas: 2,
  ...overrides,
})

const makeCluster = (overrides = {}) => ({
  cluster: 'prod',
  totalAgents: 2,
  readyAgents: 2,
  pendingAgents: 0,
  failedAgents: 0,
  healthPercentage: 100,
  agents: [makeAgent()],
  ...overrides,
})

const defaultData = {
  totalAgents: 2,
  clusters: [makeCluster()],
}

const defaultReturn = {
  data: defaultData,
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  consecutiveFailures: 0,
}

function setup(overrides = {}) {
  mockUseCachedKagentStatus.mockReturnValue({ ...defaultReturn, ...overrides })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KagentAgentListCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setup()
  })

  // 1. Loading skeleton
  it('renders skeletons when showSkeleton is true', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })
    render(<KagentAgentListCard />)
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  // 2. Empty state
  it('renders empty state when showEmptyState is true', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true })
    render(<KagentAgentListCard />)
    expect(screen.getByText('noAgents')).toBeInTheDocument()
  })

  // 3. Error / zero data
  it('does not crash when clusters is empty', () => {
    setup({ data: { totalAgents: 0, clusters: [] } })
    render(<KagentAgentListCard />)
    expect(document.body).toBeTruthy()
  })

  // 4. Happy path
  it('renders total agents count', () => {
    render(<KagentAgentListCard />)
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)
  })

  it('renders cluster name', () => {
    render(<KagentAgentListCard />)
    expect(screen.getByText('prod')).toBeInTheDocument()
  })

  it('renders agent name in list', () => {
    render(<KagentAgentListCard />)
    expect(screen.getByText('agent-1')).toBeInTheDocument()
  })

  it('renders ready replica ratio', () => {
    render(<KagentAgentListCard />)
    expect(screen.getByText('2/2')).toBeInTheDocument()
  })

  it('renders health badge percentage', () => {
    render(<KagentAgentListCard />)
    expect(screen.getAllByText('100% healthy').length).toBeGreaterThan(0)
  })

  it('shows ready count in cluster row', () => {
    render(<KagentAgentListCard />)
    expect(screen.getByText('2 ready')).toBeInTheDocument()
  })

  it('shows pending count in cluster row when > 0', () => {
    setup({
      data: {
        totalAgents: 1,
        clusters: [makeCluster({ pendingAgents: 1, healthPercentage: 50 })],
      },
    })
    render(<KagentAgentListCard />)
    expect(screen.getByText('1 pending')).toBeInTheDocument()
  })

  it('shows failed count in cluster row when > 0', () => {
    setup({
      data: {
        totalAgents: 1,
        clusters: [makeCluster({ failedAgents: 1, healthPercentage: 50 })],
      },
    })
    render(<KagentAgentListCard />)
    expect(screen.getByText('1 failed')).toBeInTheDocument()
  })

  it('filters to specific cluster when config.cluster is set', () => {
    setup({
      data: {
        totalAgents: 2,
        clusters: [
          makeCluster({ cluster: 'prod', agents: [makeAgent({ name: 'prod-agent', cluster: 'prod' })] }),
          makeCluster({ cluster: 'staging', agents: [makeAgent({ name: 'staging-agent', cluster: 'staging' })] }),
        ],
      },
    })
    render(<KagentAgentListCard config={{ cluster: 'prod' }} />)
    expect(screen.getByText('prod-agent')).toBeInTheDocument()
    expect(screen.queryByText('staging-agent')).not.toBeInTheDocument()
  })

  // 5. Snapshot
  it('matches snapshot', () => {
    const { asFragment } = render(<KagentAgentListCard />)
    expect(asFragment()).toMatchSnapshot()
  })
})
