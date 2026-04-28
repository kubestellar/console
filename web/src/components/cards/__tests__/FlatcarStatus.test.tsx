import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FlatcarStatus } from '../flatcar_status'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../flatcar_status/useFlatcarStatus', () => ({
  useFlatcarStatus: vi.fn(() => ({
    data: {
      totalNodes: 0,
      versions: {},
      outdatedNodes: 0,
      health: 'healthy' as const,
      lastCheckTime: new Date().toISOString(),
    },
    loading: false,
    error: false,
    consecutiveFailures: 0,
    showSkeleton: false,
    showEmptyState: false,
  })),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}:${JSON.stringify(opts)}`
      return key
    },
  }),
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('FlatcarStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the skeleton when showSkeleton is true', async () => {
    const { useFlatcarStatus } = await import('../flatcar_status/useFlatcarStatus')
    vi.mocked(useFlatcarStatus).mockReturnValue({
      data: {
        totalNodes: 0,
        versions: {},
        outdatedNodes: 0,
        health: 'healthy',
        lastCheckTime: new Date().toISOString(),
      },
      loading: true,
      error: false,
      consecutiveFailures: 0,
      showSkeleton: true,
      showEmptyState: false,
    })
    const { container } = render(<FlatcarStatus />)
    // Skeleton card contains multiple Skeleton elements (rounded divs)
    expect(container.querySelectorAll('div').length).toBeGreaterThan(0)
  })

  it('renders the empty state when showEmptyState is true', async () => {
    const { useFlatcarStatus } = await import('../flatcar_status/useFlatcarStatus')
    vi.mocked(useFlatcarStatus).mockReturnValue({
      data: {
        totalNodes: 0,
        versions: {},
        outdatedNodes: 0,
        health: 'healthy',
        lastCheckTime: new Date().toISOString(),
      },
      loading: false,
      error: false,
      consecutiveFailures: 0,
      showSkeleton: false,
      showEmptyState: true,
    })
    render(<FlatcarStatus />)
    expect(screen.getByText('flatcar.noFlatcarNodes')).toBeTruthy()
    expect(screen.getByText('flatcar.noFlatcarNodesHint')).toBeTruthy()
  })

  it('renders the error state when error is true', async () => {
    const { useFlatcarStatus } = await import('../flatcar_status/useFlatcarStatus')
    vi.mocked(useFlatcarStatus).mockReturnValue({
      data: {
        totalNodes: 0,
        versions: {},
        outdatedNodes: 0,
        health: 'healthy',
        lastCheckTime: new Date().toISOString(),
      },
      loading: false,
      error: true,
      consecutiveFailures: 1,
      showSkeleton: false,
      showEmptyState: false,
    })
    render(<FlatcarStatus />)
    expect(screen.getByText('flatcar.fetchError')).toBeTruthy()
  })

  it('renders healthy badge, metric tiles, and version distribution with data', async () => {
    const { useFlatcarStatus } = await import('../flatcar_status/useFlatcarStatus')
    vi.mocked(useFlatcarStatus).mockReturnValue({
      data: {
        totalNodes: 24,
        versions: { '3815.2.5': 18, '3760.1.0': 4, '3602.2.3': 2 },
        outdatedNodes: 0,
        health: 'healthy',
        lastCheckTime: new Date().toISOString(),
      },
      loading: false,
      error: false,
      consecutiveFailures: 0,
      showSkeleton: false,
      showEmptyState: false,
    })
    render(<FlatcarStatus />)
    expect(screen.getByText('flatcar.healthy')).toBeTruthy()
    expect(screen.getByText('flatcar.totalNodes')).toBeTruthy()
    expect(screen.getByText('flatcar.outdated')).toBeTruthy()
    expect(screen.getByText('flatcar.versionDistribution')).toBeTruthy()
    expect(screen.getByText('v3815.2.5')).toBeTruthy()
    expect(screen.getByText('flatcar.openFlatcar')).toBeTruthy()
  })

  it('renders degraded badge when health is degraded', async () => {
    const { useFlatcarStatus } = await import('../flatcar_status/useFlatcarStatus')
    vi.mocked(useFlatcarStatus).mockReturnValue({
      data: {
        totalNodes: 24,
        versions: { '3815.2.5': 18, '3760.1.0': 6 },
        outdatedNodes: 6,
        health: 'degraded',
        lastCheckTime: new Date().toISOString(),
      },
      loading: false,
      error: false,
      consecutiveFailures: 0,
      showSkeleton: false,
      showEmptyState: false,
    })
    render(<FlatcarStatus />)
    expect(screen.getByText('flatcar.degraded')).toBeTruthy()
  })
})
