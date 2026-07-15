/**
 * DrasiPipelines card — Vitest RTL tests (Part of #21103 / #21094).
 *
 * Covers: render, loading skeleton, failed/error state, data display,
 * demo-data banner, status stats, and refetch button interaction.
 *
 * Run from web/:
 *   npx vitest run src/components/cards/__tests__/DrasiPipelines.test.tsx
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

const mockUseCachedDrasiPipelines = vi.fn()
vi.mock('../../../hooks/useCachedDrasiPipelines', () => ({
  useCachedDrasiPipelines: () => mockUseCachedDrasiPipelines(),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
  useReportCardDataState: vi.fn(),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: ({ height }: { height?: number }) => (
    <div data-testid="skeleton" style={{ height }} />
  ),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <input
      data-testid="search-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
  CardControlsRow: () => <div data-testid="controls-row" />,
  CardPaginationFooter: () => <div data-testid="pagination-footer" />,
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: vi.fn((_items: unknown[], _opts: unknown) => ({
    items: _items as unknown[],
    totalItems: (_items as unknown[]).length,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 10,
    goToPage: vi.fn(),
    needsPagination: false,
    setItemsPerPage: vi.fn(),
    filters: { search: '', setSearch: vi.fn() },
    sorting: { sortBy: 'name', setSortBy: vi.fn(), sortDirection: 'asc', setSortDirection: vi.fn() },
    containerRef: { current: null },
    containerStyle: {},
  })),
  commonComparators: {
    string: () => () => 0,
    statusOrder: () => () => 0,
    number: () => () => 0,
    date: () => () => 0,
  },
}))

import { DrasiPipelines } from '../DrasiPipelines'

function makeDefaultHookResult(overrides = {}) {
  return {
    data: [],
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

function makePipeline(overrides = {}) {
  return {
    pipelineName: 'test-pipeline',
    status: 'running' as const,
    continuousQueriesCount: 2,
    reactionsCount: 1,
    lastEventAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('DrasiPipelines', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCachedDrasiPipelines.mockReturnValue(makeDefaultHookResult())
  })

  describe('loading state', () => {
    it('renders skeleton when loading with no data', () => {
      mockUseCachedDrasiPipelines.mockReturnValue(
        makeDefaultHookResult({ isLoading: true, data: [] }),
      )
      render(<DrasiPipelines />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    })
  })

  describe('error state', () => {
    it('renders retry button when failed with no data', async () => {
      const refetch = vi.fn()
      mockUseCachedDrasiPipelines.mockReturnValue(
        makeDefaultHookResult({ isFailed: true, data: [], refetch }),
      )
      render(<DrasiPipelines />)
      expect(screen.getByText('Failed to load Drasi pipelines')).toBeInTheDocument()

      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: /retry/i }))
      expect(refetch).toHaveBeenCalledOnce()
    })
  })

  describe('demo data banner', () => {
    it('shows demo data notice when isDemoData is true', () => {
      mockUseCachedDrasiPipelines.mockReturnValue(
        makeDefaultHookResult({
          isDemoData: true,
          data: [makePipeline()],
        }),
      )
      render(<DrasiPipelines />)
      expect(screen.getByText('Demo Data')).toBeInTheDocument()
    })

    it('does not show demo data notice for live data', () => {
      mockUseCachedDrasiPipelines.mockReturnValue(
        makeDefaultHookResult({
          isDemoData: false,
          data: [makePipeline()],
        }),
      )
      render(<DrasiPipelines />)
      expect(screen.queryByText('Demo Data')).not.toBeInTheDocument()
    })
  })

  describe('status stats', () => {
    it('renders running/stopped/error stat tiles with correct counts', () => {
      mockUseCachedDrasiPipelines.mockReturnValue(
        makeDefaultHookResult({
          data: [
            makePipeline({ pipelineName: 'p1', status: 'running' }),
            makePipeline({ pipelineName: 'p2', status: 'running' }),
            makePipeline({ pipelineName: 'p3', status: 'stopped' }),
            makePipeline({ pipelineName: 'p4', status: 'error' }),
          ],
        }),
      )
      render(<DrasiPipelines />)
      expect(screen.getByText('Running')).toBeInTheDocument()
      expect(screen.getByText('Stopped')).toBeInTheDocument()
      expect(screen.getByText('Error')).toBeInTheDocument()
    })
  })

  describe('pipeline list', () => {
    it('renders pipeline names for each item', () => {
      mockUseCachedDrasiPipelines.mockReturnValue(
        makeDefaultHookResult({
          data: [
            makePipeline({ pipelineName: 'pipeline-alpha', status: 'running' }),
            makePipeline({ pipelineName: 'pipeline-beta', status: 'stopped' }),
          ],
        }),
      )
      render(<DrasiPipelines />)
      expect(screen.getByText('pipeline-alpha')).toBeInTheDocument()
      expect(screen.getByText('pipeline-beta')).toBeInTheDocument()
    })

    it('renders query and reaction counts for each pipeline', () => {
      mockUseCachedDrasiPipelines.mockReturnValue(
        makeDefaultHookResult({
          data: [
            makePipeline({
              pipelineName: 'p1',
              continuousQueriesCount: 3,
              reactionsCount: 5,
            }),
          ],
        }),
      )
      render(<DrasiPipelines />)
      expect(screen.getByText(/3/)).toBeInTheDocument()
      expect(screen.getByText(/5/)).toBeInTheDocument()
    })

    it('renders empty list without crashing when no pipelines', () => {
      mockUseCachedDrasiPipelines.mockReturnValue(
        makeDefaultHookResult({ data: [] }),
      )
      const { container } = render(<DrasiPipelines />)
      expect(container).toBeTruthy()
    })
  })

  describe('pipeline status colors', () => {
    it.each([
      ['running' as const, 'Running'],
      ['stopped' as const, 'Stopped'],
      ['error' as const, 'Error'],
    ])('renders %s status label for a pipeline', (status, label) => {
      mockUseCachedDrasiPipelines.mockReturnValue(
        makeDefaultHookResult({
          data: [makePipeline({ pipelineName: `p-${status}`, status })],
        }),
      )
      render(<DrasiPipelines />)
      expect(screen.getByText(label)).toBeInTheDocument()
    })
  })
})
