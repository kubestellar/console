import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArgoCDHealth } from '../ArgoCDHealth'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../hooks/useArgoCD', () => ({
  useArgoCDHealth: vi.fn(() => ({
    stats: { healthy: 0, degraded: 0, progressing: 0, missing: 0, unknown: 0 },
    total: 0,
    healthyPercent: 0,
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoData: false,
  })),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(() => ({ showSkeleton: false, showEmptyState: false })),
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
  getDemoMode: () => false, default: () => false,
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ArgoCDHealth', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useCardLoadingState } = await import('../CardDataContext')
    vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: false } as never)
    const { useArgoCDHealth } = await import('../../../hooks/useArgoCD')
    vi.mocked(useArgoCDHealth).mockReturnValue({
      stats: { healthy: 0, degraded: 0, progressing: 0, missing: 0, unknown: 0 },
      total: 0, healthyPercent: 0, isLoading: false, isRefreshing: false,
      isFailed: false, consecutiveFailures: 0, isDemoData: false,
    } as never)
  })

  describe('Skeleton', () => {
    it('renders skeletons during loading', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: true, showEmptyState: false } as never)
      render(<ArgoCDHealth />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    })
  })

  describe('Empty state', () => {
    it('shows no data message when showEmptyState', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: true } as never)
      render(<ArgoCDHealth />)
      expect(screen.getByText('argoCDHealth.noData')).toBeTruthy()
    })
  })

  describe('Health gauge', () => {
    it('renders healthy percent and total', async () => {
      const { useArgoCDHealth } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoCDHealth).mockReturnValue({
        stats: { healthy: 8, degraded: 1, progressing: 1, missing: 0, unknown: 0 },
        total: 10,
        healthyPercent: 80,
        isLoading: false,
        isRefreshing: false,
        isFailed: false,
        consecutiveFailures: 0,
        isDemoData: false,
      } as never)
      render(<ArgoCDHealth />)
      expect(screen.getByText('80%')).toBeTruthy()
      expect(screen.getByText('10')).toBeTruthy()
    })
  })

  describe('Health breakdown rows', () => {
    it('renders all 5 health status rows', async () => {
      const { useArgoCDHealth } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoCDHealth).mockReturnValue({
        stats: { healthy: 5, degraded: 2, progressing: 1, missing: 0, unknown: 1 },
        total: 9,
        healthyPercent: 55,
        isLoading: false,
        isRefreshing: false,
        isFailed: false,
        consecutiveFailures: 0,
        isDemoData: false,
      } as never)
      render(<ArgoCDHealth />)
      expect(screen.getAllByText('argoCDHealth.healthy').length).toBeGreaterThan(0)
      expect(screen.getByText('argoCDHealth.degraded')).toBeTruthy()
      expect(screen.getByText('argoCDHealth.progressing')).toBeTruthy()
      expect(screen.getByText('argoCDHealth.missing')).toBeTruthy()
      expect(screen.getByText('argoCDHealth.unknown')).toBeTruthy()
    })

    it('shows correct counts per row', async () => {
      const { useArgoCDHealth } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoCDHealth).mockReturnValue({
        stats: { healthy: 7, degraded: 3, progressing: 0, missing: 0, unknown: 0 },
        total: 10,
        healthyPercent: 70,
        isLoading: false,
        isRefreshing: false,
        isFailed: false,
        consecutiveFailures: 0,
        isDemoData: false,
      } as never)
      render(<ArgoCDHealth />)
      expect(screen.getByText('7')).toBeTruthy()
      expect(screen.getByText('3')).toBeTruthy()
    })
  })

  describe('Demo notice', () => {
    it('shows integration notice when isDemoData is true', async () => {
      const { useArgoCDHealth } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoCDHealth).mockReturnValue({
        stats: { healthy: 1, degraded: 0, progressing: 0, missing: 0, unknown: 0 },
        total: 1,
        healthyPercent: 100,
        isLoading: false,
        isRefreshing: false,
        isFailed: false,
        consecutiveFailures: 0,
        isDemoData: true,
      } as never)
      render(<ArgoCDHealth />)
      expect(screen.getByText('argoCDHealth.argocdIntegration')).toBeTruthy()
    })

    it('hides integration notice when not demo', () => {
      render(<ArgoCDHealth />)
      expect(screen.queryByText('argoCDHealth.argocdIntegration')).toBeNull()
    })
  })

  describe('Docs link', () => {
    it('renders external link to ArgoCD docs', async () => {
      const { useArgoCDHealth } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoCDHealth).mockReturnValue({
        stats: { healthy: 1, degraded: 0, progressing: 0, missing: 0, unknown: 0 },
        total: 1,
        healthyPercent: 100,
        isLoading: false,
        isRefreshing: false,
        isFailed: false,
        consecutiveFailures: 0,
        isDemoData: false,
      } as never)
      render(<ArgoCDHealth />)
      const link = document.querySelector('a[href="https://argo-cd.readthedocs.io/"]')
      expect(link).toBeTruthy()
    })
  })
})