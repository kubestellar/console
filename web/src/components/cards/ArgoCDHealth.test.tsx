import React from 'react'
/**
 * Unit tests for ArgoCDHealth card component.
 *
 * Covers: loading skeleton, empty state, demo data integration notice,
 * live data rendering (percent gauge, health breakdown bars), and
 * CardLoadingState integration.
 *
 * Part of #21100
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop() ?? key,
  }),
}))

const mockUseArgoCDHealth = vi.fn()
vi.mock('../../hooks/useArgoCD', () => ({
  useArgoCDHealth: () => mockUseArgoCDHealth(),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
  useReportCardDataState: () => {},
}))

const mockUseDemoMode = vi.fn()
vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: (props: Record<string, unknown>) => (
    <div data-testid="skeleton" data-variant={props.variant} />
  ),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultHealthData = {
  stats: { healthy: 0, degraded: 0, progressing: 0, missing: 0, unknown: 0 },
  total: 0,
  healthyPercent: 0,
  isLoading: false,
  isRefreshing: false,
  isFailed: false,
  consecutiveFailures: 0,
  isDemoData: false,
}

function setupMocks(opts: {
  isLoading?: boolean
  showSkeleton?: boolean
  showEmptyState?: boolean
  total?: number
  healthyPercent?: number
  stats?: typeof defaultHealthData.stats
  isDemoData?: boolean
} = {}) {
  const total = opts.total ?? 0
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  mockUseArgoCDHealth.mockReturnValue({
    ...defaultHealthData,
    isLoading: opts.isLoading ?? false,
    isDemoData: opts.isDemoData ?? false,
    total,
    healthyPercent: opts.healthyPercent ?? 0,
    stats: opts.stats ?? defaultHealthData.stats,
  })
  mockUseCardLoadingState.mockReturnValue({
    showSkeleton: opts.showSkeleton ?? false,
    showEmptyState: opts.showEmptyState ?? false,
    isRefreshing: false,
    hasData: total > 0,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ArgoCDHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loading state', () => {
    it('renders skeleton placeholders when showSkeleton is true', async () => {
      setupMocks({ isLoading: true, showSkeleton: true })
      const { ArgoCDHealth } = await import('./ArgoCDHealth')
      render(<ArgoCDHealth />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(3)
    })

    it('passes isLoading and hasAnyData correctly to useCardLoadingState', async () => {
      setupMocks({ isLoading: true, total: 0 })
      const { ArgoCDHealth } = await import('./ArgoCDHealth')
      render(<ArgoCDHealth />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isLoading: true, hasAnyData: false }),
      )
    })

    it('reports hasAnyData true when data exists during loading', async () => {
      setupMocks({ isLoading: true, total: 5, stats: { healthy: 3, degraded: 1, progressing: 1, missing: 0, unknown: 0 } })
      const { ArgoCDHealth } = await import('./ArgoCDHealth')
      render(<ArgoCDHealth />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isLoading: false, hasAnyData: true }),
      )
    })
  })

  describe('empty state', () => {
    it('renders empty state message when showEmptyState is true', async () => {
      setupMocks({ showEmptyState: true })
      const { ArgoCDHealth } = await import('./ArgoCDHealth')
      render(<ArgoCDHealth />)
      expect(screen.getByText('noData')).toBeInTheDocument()
      expect(screen.getByText('connectArgoCD')).toBeInTheDocument()
    })
  })

  describe('live data rendering', () => {
    it('renders healthy percentage and total app count', async () => {
      setupMocks({
        total: 10,
        healthyPercent: 80,
        stats: { healthy: 8, degraded: 1, progressing: 0, missing: 0, unknown: 1 },
      })
      const { ArgoCDHealth } = await import('./ArgoCDHealth')
      render(<ArgoCDHealth />)
      expect(screen.getByText('80%')).toBeInTheDocument()
      expect(screen.getByText('10')).toBeInTheDocument()
    })

    it('renders health breakdown row counts', async () => {
      setupMocks({
        total: 6,
        healthyPercent: 50,
        stats: { healthy: 3, degraded: 2, progressing: 1, missing: 0, unknown: 0 },
      })
      const { ArgoCDHealth } = await import('./ArgoCDHealth')
      render(<ArgoCDHealth />)
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('1')).toBeInTheDocument()
    })

    it('renders external link to ArgoCD docs', async () => {
      setupMocks({ total: 1, healthyPercent: 100, stats: { healthy: 1, degraded: 0, progressing: 0, missing: 0, unknown: 0 } })
      const { ArgoCDHealth } = await import('./ArgoCDHealth')
      render(<ArgoCDHealth />)
      const link = screen.getByRole('link')
      expect(link).toHaveAttribute('href', 'https://argo-cd.readthedocs.io/')
    })
  })

  describe('demo data integration notice', () => {
    it('shows integration notice when isDemoData is true and total is 0', async () => {
      mockUseDemoMode.mockReturnValue({ isDemoMode: false })
      mockUseArgoCDHealth.mockReturnValue({
        ...defaultHealthData,
        isDemoData: true,
        total: 0,
        stats: { healthy: 0, degraded: 0, progressing: 0, missing: 0, unknown: 0 },
      })
      mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
      const { ArgoCDHealth } = await import('./ArgoCDHealth')
      render(<ArgoCDHealth />)
      expect(screen.getByText('argocdIntegration')).toBeInTheDocument()
    })

    it('hides integration notice when isDemoData is false', async () => {
      setupMocks({ total: 5, healthyPercent: 100, stats: { healthy: 5, degraded: 0, progressing: 0, missing: 0, unknown: 0 } })
      const { ArgoCDHealth } = await import('./ArgoCDHealth')
      render(<ArgoCDHealth />)
      expect(screen.queryByText('argocdIntegration')).not.toBeInTheDocument()
    })
  })

  describe('snapshot', () => {
    it('renders without crashing', async () => {
      setupMocks({
        total: 5,
        healthyPercent: 60,
        stats: { healthy: 3, degraded: 1, progressing: 1, missing: 0, unknown: 0 },
      })
      const { ArgoCDHealth } = await import('./ArgoCDHealth')
      const { container } = render(<ArgoCDHealth />)
      expect(container.firstChild).toBeTruthy()
    })
  })
})
