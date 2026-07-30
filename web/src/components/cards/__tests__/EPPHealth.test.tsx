import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// -----------------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

const mockUseCachedEPPStatus = vi.fn()
vi.mock('../../../hooks/useCachedEPPStatus', () => ({
  useCachedEPPStatus: () => mockUseCachedEPPStatus(),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
  useReportCardDataState: vi.fn(),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

import { EPPHealth } from '../EPPHealth'

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function defaultSummary(overrides: Record<string, unknown> = {}) {
  return {
    health: 'healthy',
    totalEPPs: 2,
    readyEPPs: 2,
    degradedEPPs: 0,
    unavailableEPPs: 0,
    ...overrides,
  }
}

function defaultMetrics(overrides: Record<string, unknown> = {}) {
  return {
    instanceCount: 4,
    queueDepth: 12,
    latencyP50Ms: 25,
    latencyP99Ms: 180,
    errorRate: 0.002,
    ...overrides,
  }
}

function setupHook(overrides: Record<string, unknown> = {}) {
  mockUseCachedEPPStatus.mockReturnValue({
    epps: [{ id: 'e1' }, { id: 'e2' }],
    summary: defaultSummary(),
    metrics: defaultMetrics(),
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: Date.now(),
    ...overrides,
  })
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('EPPHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
    setupHook()
  })

  describe('useCardLoadingState wiring', () => {
    it('passes hasAnyData=true when epps are present', () => {
      setupHook({ epps: [{ id: 'a' }], isDemoData: false })
      render(<EPPHealth />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ hasAnyData: true }),
      )
    })

    it('passes hasAnyData=false when no epps and not demo', () => {
      setupHook({ epps: [], isDemoData: false })
      render(<EPPHealth />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ hasAnyData: false }),
      )
    })

    it('passes hasAnyData=true when no epps but isDemoData=true', () => {
      setupHook({ epps: [], isDemoData: true })
      render(<EPPHealth />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ hasAnyData: true }),
      )
    })

    it('suppresses isLoading when data is already available', () => {
      setupHook({ epps: [{ id: 'e1' }], isLoading: true })
      render(<EPPHealth />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isLoading: false }),
      )
    })

    it('reports isLoading=true when loading with no data', () => {
      setupHook({ epps: [], isLoading: true, isDemoData: false })
      render(<EPPHealth />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isLoading: true }),
      )
    })

    it('passes isFailed, consecutiveFailures, lastRefresh through', () => {
      const now = Date.now()
      setupHook({ isFailed: true, consecutiveFailures: 4, lastRefresh: now })
      render(<EPPHealth />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isFailed: true,
          consecutiveFailures: 4,
          lastRefresh: now,
        }),
      )
    })
  })

  describe('skeleton branch', () => {
    it('renders skeleton tiles when showSkeleton is true', () => {
      mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })
      render(<EPPHealth />)
      // 4 tile skeletons + 1 bottom skeleton
      expect(screen.getAllByTestId('skeleton')).toHaveLength(5)
      expect(screen.queryByText(/No EPP instances/i)).not.toBeInTheDocument()
    })
  })

  describe('empty state branch', () => {
    it('renders empty message when showEmptyState is true', () => {
      mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true })
      render(<EPPHealth />)
      expect(screen.getByText(/No EPP instances detected/i)).toBeInTheDocument()
      expect(
        screen.getByText(/Deploy the llm-d Endpoint Picker/i),
      ).toBeInTheDocument()
      expect(screen.queryByText(/Overall health/i)).not.toBeInTheDocument()
    })

    it('does not render metric tiles when showing empty state', () => {
      mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true })
      render(<EPPHealth />)
      expect(screen.queryByText('Active instances')).not.toBeInTheDocument()
      expect(screen.queryByText('Queue depth')).not.toBeInTheDocument()
    })
  })

  describe('happy path (live data)', () => {
    it('renders overall health status', () => {
      setupHook({ summary: defaultSummary({ health: 'healthy', totalEPPs: 3, readyEPPs: 3 }) })
      render(<EPPHealth />)
      expect(screen.getByText('Overall health')).toBeInTheDocument()
      expect(screen.getByText('healthy')).toBeInTheDocument()
      expect(screen.getByText('3/3 ready')).toBeInTheDocument()
    })

    it('renders instance/queue/latency metric tiles with values', () => {
      setupHook({
        metrics: defaultMetrics({
          instanceCount: 7,
          queueDepth: 42,
          latencyP50Ms: 33,
          latencyP99Ms: 250,
          errorRate: 0,
        }),
      })
      render(<EPPHealth />)
      expect(screen.getByText('Active instances')).toBeInTheDocument()
      expect(screen.getByText('7')).toBeInTheDocument()
      expect(screen.getByText('Queue depth')).toBeInTheDocument()
      expect(screen.getByText('42')).toBeInTheDocument()
      expect(screen.getByText('Latency p50')).toBeInTheDocument()
      expect(screen.getByText('33 ms')).toBeInTheDocument()
      expect(screen.getByText('Latency p99')).toBeInTheDocument()
      expect(screen.getByText('250 ms')).toBeInTheDocument()
    })

    it('does not render demo notice when not in demo mode', () => {
      setupHook({ isDemoData: false })
      render(<EPPHealth />)
      expect(screen.queryByText('Demo data')).not.toBeInTheDocument()
    })
  })

  describe('demo data branch', () => {
    it('renders demo notice when isDemoData is true', () => {
      setupHook({ isDemoData: true })
      render(<EPPHealth />)
      expect(screen.getByText('Demo data')).toBeInTheDocument()
      expect(
        screen.getByText(/Connect a cluster with llm-d/i),
      ).toBeInTheDocument()
    })

    it('still renders metric tiles alongside demo notice', () => {
      setupHook({ isDemoData: true })
      render(<EPPHealth />)
      expect(screen.getByText('Active instances')).toBeInTheDocument()
    })
  })

  describe('error rate rendering', () => {
    it('formats error rate as percentage with 2 decimal places', () => {
      setupHook({ metrics: defaultMetrics({ errorRate: 0.0234 }) })
      render(<EPPHealth />)
      expect(screen.getByText('2.34%')).toBeInTheDocument()
    })

    it('renders 0.00% when errorRate is 0', () => {
      setupHook({ metrics: defaultMetrics({ errorRate: 0 }) })
      render(<EPPHealth />)
      expect(screen.getByText('0.00%')).toBeInTheDocument()
    })

    it('applies error color when errorRate > 5%', () => {
      setupHook({ metrics: defaultMetrics({ errorRate: 0.1 }) })
      render(<EPPHealth />)
      const label = screen.getByText('10.00%')
      expect(label.className).toContain('text-status-error')
    })

    it('applies warning color when errorRate is between 1% and 5%', () => {
      setupHook({ metrics: defaultMetrics({ errorRate: 0.03 }) })
      render(<EPPHealth />)
      const label = screen.getByText('3.00%')
      expect(label.className).toContain('text-status-warning')
    })

    it('applies success color when errorRate is at or below 1%', () => {
      setupHook({ metrics: defaultMetrics({ errorRate: 0.005 }) })
      render(<EPPHealth />)
      const label = screen.getByText('0.50%')
      expect(label.className).toContain('text-status-success')
    })
  })

  describe('health status coloring', () => {
    it('shows success color for healthy', () => {
      setupHook({ summary: defaultSummary({ health: 'healthy' }) })
      render(<EPPHealth />)
      expect(screen.getByText('healthy').className).toContain('text-status-success')
    })

    it('shows warning color for degraded', () => {
      setupHook({ summary: defaultSummary({ health: 'degraded' }) })
      render(<EPPHealth />)
      expect(screen.getByText('degraded').className).toContain('text-status-warning')
    })

    it('shows error color for unavailable', () => {
      setupHook({ summary: defaultSummary({ health: 'unavailable' }) })
      render(<EPPHealth />)
      expect(screen.getByText('unavailable').className).toContain('text-status-error')
    })
  })

  describe('config prop', () => {
    it('accepts and ignores a config prop without crashing', () => {
      setupHook()
      const { container } = render(<EPPHealth config={{ foo: 'bar' }} />)
      expect(container.firstChild).toBeTruthy()
    })
  })
})
