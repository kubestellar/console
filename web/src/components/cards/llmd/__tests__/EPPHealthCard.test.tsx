import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EPPStatusSummary } from '../../../../hooks/useCachedEPPStatus'
import type { LLMdServer } from '../../../../hooks/useLLMd'

const mockRefetch = vi.fn()
const mockUseCachedEPPStatus = vi.fn()
const mockUseCardLoadingState = vi.fn()

vi.mock('../../../../hooks/useCachedEPPStatus', () => ({
  useCachedEPPStatus: (clusters?: string[]) => mockUseCachedEPPStatus(clusters),
}))

vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: (options: unknown) => mockUseCardLoadingState(options),
}))

vi.mock('../../../ui/Skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

const runningEPP: LLMdServer = {
  id: 'cluster-a-llm-d-llama-epp',
  name: 'llama-epp',
  namespace: 'llm-d',
  cluster: 'cluster-a',
  model: 'llama',
  type: 'llm-d',
  componentType: 'epp',
  status: 'running',
  replicas: 2,
  readyReplicas: 2,
}

const scalingEPP: LLMdServer = {
  ...runningEPP,
  id: 'cluster-b-llm-d-granite-epp',
  name: 'granite-epp',
  cluster: 'cluster-b',
  model: 'granite',
  status: 'scaling',
  replicas: 2,
  readyReplicas: 1,
}

const degradedSummary: EPPStatusSummary = {
  health: 'degraded',
  totalEPPs: 2,
  readyEPPs: 1,
  degradedEPPs: 1,
  unavailableEPPs: 0,
}

function mockEPPStatus(overrides: Record<string, unknown> = {}) {
  mockUseCachedEPPStatus.mockReturnValue({
    data: {
      epps: [runningEPP, scalingEPP],
      summary: degradedSummary,
      lastCheckTime: '2026-06-27T12:00:00.000Z',
    },
    epps: [runningEPP, scalingEPP],
    summary: degradedSummary,
    lastRefresh: 111111111,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    refetch: mockRefetch,
    ...overrides,
  })
}

import { EPPHealthCard } from '../EPPHealthCard'

describe('EPPHealthCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
    mockEPPStatus()
  })

  it('renders EPP health summary and rows', () => {
    render(<EPPHealthCard />)

    expect(screen.getByText('EPP health')).toBeInTheDocument()
    expect(screen.getAllByText('Degraded').length).toBeGreaterThan(0)
    expect(screen.getByText('llama-epp')).toBeInTheDocument()
    expect(screen.getByText('granite-epp')).toBeInTheDocument()
    expect(screen.getByText('2 Endpoint Picker Pods')).toBeInTheDocument()
  })

  it('passes configured clusters to the cached hook', () => {
    render(<EPPHealthCard config={{ clusters: ['cluster-a', 'cluster-b'] }} />)

    expect(mockUseCachedEPPStatus).toHaveBeenCalledWith(['cluster-a', 'cluster-b'])
  })

  it('shows an empty state when no EPPs are available', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true })
    mockEPPStatus({
      data: {
        epps: [],
        summary: {
          health: 'unavailable',
          totalEPPs: 0,
          readyEPPs: 0,
          degradedEPPs: 0,
          unavailableEPPs: 0,
        },
        lastCheckTime: '2026-06-27T12:00:00.000Z',
      },
      epps: [],
      summary: {
        health: 'unavailable',
        totalEPPs: 0,
        readyEPPs: 0,
        degradedEPPs: 0,
        unavailableEPPs: 0,
      },
    })

    render(<EPPHealthCard />)

    expect(screen.getByText('No EPP deployments found')).toBeInTheDocument()
  })

  it('shows skeleton content while loading', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })

    render(<EPPHealthCard />)

    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  it('refreshes EPP status from the header action', () => {
    render(<EPPHealthCard />)

    fireEvent.click(screen.getByTitle('Refresh EPP status'))

    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })
})
