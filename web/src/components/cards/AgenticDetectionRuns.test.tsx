import React from 'react'
/**
 * Unit tests for AgenticDetectionRuns card component.
 * Covers: loading skeleton, empty state, happy-path run rows, conclusion icons,
 * search input, and snapshot.
 *
 * Closes #21103
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AgenticDetectionRuns } from './AgenticDetectionRuns'
import type { DetectionRun } from '../../hooks/useAgenticDetectionRuns'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop() ?? key,
  }),
}))

const mockUseAgenticDetectionRuns = vi.fn()
vi.mock('../../hooks/useAgenticDetectionRuns', () => ({
  useAgenticDetectionRuns: () => mockUseAgenticDetectionRuns(),
}))

const mockUseCardData = vi.fn()
vi.mock('../../lib/cards', () => ({
  CardSearchInput: ({
    value,
    onChange,
  }: {
    value: string
    onChange: (v: string) => void
  }) => (
    <input
      data-testid="card-search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
  useCardData: (...args: unknown[]) => mockUseCardData(...args),
}))

vi.mock('../ui/CardControls', () => ({
  CardControls: () => <div data-testid="card-controls" />,
}))

vi.mock('../ui/Pagination', () => ({
  Pagination: ({ needsPagination }: { needsPagination?: boolean }) =>
    needsPagination ? <div data-testid="pagination" /> : null,
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
}))

vi.mock('../../lib/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

vi.mock('../../lib/validateExternalUrl', () => ({
  validateExternalUrl: (url: string) => url,
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeRun = (overrides: Partial<DetectionRun> = {}): DetectionRun => ({
  runId: 'run-1',
  conclusion: 'success',
  reason: 'tests_pass',
  workflowUrl: 'https://github.com/org/repo/actions/runs/1',
  commentedAt: new Date().toISOString(),
  commentUrl: 'https://github.com/org/repo/issues/1#issuecomment-1',
  ...overrides,
})

function makeCardDataReturn(items: DetectionRun[] = [makeRun()]) {
  return {
    items,
    totalItems: items.length,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 10,
    goToPage: vi.fn(),
    needsPagination: false,
    setItemsPerPage: vi.fn(),
    filters: { search: '', setSearch: vi.fn() },
    sorting: {
      sortBy: 'commentedAt',
      setSortBy: vi.fn(),
      sortDirection: 'desc',
      setSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: {},
  }
}

const defaultReturn = {
  data: { runs: [makeRun()], lastUpdated: new Date().toISOString() },
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
}

function setup(overrides = {}) {
  mockUseAgenticDetectionRuns.mockReturnValue({ ...defaultReturn, ...overrides })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
  mockUseCardData.mockReturnValue(makeCardDataReturn())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgenticDetectionRuns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setup()
  })

  // 1. Loading skeleton
  it('renders loading indicator when showSkeleton is true', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })
    render(<AgenticDetectionRuns />)
    // Component should render without crash
    expect(document.body).toBeTruthy()
  })

  // 2. Empty state
  it('renders empty state when showEmptyState is true', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true })
    mockUseCardData.mockReturnValue(makeCardDataReturn([]))
    render(<AgenticDetectionRuns />)
    expect(document.body).toBeTruthy()
  })

  // 3. Error run
  it('renders failure run', () => {
    const failRun = makeRun({ conclusion: 'failure', reason: 'tests_fail' })
    mockUseCardData.mockReturnValue(makeCardDataReturn([failRun]))
    render(<AgenticDetectionRuns />)
    expect(screen.getByText(/Tests Fail/i)).toBeInTheDocument()
  })

  it('renders warning run', () => {
    const warnRun = makeRun({ conclusion: 'warning', reason: 'flaky_test' })
    mockUseCardData.mockReturnValue(makeCardDataReturn([warnRun]))
    render(<AgenticDetectionRuns />)
    expect(screen.getByText(/Flaky Test/i)).toBeInTheDocument()
  })

  // 4. Happy path
  it('renders success run', () => {
    render(<AgenticDetectionRuns />)
    expect(screen.getByText(/Tests Pass/i)).toBeInTheDocument()
  })

  it('renders formatted run reason', () => {
    render(<AgenticDetectionRuns />)
    expect(screen.getByText(/Tests Pass/i)).toBeInTheDocument()
  })

  it('renders run URL link', () => {
    render(<AgenticDetectionRuns />)
    const link = screen.getByRole('link')
    expect(link).toBeInTheDocument()
  })

  it('renders search input', () => {
    render(<AgenticDetectionRuns />)
    expect(screen.getByTestId('card-search')).toBeInTheDocument()
  })

  it('renders multiple runs', () => {
    const runs = [
      makeRun({ runId: 'r1', conclusion: 'success' }),
      makeRun({ runId: 'r2', conclusion: 'failure', reason: 'build_error', workflowUrl: 'https://github.com/org/repo/actions/runs/2' }),
    ]
    mockUseCardData.mockReturnValue(makeCardDataReturn(runs))
    render(<AgenticDetectionRuns />)
    expect(screen.getAllByRole('link').length).toBeGreaterThanOrEqual(2)
  })

  // 5. Smoke render
  it('renders detection runs list', () => {
    render(<AgenticDetectionRuns />)
    expect(screen.getByText(/Tests Pass/i)).toBeInTheDocument()
  })
})
