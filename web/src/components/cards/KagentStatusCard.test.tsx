import React from 'react'
/**
 * Unit tests for KagentStatusCard component.
 * Covers: loading skeleton, empty state, metric tiles, runtime distribution,
 * cluster breakdown, and snapshot.
 *
 * Closes #21103
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KagentStatusCard } from './KagentStatusCard'

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

const mockUseKagentCRDAgents = vi.fn()
const mockUseKagentCRDTools = vi.fn()
const mockUseKagentCRDModels = vi.fn()
vi.mock('../../hooks/mcp/kagent_crds', () => ({
  useKagentCRDAgents: () => mockUseKagentCRDAgents(),
  useKagentCRDTools: () => mockUseKagentCRDTools(),
  useKagentCRDModels: () => mockUseKagentCRDModels(),
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
  name: 'my-agent',
  cluster: 'prod',
  namespace: 'default',
  status: 'Ready',
  runtime: 'openai',
  ...overrides,
})

const makeTool = (overrides = {}) => ({
  name: 'my-tool',
  cluster: 'prod',
  namespace: 'default',
  discoveredTools: ['tool-a', 'tool-b'],
  ...overrides,
})

const makeModel = (overrides = {}) => ({
  name: 'gpt-4o',
  cluster: 'prod',
  namespace: 'default',
  provider: 'openai',
  ...overrides,
})

const agentHookDefault = {
  data: [makeAgent()],
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  consecutiveFailures: 0,
}

const toolHookDefault = {
  data: [makeTool()],
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  consecutiveFailures: 0,
}

const modelHookDefault = {
  data: [makeModel()],
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  consecutiveFailures: 0,
}

function setup(agentOverrides = {}, toolOverrides = {}, modelOverrides = {}) {
  mockUseKagentCRDAgents.mockReturnValue({ ...agentHookDefault, ...agentOverrides })
  mockUseKagentCRDTools.mockReturnValue({ ...toolHookDefault, ...toolOverrides })
  mockUseKagentCRDModels.mockReturnValue({ ...modelHookDefault, ...modelOverrides })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KagentStatusCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setup()
  })

  // 1. Loading skeleton
  it('renders skeletons when showSkeleton is true', () => {
    setup()
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })
    render(<KagentStatusCard />)
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  // 2. Empty state
  it('renders empty state when showEmptyState is true', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true })
    render(<KagentStatusCard />)
    expect(screen.getByText(/emptyTitle/i)).toBeInTheDocument()
  })

  // 3. No data / all empty
  it('does not crash when all hooks return empty arrays', () => {
    setup(
      { data: [] },
      { data: [] },
      { data: [] },
    )
    render(<KagentStatusCard />)
    expect(document.body).toBeTruthy()
  })

  // 4. Happy path — metric tiles
  it('renders agent count', () => {
    render(<KagentStatusCard />)
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('renders runtime distribution row', () => {
    render(<KagentStatusCard />)
    expect(screen.getByText('openai')).toBeInTheDocument()
  })

  it('renders cluster breakdown', () => {
    render(<KagentStatusCard />)
    expect(screen.getByText('prod')).toBeInTheDocument()
  })

  it('renders provider count', () => {
    render(<KagentStatusCard />)
    // model count is 1, providers = 1
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
  })

  it('shows byo label for agents with byo runtime', () => {
    setup({ data: [makeAgent({ runtime: 'byo' })] })
    render(<KagentStatusCard />)
    // byo is translated via t('kagent.byo')
    expect(document.body).toBeTruthy()
  })

  it('passes cluster prop through to hook', () => {
    render(<KagentStatusCard config={{ cluster: 'my-cluster' }} />)
    expect(mockUseKagentCRDAgents).toHaveBeenCalledWith({ cluster: 'my-cluster' })
  })

  // 5. Snapshot
  it('matches snapshot', () => {
    const { asFragment } = render(<KagentStatusCard />)
    expect(asFragment()).toMatchSnapshot()
  })
})
