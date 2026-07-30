import React from 'react'
/**
 * Unit tests for DrasiPipelineHealth card component.
 * Covers: loading skeleton, error state, demo data notice, happy-path data,
 * overall health banner, per-pipeline rows, retry button, and snapshot.
 *
 * Closes #21103
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DrasiPipelineHealth } from './DrasiPipelineHealth'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseCachedDrasiHealth = vi.fn()
vi.mock('../../hooks/useCachedDrasiHealth', () => ({
  useCachedDrasiHealth: () => mockUseCachedDrasiHealth(),
}))

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: ({ height, className }: { height?: number; className?: string }) => (
    <div data-testid="skeleton" data-height={height} className={className} />
  ),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makePipeline = (overrides = {}) => ({
  pipelineName: 'pipeline-alpha',
  health: 'healthy' as const,
  uptimePct: 99.9,
  sourcesHealthy: 2,
  sourcesTotal: 2,
  queriesHealthy: 3,
  queriesTotal: 3,
  reactionsHealthy: 1,
  reactionsTotal: 1,
  ...overrides,
})

const defaultReturn = {
  data: {
    overallHealth: 'healthy' as const,
    pipelines: [makePipeline()],
    healthySources: 2,
    totalSources: 2,
    healthyQueries: 3,
    totalQueries: 3,
    healthyReactions: 1,
    totalReactions: 1,
  },
  isLoading: false,
  isRefreshing: false,
  isDemoData: false,
  isFailed: false,
  consecutiveFailures: 0,
  error: null,
  lastRefresh: null,
  refetch: vi.fn(),
}

function setup(overrides = {}) {
  mockUseCachedDrasiHealth.mockReturnValue({ ...defaultReturn, ...overrides })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DrasiPipelineHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setup()
  })

  // 1. Loading skeleton
  it('renders skeleton tiles when loading with no data', () => {
    setup({ isLoading: true, data: { pipelines: [] } })
    render(<DrasiPipelineHealth />)
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  // 2. Error state
  it('renders error state when failed with no data', () => {
    setup({ isFailed: true, data: { pipelines: [] } })
    render(<DrasiPipelineHealth />)
    expect(screen.getByText(/Failed to load pipeline health/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('calls refetch when retry button is clicked', async () => {
    const refetch = vi.fn()
    setup({ isFailed: true, data: { pipelines: [] }, refetch })
    const user = userEvent.setup()
    render(<DrasiPipelineHealth />)
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(refetch).toHaveBeenCalled()
  })

  // 3. Demo data notice
  it('shows demo data notice when isDemoData is true', () => {
    setup({ isDemoData: true })
    render(<DrasiPipelineHealth />)
    expect(screen.getByText('Demo Data')).toBeInTheDocument()
  })

  it('does not show demo notice when isDemoData is false', () => {
    render(<DrasiPipelineHealth />)
    expect(screen.queryByText('Demo Data')).not.toBeInTheDocument()
  })

  // 4. Happy path
  it('renders overall health banner with Healthy label', () => {
    render(<DrasiPipelineHealth />)
    expect(screen.getAllByText('Healthy')[0]).toBeInTheDocument()
  })

  it('renders overall health banner with Degraded label', () => {
    setup({ data: { ...defaultReturn.data, overallHealth: 'degraded', pipelines: [] } })
    render(<DrasiPipelineHealth />)
    expect(screen.getByText('Degraded')).toBeInTheDocument()
  })

  it('renders overall health banner with Down label', () => {
    setup({ data: { ...defaultReturn.data, overallHealth: 'down', pipelines: [] } })
    render(<DrasiPipelineHealth />)
    expect(screen.getByText('Down')).toBeInTheDocument()
  })

  it('renders pipeline name in list', () => {
    render(<DrasiPipelineHealth />)
    expect(screen.getByText('pipeline-alpha')).toBeInTheDocument()
  })

  it('renders uptime percentage', () => {
    render(<DrasiPipelineHealth />)
    expect(screen.getByText('99.9% uptime')).toBeInTheDocument()
  })

  it('renders Sources health ratio', () => {
    render(<DrasiPipelineHealth />)
    expect(screen.getByLabelText('2 of 2 Sources healthy')).toBeInTheDocument()
  })

  it('renders Queries health ratio', () => {
    render(<DrasiPipelineHealth />)
    expect(screen.getByLabelText('3 of 3 Queries healthy')).toBeInTheDocument()
  })

  it('renders Reactions health ratio', () => {
    render(<DrasiPipelineHealth />)
    expect(screen.getByLabelText('1 of 1 Reactions healthy')).toBeInTheDocument()
  })

  it('renders region with correct aria-label', () => {
    render(<DrasiPipelineHealth />)
    expect(screen.getByRole('region', { name: /Drasi Pipeline Health/i })).toBeInTheDocument()
  })

  it('renders degraded pipeline health label', () => {
    setup({
      data: {
        ...defaultReturn.data,
        pipelines: [makePipeline({ health: 'degraded', uptimePct: 75.5 })],
      },
    })
    render(<DrasiPipelineHealth />)
    expect(screen.getByText('Degraded')).toBeInTheDocument()
  })

  it('renders multiple pipelines', () => {
    setup({
      data: {
        ...defaultReturn.data,
        pipelines: [makePipeline({ pipelineName: 'pipe-a' }), makePipeline({ pipelineName: 'pipe-b' })],
      },
    })
    render(<DrasiPipelineHealth />)
    expect(screen.getByText('pipe-a')).toBeInTheDocument()
    expect(screen.getByText('pipe-b')).toBeInTheDocument()
  })

  // 5. Snapshot
  it('matches snapshot for healthy state', () => {
    const { asFragment } = render(<DrasiPipelineHealth />)
    expect(asFragment()).toMatchSnapshot()
  })
})
