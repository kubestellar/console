/**
 * DrasiPipelineHealth card — Vitest RTL tests (Part of #21103 / #21094).
 *
 * Covers: render, loading skeleton, failed/error state, overall health banner,
 * per-pipeline health breakdown, uptime display, and demo-data notice.
 *
 * Run from web/:
 *   npx vitest run src/components/cards/__tests__/DrasiPipelineHealth.test.tsx
 */
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

const mockUseCachedDrasiHealth = vi.fn()
vi.mock('../../../hooks/useCachedDrasiHealth', () => ({
  useCachedDrasiHealth: () => mockUseCachedDrasiHealth(),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
  useReportCardDataState: vi.fn(),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: ({ height, className }: { height?: number; className?: string }) => (
    <div data-testid="skeleton" style={{ height }} className={className} />
  ),
}))

import { DrasiPipelineHealth } from '../DrasiPipelineHealth'

function makePipelineEntry(overrides = {}) {
  return {
    pipelineName: 'test-pipeline',
    health: 'healthy' as const,
    uptimePct: 99.5,
    sourcesHealthy: 2,
    sourcesTotal: 2,
    queriesHealthy: 3,
    queriesTotal: 3,
    reactionsHealthy: 1,
    reactionsTotal: 1,
    ...overrides,
  }
}

function makeHealthSummary(overrides = {}) {
  return {
    overallHealth: 'healthy' as const,
    pipelines: [makePipelineEntry()],
    healthySources: 2,
    totalSources: 2,
    healthyQueries: 3,
    totalQueries: 3,
    healthyReactions: 1,
    totalReactions: 1,
    ...overrides,
  }
}

function makeDefaultHookResult(overrides = {}) {
  return {
    data: makeHealthSummary(),
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    isFailed: false,
    consecutiveFailures: 0,
    error: null,
    lastRefresh: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

describe('DrasiPipelineHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCachedDrasiHealth.mockReturnValue(makeDefaultHookResult())
  })

  describe('loading state', () => {
    it('renders skeletons when loading with no data', () => {
      mockUseCachedDrasiHealth.mockReturnValue(
        makeDefaultHookResult({ isLoading: true, data: null }),
      )
      render(<DrasiPipelineHealth />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    })
  })

  describe('error state', () => {
    it('renders error message and retry button when failed with no pipelines', async () => {
      const refetch = vi.fn()
      mockUseCachedDrasiHealth.mockReturnValue(
        makeDefaultHookResult({
          isFailed: true,
          data: null,
          refetch,
        }),
      )
      render(<DrasiPipelineHealth />)
      expect(screen.getByText('Failed to load pipeline health')).toBeInTheDocument()

      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: /retry loading pipeline health/i }))
      expect(refetch).toHaveBeenCalledOnce()
    })
  })

  describe('overall health banner', () => {
    it.each([
      ['healthy' as const, 'Healthy'],
      ['degraded' as const, 'Degraded'],
      ['down' as const, 'Down'],
    ])('shows %s overall health label', (health, label) => {
      mockUseCachedDrasiHealth.mockReturnValue(
        makeDefaultHookResult({
          data: makeHealthSummary({ overallHealth: health }),
        }),
      )
      render(<DrasiPipelineHealth />)
      expect(screen.getByText(label)).toBeInTheDocument()
    })

    it('renders source/query/reaction totals in summary line', () => {
      mockUseCachedDrasiHealth.mockReturnValue(
        makeDefaultHookResult({
          data: makeHealthSummary({
            healthySources: 3,
            totalSources: 4,
            healthyQueries: 5,
            totalQueries: 6,
            healthyReactions: 1,
            totalReactions: 2,
          }),
        }),
      )
      render(<DrasiPipelineHealth />)
      expect(screen.getByText(/3\/4 sources/)).toBeInTheDocument()
    })
  })

  describe('per-pipeline breakdown', () => {
    it('renders pipeline names for each entry', () => {
      mockUseCachedDrasiHealth.mockReturnValue(
        makeDefaultHookResult({
          data: makeHealthSummary({
            pipelines: [
              makePipelineEntry({ pipelineName: 'alpha-pipeline', health: 'healthy' }),
              makePipelineEntry({ pipelineName: 'beta-pipeline', health: 'degraded' }),
            ],
          }),
        }),
      )
      render(<DrasiPipelineHealth />)
      expect(screen.getByText('alpha-pipeline')).toBeInTheDocument()
      expect(screen.getByText('beta-pipeline')).toBeInTheDocument()
    })

    it('renders uptime percentage for each pipeline', () => {
      mockUseCachedDrasiHealth.mockReturnValue(
        makeDefaultHookResult({
          data: makeHealthSummary({
            pipelines: [
              makePipelineEntry({ pipelineName: 'p1', uptimePct: 98.7 }),
            ],
          }),
        }),
      )
      render(<DrasiPipelineHealth />)
      expect(screen.getByText(/98\.7%\s*uptime/)).toBeInTheDocument()
    })

    it('renders Sources, Queries, and Reactions health ratio labels', () => {
      mockUseCachedDrasiHealth.mockReturnValue(
        makeDefaultHookResult({
          data: makeHealthSummary({
            pipelines: [makePipelineEntry()],
          }),
        }),
      )
      render(<DrasiPipelineHealth />)
      expect(screen.getByText('Sources')).toBeInTheDocument()
      expect(screen.getByText('Queries')).toBeInTheDocument()
      expect(screen.getByText('Reactions')).toBeInTheDocument()
    })
  })

  describe('demo data banner', () => {
    it('shows demo data notice when isDemoData is true', () => {
      mockUseCachedDrasiHealth.mockReturnValue(
        makeDefaultHookResult({ isDemoData: true }),
      )
      render(<DrasiPipelineHealth />)
      expect(screen.getByText('Demo Data')).toBeInTheDocument()
    })

    it('hides demo data notice for live data', () => {
      mockUseCachedDrasiHealth.mockReturnValue(
        makeDefaultHookResult({ isDemoData: false }),
      )
      render(<DrasiPipelineHealth />)
      expect(screen.queryByText('Demo Data')).not.toBeInTheDocument()
    })
  })

  describe('aria accessibility', () => {
    it('renders with accessible region label', () => {
      render(<DrasiPipelineHealth />)
      expect(
        screen.getByRole('region', { name: 'Drasi Pipeline Health' }),
      ).toBeInTheDocument()
    })
  })
})
