import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MS_PER_DAY } from '../../../lib/constants/time'
import {
  CURRENT_REPO_STORAGE_KEY,
  getDemoGitHubData,
  SAVED_REPOS_STORAGE_KEY,
} from '../GitHubActivity.utils'

// Standard mocks
vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

const mockUseDemoMode = vi.fn(() => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }))
vi.mock('../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => mockUseDemoMode(),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(), markErrorReported: vi.fn(),
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    initReactI18next: { type: '3rdParty', init: () => {} },
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
    Trans: ({ children }: { children: React.ReactNode }) => children,
  }
})

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
}))

vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../pipelines/PipelineFilterContext', () => ({
  usePipelineFilter: () => null,
}))

const mockRefetch = vi.fn()
const mockUseCache = vi.fn()

vi.mock('../../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

function makeStorage(initial: Record<string, string> = {}): Storage {
  const store = { ...initial }
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length },
  } as Storage
}

function buildLoadedCacheData(overrides?: {
  prs?: ReturnType<typeof getDemoGitHubData>['prs']
  issues?: ReturnType<typeof getDemoGitHubData>['issues']
}) {
  const demo = getDemoGitHubData('kubestellar/console')
  return {
    repoInfo: demo.repoInfo,
    prs: overrides?.prs ?? demo.prs,
    issues: overrides?.issues ?? demo.issues,
    releases: demo.releases,
    contributors: demo.contributors,
    openPRCount: demo.openPRCount,
    openIssueCount: demo.openIssueCount,
  }
}

import { GitHubActivity } from '../GitHubActivity'

describe('GitHubActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('localStorage', makeStorage())
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false })
    mockUseCache.mockReturnValue({
      data: buildLoadedCacheData(),
      isLoading: false,
      isRefreshing: false,
      error: null,
      isDemoFallback: true,
      refetch: mockRefetch,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders without crashing', () => {
    const { container } = render(<GitHubActivity />)
    expect(container).toBeTruthy()
  })

  it('calls useCardLoadingState during render', () => {
    render(<GitHubActivity />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('shows loading skeleton when data is loading and repoInfo is absent', () => {
    mockUseCache.mockReturnValue({
      data: {
        repoInfo: null,
        prs: [],
        issues: [],
        releases: [],
        contributors: [],
        openPRCount: 0,
        openIssueCount: 0,
      },
      isLoading: true,
      isRefreshing: false,
      error: null,
      isDemoFallback: false,
      refetch: mockRefetch,
    })

    render(<GitHubActivity />)
    expect(screen.queryByText('cards:github.fetchError')).not.toBeInTheDocument()
    expect(screen.queryByText('cards:github.openPRs')).not.toBeInTheDocument()
    expect(screen.queryByText(/#842/)).not.toBeInTheDocument()
  })

  it('renders error banner with message and retry when fetch fails', () => {
    const fetchError = 'Failed to fetch repo: Console proxy rate limit exceeded (not GitHub).'
    mockUseCache.mockReturnValue({
      data: {
        repoInfo: null,
        prs: [],
        issues: [],
        releases: [],
        contributors: [],
        openPRCount: 0,
        openIssueCount: 0,
      },
      isLoading: false,
      isRefreshing: false,
      error: fetchError,
      isDemoFallback: false,
      refetch: mockRefetch,
    })

    render(<GitHubActivity />)

    expect(screen.getByText('cards:github.fetchError')).toBeInTheDocument()
    expect(screen.getByText(fetchError)).toBeInTheDocument()
    expect(screen.getByText('common:common.retry')).toBeInTheDocument()
    expect(screen.getByText('common:common.error')).toBeInTheDocument()
  })

  it('shows stale count in stats when open PRs are older than 14 days', () => {
    const staleUpdatedAt = new Date(Date.now() - 15 * MS_PER_DAY).toISOString()
    const demo = getDemoGitHubData('kubestellar/console')
    const stalePr = { ...demo.prs[0], state: 'open' as const, updated_at: staleUpdatedAt, merged_at: null }

    mockUseCache.mockReturnValue({
      data: buildLoadedCacheData({ prs: [stalePr, ...demo.prs.slice(1)] }),
      isLoading: false,
      isRefreshing: false,
      error: null,
      isDemoFallback: true,
      refetch: mockRefetch,
    })

    render(<GitHubActivity />)

    expect(screen.getByText('cards:github.openPRs')).toBeInTheDocument()
    expect(screen.getByText(/1\s+cards:github\.stale/)).toBeInTheDocument()
  })

  it('renders stale badge on an open PR list item older than 14 days', () => {
    const staleUpdatedAt = new Date(Date.now() - 15 * MS_PER_DAY).toISOString()
    const demo = getDemoGitHubData('kubestellar/console')
    const stalePr = {
      ...demo.prs[0],
      number: 9001,
      title: 'stale-open-pr-for-test',
      state: 'open' as const,
      updated_at: staleUpdatedAt,
      merged_at: null,
    }

    mockUseCache.mockReturnValue({
      data: buildLoadedCacheData({ prs: [stalePr] }),
      isLoading: false,
      isRefreshing: false,
      error: null,
      isDemoFallback: true,
      refetch: mockRefetch,
    })

    render(<GitHubActivity />)

    expect(screen.getByText(/#9001 stale-open-pr-for-test/)).toBeInTheDocument()
    expect(screen.getAllByText('cards:github.stale').length).toBeGreaterThanOrEqual(1)
  })

  it('opens repo editor and adds a repository via inline CRUD', async () => {
    const user = userEvent.setup()
    render(<GitHubActivity />)

    const configureButtons = screen.getAllByTitle('cards:github.configureRepo')
    await user.click(configureButtons[0])

    const input = screen.getByPlaceholderText('owner/repo (e.g., facebook/react)')
    await user.type(input, 'facebook/react')
    await user.click(screen.getByTitle('cards:githubActivity.addRepo'))

    expect(screen.getByText('facebook/react')).toBeInTheDocument()
    expect(localStorage.getItem(SAVED_REPOS_STORAGE_KEY)).toContain('facebook/react')
  })

  it('selects a different saved repo when clicking a repo chip', async () => {
    localStorage.setItem(
      SAVED_REPOS_STORAGE_KEY,
      JSON.stringify(['kubestellar/console', 'kubernetes/kubernetes']),
    )

    const user = userEvent.setup()
    render(<GitHubActivity />)

    const configureButtons = screen.getAllByTitle('cards:github.configureRepo')
    await user.click(configureButtons[0])

    await user.click(screen.getByText('kubernetes/kubernetes'))

    expect(localStorage.getItem(CURRENT_REPO_STORAGE_KEY)).toBe('kubernetes/kubernetes')
  })

  it('renders demo PR content when cache returns demo fallback data', () => {
    render(<GitHubActivity />)
    expect(screen.getByText(/#842 feat: Add multi-cluster GPU scheduling/)).toBeInTheDocument()
    expect(screen.getByText('cards:github.pullRequests')).toBeInTheDocument()
  })
})
