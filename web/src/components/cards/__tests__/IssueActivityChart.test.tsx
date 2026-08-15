import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IssueActivityChart } from '../IssueActivityChart'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}))

const mockUseDemoMode = vi.fn(() => ({ isDemoMode: false }))
vi.mock('../../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useDemoMode')>()),
  useDemoMode: () => mockUseDemoMode(),
}))

const mockUseCache = vi.fn()
vi.mock('../../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
}))

vi.mock('./pipelines/PipelineFilterContext', () => ({
  usePipelineFilter: () => ({
    repo: null, setRepo: vi.fn(), org: null, setOrg: vi.fn(),
    branch: null, setBranch: vi.fn(),
  }),
}))

vi.mock('./pipelines/RepoSubtitle', () => ({
  RepoSubtitle: () => <div data-testid="repo-subtitle" />,
}))

vi.mock('../charts/LazyEChart', () => ({
  LazyEChart: React.forwardRef((_props: unknown, _ref: unknown) => <div data-testid="echart" />),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('../ui/Button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    <button onClick={onClick}>{children}</button>,
}))

vi.mock('../../lib/theme/chartColors', () => ({
  hexToRgba: (hex: string, alpha: number) => `rgba(${hex},${alpha})`,
}))

vi.mock('../../lib/constants', () => ({
  GITHUB_TOKEN_KEY: 'github_token',
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDailyStats(overrides = {}) {
  return {
    date: '2026-01-01',
    issuesOpened: 2,
    issuesClosed: 1,
    prsMerged: 0,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('IssueActivityChart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
    mockUseCache.mockReturnValue({
      data: null,
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      isFailed: false,
      consecutiveFailures: 0,
      error: null,
    })
  })

  it('renders without crashing', () => {
    const { container } = render(<IssueActivityChart />)
    expect(container).toBeTruthy()
  })

  it('calls useCardLoadingState during render', () => {
    render(<IssueActivityChart />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('renders chart element when data is available', () => {
    mockUseCache.mockReturnValue({
      data: [makeDailyStats(), makeDailyStats({ date: '2026-01-02', issuesOpened: 3 })],
      isLoading: false, isRefreshing: false, isDemoFallback: false,
      isFailed: false, consecutiveFailures: 0, error: null,
    })
    render(<IssueActivityChart />)
    expect(screen.getByTestId('echart')).toBeTruthy()
  })

  it('renders stat tiles (Opened, Closed, Merged)', () => {
    mockUseCache.mockReturnValue({
      data: [makeDailyStats({ issuesOpened: 5, issuesClosed: 3, prsMerged: 2 })],
      isLoading: false, isRefreshing: false, isDemoFallback: false,
      isFailed: false, consecutiveFailures: 0, error: null,
    })
    render(<IssueActivityChart />)
    expect(screen.getByText('Opened')).toBeTruthy()
    expect(screen.getByText('Closed')).toBeTruthy()
    expect(screen.getByText('Merged')).toBeTruthy()
  })

  it('renders in demo mode without crashing', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    mockUseCache.mockReturnValue({
      data: null, isLoading: false, isRefreshing: false,
      isDemoFallback: true, isFailed: false, consecutiveFailures: 0, error: null,
    })
    const { container } = render(<IssueActivityChart />)
    expect(container).toBeTruthy()
  })

  it('passes config prop without crashing', () => {
    const { container } = render(<IssueActivityChart config={{ org: 'myorg', repo: 'myrepo' }} />)
    expect(container).toBeTruthy()
  })
})
