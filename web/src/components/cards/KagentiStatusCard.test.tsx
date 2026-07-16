import React from 'react'
/**
 * Unit tests for KagentiStatusCard component.
 * Covers: loading skeleton, empty state, metric tiles, build list, tool list,
 * and snapshot.
 *
 * Closes #21103
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KagentiStatusCard } from './KagentiStatusCard'

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

const mockUseKagentiAgents = vi.fn()
const mockUseKagentiBuilds = vi.fn()
const mockUseKagentiTools = vi.fn()
vi.mock('../../hooks/useMCP', () => ({
  useKagentiAgents: (opts: Record<string, unknown>) => mockUseKagentiAgents(opts),
  useKagentiBuilds: (opts: Record<string, unknown>) => mockUseKagentiBuilds(opts),
  useKagentiTools: (opts: Record<string, unknown>) => mockUseKagentiTools(opts),
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
  name: 'kagenti-agent',
  cluster: 'prod',
  namespace: 'default',
  status: 'Running',
  framework: 'langgraph',
  ...overrides,
})

const makeBuild = (overrides = {}) => ({
  name: 'my-build',
  cluster: 'prod',
  namespace: 'default',
  status: 'Succeeded',
  framework: 'langgraph',
  ...overrides,
})

const makeTool = (overrides = {}) => ({
  name: 'tool-server-a',
  cluster: 'prod',
  namespace: 'default',
  status: 'Running',
  ...overrides,
})

const agentHookDefault = {
  data: [makeAgent()],
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  consecutiveFailures: 0,
}

const buildHookDefault = {
  data: [makeBuild()],
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

function setup(agentOverrides = {}, buildOverrides = {}, toolOverrides = {}) {
  mockUseKagentiAgents.mockReturnValue({ ...agentHookDefault, ...agentOverrides })
  mockUseKagentiBuilds.mockReturnValue({ ...buildHookDefault, ...buildOverrides })
  mockUseKagentiTools.mockReturnValue({ ...toolHookDefault, ...toolOverrides })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KagentiStatusCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setup()
  })

  // 1. Loading skeleton
  it('renders skeletons when showSkeleton is true', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })
    render(<KagentiStatusCard />)
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  // 2. Empty state
  it('renders empty state when showEmptyState is true', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true })
    render(<KagentiStatusCard />)
    expect(screen.getByText(/emptyTitle/i)).toBeInTheDocument()
  })

  // 3. Zero data
  it('does not crash when all hooks return empty arrays', () => {
    setup({ data: [] }, { data: [] }, { data: [] })
    render(<KagentiStatusCard />)
    expect(document.body).toBeTruthy()
  })

  // 4. Happy path
  it('renders agent count tile', () => {
    render(<KagentiStatusCard />)
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
  })

  it('renders recent build in list', () => {
    render(<KagentiStatusCard />)
    expect(screen.getByText('my-build')).toBeInTheDocument()
  })

  it('renders tool server in list', () => {
    render(<KagentiStatusCard />)
    expect(screen.getByText('tool-server-a')).toBeInTheDocument()
  })

  it('renders kagenti agent in list', () => {
    render(<KagentiStatusCard />)
    expect(screen.getByText('kagenti-agent')).toBeInTheDocument()
  })

  it('passes cluster prop to hooks', () => {
    render(<KagentiStatusCard config={{ cluster: 'staging' }} />)
    expect(mockUseKagentiAgents).toHaveBeenCalledWith({ cluster: 'staging' })
  })

  // 5. Smoke render
  it('renders Kagenti status content', () => {
    render(<KagentiStatusCard />)
    expect(screen.getByText('my-build')).toBeInTheDocument()
  })
})
