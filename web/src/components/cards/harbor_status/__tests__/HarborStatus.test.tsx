/**
 * Harbor Registry Status Card Tests
 *
 * Covers: loading state, error state, not-installed state, demo rendering,
 *         project/repo lists, search filtering, tab switching, and drill-down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { HarborDemoData } from '../demoData'
import { HARBOR_DEMO_DATA } from '../demoData'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockDrillToAllStorage = vi.fn()

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
  emitCardSearchUsed: vi.fn(),
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToAllStorage: mockDrillToAllStorage }),
}))

// Controllable mock for useHarborStatus
let mockHookReturn: {
  data: HarborDemoData
  isRefreshing: boolean
  error: boolean
  showSkeleton: boolean
  showEmptyState: boolean
  lastRefresh: number | null
  loading: boolean
  consecutiveFailures: number
  isDemoFallback: boolean
}

vi.mock('../useHarborStatus', () => ({
  useHarborStatus: () => mockHookReturn,
}))

import { HarborStatus } from '../HarborStatus'

// ── Test suites ──────────────────────────────────────────────────────────────

describe('HarborStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: demo data mode
    mockHookReturn = {
      data: HARBOR_DEMO_DATA,
      isRefreshing: false,
      error: false,
      showSkeleton: false,
      showEmptyState: false,
      lastRefresh: Date.now(),
      loading: false,
      consecutiveFailures: 0,
      isDemoFallback: true,
    }
  })

  // ── Render states ────────────────────────────────────────────────────

  it('renders without crashing', () => {
    const { container } = render(<HarborStatus />)
    expect(container).toBeTruthy()
  })

  it('shows loading skeleton when showSkeleton is true', () => {
    mockHookReturn = {
      ...mockHookReturn,
      showSkeleton: true,
      data: { health: 'not-installed', instanceName: '', version: '', projects: [], repositories: [], lastCheckTime: '' },
    }
    const { container } = render(<HarborStatus />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('shows error state on fetch failure', () => {
    mockHookReturn = {
      ...mockHookReturn,
      error: true,
      showEmptyState: true,
      data: { health: 'not-installed', instanceName: '', version: '', projects: [], repositories: [], lastCheckTime: '' },
    }
    render(<HarborStatus />)
    expect(screen.getByText('Failed to fetch Harbor status')).toBeTruthy()
  })

  it('shows not-installed state when health is not-installed', () => {
    mockHookReturn = {
      ...mockHookReturn,
      data: { health: 'not-installed', instanceName: '', version: '', projects: [], repositories: [], lastCheckTime: '' },
      showEmptyState: true
    }
    render(<HarborStatus />)
    expect(screen.getByText('Harbor not detected')).toBeTruthy()
  })

  // ── Demo data rendering ──────────────────────────────────────────────

  it('renders health badge in demo mode', () => {
    render(<HarborStatus />)
    expect(screen.getByText('Degraded')).toBeTruthy()
  })

  it('renders healthy health badge', () => {
    mockHookReturn = {
      ...mockHookReturn,
      data: { ...HARBOR_DEMO_DATA, health: 'healthy' },
    }
    render(<HarborStatus />)
    expect(screen.getByText('Healthy')).toBeTruthy()
  })

  it('renders stat tiles with correct labels', () => {
    render(<HarborStatus />)
    expect(screen.getAllByText('Projects').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Repositories').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Scans').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Vulnerabilities').length).toBeGreaterThan(0)
  })

  // ── Tabs ─────────────────────────────────────────────────────────────

  it('defaults to Projects tab', () => {
    render(<HarborStatus />)
    const projectCount = (HARBOR_DEMO_DATA.projects || []).length
    expect(projectCount).toBeGreaterThan(0)
    expect(screen.getByText((HARBOR_DEMO_DATA.projects || [])[0].name)).toBeTruthy()
  })

  it('switches to Repositories tab on click', () => {
    render(<HarborStatus />)
    const reposTab = screen.getAllByText('Repositories')[1]
    fireEvent.click(reposTab)
    const firstRepo = (HARBOR_DEMO_DATA.repositories || [])[0]
    const parts = firstRepo.name.split('/')
    const repoName = parts[1]
    expect(screen.getByText(repoName)).toBeTruthy()
  })

  // ── Search filtering ─────────────────────────────────────────────────

  it('filters projects by search term', () => {
    render(<HarborStatus />)
    const searchInput = screen.getByPlaceholderText('Search projects…')
    fireEvent.change(searchInput, { target: { value: 'nonexistent-project-xyz' } })
    expect(screen.getByText('No results match your search.')).toBeTruthy()
  })

  it('filters repositories by search term', () => {
    render(<HarborStatus />)
    fireEvent.click(screen.getAllByText('Repositories')[1])
    const searchInput = screen.getByPlaceholderText('Search repositories…')
    fireEvent.change(searchInput, { target: { value: 'nonexistent-repo-xyz' } })
    expect(screen.getByText('No results match your search.')).toBeTruthy()
  })

  // ── Drill-down ───────────────────────────────────────────────────────

  it('calls drillToAllStorage when project row is clicked', () => {
    render(<HarborStatus />)
    const firstProject = (HARBOR_DEMO_DATA.projects || [])[0]
    const projectRow = screen.getByText(firstProject.name).closest('[role="button"]')
    expect(projectRow).toBeTruthy()
    if (projectRow) fireEvent.click(projectRow)
    expect(mockDrillToAllStorage).toHaveBeenCalledTimes(1)
    expect(mockDrillToAllStorage).toHaveBeenCalledWith('registry', expect.objectContaining({
      projectName: firstProject.name,
    }))
  })

  it('calls drillToAllStorage when repository row is clicked', () => {
    render(<HarborStatus />)
    fireEvent.click(screen.getAllByText('Repositories')[1])
    const firstRepo = (HARBOR_DEMO_DATA.repositories || [])[0]
    const parts = firstRepo.name.split('/')
    const repoName = parts[1]
    const repoRow = screen.getByText(repoName).closest('[role="button"]')
    expect(repoRow).toBeTruthy()
    if (repoRow) fireEvent.click(repoRow)
    expect(mockDrillToAllStorage).toHaveBeenCalledTimes(1)
    expect(mockDrillToAllStorage).toHaveBeenCalledWith('registry', expect.objectContaining({
      repoName: firstRepo.name,
    }))
  })

  // ── Empty states ─────────────────────────────────────────────────────

  it('shows empty projects message when no projects exist', () => {
    mockHookReturn = {
      ...mockHookReturn,
      data: { ...HARBOR_DEMO_DATA, projects: [] },
    }
    render(<HarborStatus />)
    expect(screen.getByText('No projects found')).toBeTruthy()
  })

  it('shows empty repositories message when no repos exist', () => {
    mockHookReturn = {
      ...mockHookReturn,
      data: { ...HARBOR_DEMO_DATA, repositories: [] },
    }
    render(<HarborStatus />)
    fireEvent.click(screen.getAllByText('Repositories')[1])
    expect(screen.getByText('No repositories found')).toBeTruthy()
  })
})
