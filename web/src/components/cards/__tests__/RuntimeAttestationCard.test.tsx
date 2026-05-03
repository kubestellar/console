import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  useCachedAttestation,
  SCORE_THRESHOLD_HIGH,
  SCORE_THRESHOLD_MEDIUM,
} from '../../../hooks/useCachedAttestation'
import type { ClusterAttestationScore } from '../../../hooks/useCachedAttestation'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../hooks/useCachedAttestation', () => ({
  useCachedAttestation: vi.fn(),
  SCORE_THRESHOLD_HIGH: 80,
  SCORE_THRESHOLD_MEDIUM: 60,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDown: () => ({ open: vi.fn() }),
}))

vi.mock('../../drilldown/views/AttestationDrillDown', () => ({
  AttestationDrillDown: () => <div data-testid="mock-drilldown" />,
}))

// Import component after mocks
import { RuntimeAttestationCard } from '../RuntimeAttestationCard'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FULL_PERCENTAGE = 100

function makeCluster(overrides: Partial<ClusterAttestationScore> = {}): ClusterAttestationScore {
  return {
    cluster: 'test-cluster-1',
    overallScore: 92,
    signals: [
      { name: 'Image Provenance', score: 95, weight: 30, detail: 'Signed via TUF' },
      { name: 'Workload Identity', score: 90, weight: 25, detail: 'SPIFFE IDs assigned' },
      { name: 'Policy Compliance', score: 88, weight: 25, detail: 'Kyverno passing' },
      { name: 'Privilege Posture', score: 100, weight: 20, detail: 'No privileged containers' },
    ],
    nonCompliantWorkloads: [],
    ...overrides,
  }
}

function defaultHookResult(overrides: Record<string, unknown> = {}) {
  return {
    data: { clusters: [makeCluster()] },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: Date.now(),
    refetch: vi.fn(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RuntimeAttestationCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useCachedAttestation).mockReturnValue(defaultHookResult() as ReturnType<typeof useCachedAttestation>)
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
      hasData: true,
      isRefreshing: false,
      loadingTimedOut: false,
    })
  })

  it('renders without crashing', () => {
    const { container } = render(<RuntimeAttestationCard />)
    expect(container).toBeTruthy()
  })

  it('calls useCardLoadingState with correct arguments', () => {
    render(<RuntimeAttestationCard />)
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({
        isRefreshing: false,
        isDemoData: false,
        hasAnyData: true,
        isFailed: false,
        consecutiveFailures: 0,
      }),
    )
  })

  it('shows loading skeleton when isLoading is true', () => {
    vi.mocked(useCachedAttestation).mockReturnValue(
      defaultHookResult({ isLoading: true, data: { clusters: [] } }) as ReturnType<typeof useCachedAttestation>,
    )
    const { container } = render(<RuntimeAttestationCard />)
    // Skeleton component renders animate-pulse elements
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows empty state when clusters array is empty', () => {
    vi.mocked(useCachedAttestation).mockReturnValue(
      defaultHookResult({ data: { clusters: [] } }) as ReturnType<typeof useCachedAttestation>,
    )
    render(<RuntimeAttestationCard />)
    expect(screen.getByText('runtimeAttestation.noData')).toBeTruthy()
  })

  it('handles undefined clusters gracefully (array safety)', () => {
    vi.mocked(useCachedAttestation).mockReturnValue(
      defaultHookResult({ data: { clusters: undefined } }) as ReturnType<typeof useCachedAttestation>,
    )
    // Should not crash — component guards with (data.clusters || [])
    const { container } = render(<RuntimeAttestationCard />)
    expect(container).toBeTruthy()
  })

  it('renders cluster names when data is provided', () => {
    const clusters = [
      makeCluster({ cluster: 'prod-east', overallScore: 95 }),
      makeCluster({ cluster: 'staging-west', overallScore: 72 }),
    ]
    vi.mocked(useCachedAttestation).mockReturnValue(
      defaultHookResult({ data: { clusters } }) as ReturnType<typeof useCachedAttestation>,
    )

    render(<RuntimeAttestationCard />)
    expect(screen.getByText('prod-east')).toBeTruthy()
    expect(screen.getByText('staging-west')).toBeTruthy()
  })

  it('renders fleet average score', () => {
    const clusters = [
      makeCluster({ cluster: 'cluster-a', overallScore: 80 }),
      makeCluster({ cluster: 'cluster-b', overallScore: 60 }),
    ]
    vi.mocked(useCachedAttestation).mockReturnValue(
      defaultHookResult({ data: { clusters } }) as ReturnType<typeof useCachedAttestation>,
    )

    render(<RuntimeAttestationCard />)
    // Fleet average = (80 + 60) / 2 = 70
    expect(screen.getByText(`70/${FULL_PERCENTAGE}`)).toBeTruthy()
  })

  it('renders per-cluster scores', () => {
    const clusters = [makeCluster({ cluster: 'my-cluster', overallScore: 85 })]
    vi.mocked(useCachedAttestation).mockReturnValue(
      defaultHookResult({ data: { clusters } }) as ReturnType<typeof useCachedAttestation>,
    )

    render(<RuntimeAttestationCard />)
    expect(screen.getByText('85')).toBeTruthy()
  })

  it('applies green color for high scores', () => {
    const clusters = [makeCluster({ overallScore: SCORE_THRESHOLD_HIGH })]
    vi.mocked(useCachedAttestation).mockReturnValue(
      defaultHookResult({ data: { clusters } }) as ReturnType<typeof useCachedAttestation>,
    )

    const { container } = render(<RuntimeAttestationCard />)
    const greenElements = container.querySelectorAll('.text-green-400')
    expect(greenElements.length).toBeGreaterThan(0)
  })

  it('applies yellow color for medium scores', () => {
    const clusters = [makeCluster({ overallScore: SCORE_THRESHOLD_MEDIUM })]
    vi.mocked(useCachedAttestation).mockReturnValue(
      defaultHookResult({ data: { clusters } }) as ReturnType<typeof useCachedAttestation>,
    )

    const { container } = render(<RuntimeAttestationCard />)
    const yellowElements = container.querySelectorAll('.text-yellow-400')
    expect(yellowElements.length).toBeGreaterThan(0)
  })

  it('applies red color for low scores', () => {
    const clusters = [makeCluster({ overallScore: 30 })]
    vi.mocked(useCachedAttestation).mockReturnValue(
      defaultHookResult({ data: { clusters } }) as ReturnType<typeof useCachedAttestation>,
    )

    const { container } = render(<RuntimeAttestationCard />)
    const redElements = container.querySelectorAll('.text-red-400')
    expect(redElements.length).toBeGreaterThan(0)
  })

  it('passes isDemoData=true when isDemoFallback is true', () => {
    vi.mocked(useCachedAttestation).mockReturnValue(
      defaultHookResult({ isDemoFallback: true }) as ReturnType<typeof useCachedAttestation>,
    )

    render(<RuntimeAttestationCard />)
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({ isDemoData: true }),
    )
  })

  it('renders clickable cluster rows as buttons', () => {
    render(<RuntimeAttestationCard />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
  })
})
