import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelEndpointSummary } from '../../../../hooks/useCachedModelEndpointHealth'
import type { LLMdServer } from '../../../../hooks/useLLMd'

const mockRefetch = vi.fn()
const mockUseCachedModelEndpointHealth = vi.fn()
const mockUseCardLoadingState = vi.fn()

vi.mock('../../../../hooks/useCachedModelEndpointHealth', () => ({
  useCachedModelEndpointHealth: (clusters?: string[]) => mockUseCachedModelEndpointHealth(clusters),
}))

vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: (options: unknown) => mockUseCardLoadingState(options),
}))

vi.mock('../../../ui/Skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

const runningEndpoint: LLMdServer = {
  id: 'cluster-a-llm-d-llama-model',
  name: 'llama-model',
  namespace: 'llm-d',
  cluster: 'cluster-a',
  model: 'llama',
  type: 'vllm',
  componentType: 'model',
  status: 'running',
  replicas: 2,
  readyReplicas: 2,
  gpu: 'NVIDIA',
  gpuCount: 2,
}

const scalingEndpoint: LLMdServer = {
  ...runningEndpoint,
  id: 'cluster-b-llm-d-granite-model',
  name: 'granite-model',
  cluster: 'cluster-b',
  model: 'granite',
  type: 'tgi',
  status: 'scaling',
  replicas: 2,
  readyReplicas: 1,
}

const degradedSummary: ModelEndpointSummary = {
  health: 'degraded',
  totalEndpoints: 2,
  readyEndpoints: 1,
  degradedEndpoints: 1,
  unavailableEndpoints: 0,
  totalReadyReplicas: 3,
  totalReplicas: 4,
}

function mockModelEndpointHealth(overrides: Record<string, unknown> = {}) {
  mockUseCachedModelEndpointHealth.mockReturnValue({
    data: {
      endpoints: [runningEndpoint, scalingEndpoint],
      summary: degradedSummary,
      lastCheckTime: '2026-06-29T12:00:00.000Z',
    },
    endpoints: [runningEndpoint, scalingEndpoint],
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

import { ModelEndpointHealthCard } from '../ModelEndpointHealthCard'

describe('ModelEndpointHealthCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
    mockModelEndpointHealth()
  })

  it('renders model endpoint health summary and rows', () => {
    render(<ModelEndpointHealthCard />)

    expect(screen.getByText('Model endpoint health')).toBeInTheDocument()
    expect(screen.getAllByText('Degraded').length).toBeGreaterThan(0)
    expect(screen.getByText('llama-model')).toBeInTheDocument()
    expect(screen.getByText('granite-model')).toBeInTheDocument()
    expect(screen.getByText('2 model endpoints')).toBeInTheDocument()
    expect(screen.getByText('3/4')).toBeInTheDocument()
  })

  it('passes configured clusters to the cached hook', () => {
    render(<ModelEndpointHealthCard config={{ clusters: ['cluster-a', 'cluster-b'] }} />)

    expect(mockUseCachedModelEndpointHealth).toHaveBeenCalledWith(['cluster-a', 'cluster-b'])
  })

  it('shows an empty state when no model endpoints are available', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true })
    mockModelEndpointHealth({
      data: {
        endpoints: [],
        summary: {
          health: 'unavailable',
          totalEndpoints: 0,
          readyEndpoints: 0,
          degradedEndpoints: 0,
          unavailableEndpoints: 0,
          totalReadyReplicas: 0,
          totalReplicas: 0,
        },
        lastCheckTime: '2026-06-29T12:00:00.000Z',
      },
      endpoints: [],
      summary: {
        health: 'unavailable',
        totalEndpoints: 0,
        readyEndpoints: 0,
        degradedEndpoints: 0,
        unavailableEndpoints: 0,
        totalReadyReplicas: 0,
        totalReplicas: 0,
      },
    })

    render(<ModelEndpointHealthCard />)

    expect(screen.getByText('No model endpoints found')).toBeInTheDocument()
  })

  it('shows skeleton content while loading', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })

    render(<ModelEndpointHealthCard />)

    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  it('refreshes model endpoint status from the header action', () => {
    render(<ModelEndpointHealthCard />)

    fireEvent.click(screen.getByTitle('Refresh model endpoint health'))

    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })
})
