import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { KarmadaStatus } from '../KarmadaStatus'

// Mock the data hook
vi.mock('../useKarmadaStatus', () => ({
  useKarmadaStatus: vi.fn(),
}))

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Mock Skeleton components
vi.mock('../../../ui/Skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div className={`animate-pulse ${className}`} />,
  SkeletonStats: ({ className }: { className?: string }) => <div className={`animate-pulse ${className}`} />,
  SkeletonList: ({ className }: { className?: string }) => <div className={`animate-pulse ${className}`} />,
}))

// Mock CardSearchInput
vi.mock('../../../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ placeholder }: { placeholder?: string }) => <input placeholder={placeholder} />,
}))

import { useKarmadaStatus } from '../useKarmadaStatus'
import { KARMADA_DEMO_DATA } from '../demoData'

const baseMockReturn = {
  data: KARMADA_DEMO_DATA,
  showSkeleton: false,
  showEmptyState: false,
  isDemoFallback: false,
  loading: false,
  isRefreshing: false,
  error: false,
  consecutiveFailures: 0,
}

describe('KarmadaStatus', () => {
  it('renders skeleton when loading', () => {
    vi.mocked(useKarmadaStatus).mockReturnValue({
      ...baseMockReturn,
      showSkeleton: true,
    })
    render(<KarmadaStatus />)
    expect(document.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('renders error state when failed with no data', () => {
    vi.mocked(useKarmadaStatus).mockReturnValue({
      ...baseMockReturn,
      data: {
        ...KARMADA_DEMO_DATA,
        health: 'not-installed',
        memberClusters: [],
      },
      error: true,
      showEmptyState: true,
    })
    render(<KarmadaStatus />)
    expect(screen.getByText('karmada.fetchError')).toBeTruthy()
  })

  it('renders not-installed state when Karmada is absent', () => {
    vi.mocked(useKarmadaStatus).mockReturnValue({
      ...baseMockReturn,
      data: {
        ...KARMADA_DEMO_DATA,
        health: 'not-installed',
        memberClusters: [],
        controllerPods: { ready: 0, total: 0 },
      },
    })
    render(<KarmadaStatus />)
    expect(screen.getByText('karmada.notInstalled')).toBeTruthy()
  })

  it('renders data when loaded with member clusters', () => {
    vi.mocked(useKarmadaStatus).mockReturnValue(baseMockReturn)
    render(<KarmadaStatus />)
    expect(screen.getByText('karmada.clusters')).toBeTruthy()
    expect(screen.getByText('karmada.ready')).toBeTruthy()
    expect(screen.getByText('karmada.failed')).toBeTruthy()
    expect(screen.getByText('karmada.policies')).toBeTruthy()
  })

  it('renders healthy badge when all pods and clusters are ready', () => {
    vi.mocked(useKarmadaStatus).mockReturnValue({
      ...baseMockReturn,
      data: {
        ...KARMADA_DEMO_DATA,
        health: 'healthy',
      },
    })
    render(<KarmadaStatus />)
    expect(screen.getByText('karmada.healthy')).toBeTruthy()
  })

  it('renders degraded badge when controller pods are not all ready', () => {
    vi.mocked(useKarmadaStatus).mockReturnValue({
      ...baseMockReturn,
      data: {
        ...KARMADA_DEMO_DATA,
        health: 'degraded',
      },
    })
    render(<KarmadaStatus />)
    expect(screen.getByText('karmada.degraded')).toBeTruthy()
  })

  it('renders view toggle buttons', () => {
    vi.mocked(useKarmadaStatus).mockReturnValue(baseMockReturn)
    render(<KarmadaStatus />)
    expect(document.getElementById('karmada-clusters-tab')).toBeTruthy()
    expect(document.getElementById('karmada-bindings-tab')).toBeTruthy()
  })
})
