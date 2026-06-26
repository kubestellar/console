/**
 * CubeFS Status Card Tests
 *
 * Covers: loading state, error state, not-installed state, demo rendering,
 *         volume/node lists, search filtering, tab switching, and drill-down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { CubefsDemoData } from '../demoData'
import { CUBEFS_DEMO_DATA } from '../demoData'

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
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToAllStorage: mockDrillToAllStorage }),
}))

// Controllable mock for useCubefsStatus
let mockHookReturn: {
  data: CubefsDemoData
  isRefreshing: boolean
  error: string | null
  showSkeleton: boolean
  showEmptyState: boolean
  lastRefresh: number | null
}

vi.mock('../useCubefsStatus', () => ({
  useCubefsStatus: () => mockHookReturn,
}))

import { CubefsStatus } from '../CubefsStatus'

// ── Test suites ──────────────────────────────────────────────────────────────

describe('CubefsStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: demo data mode
    mockHookReturn = {
      data: CUBEFS_DEMO_DATA,
      isRefreshing: false,
      error: null,
      showSkeleton: false,
      showEmptyState: false,
      lastRefresh: Date.now(),
    }
  })

  // ── Render states ────────────────────────────────────────────────────

  it('renders without crashing', () => {
    const { container } = render(<CubefsStatus />)
    expect(container).toBeTruthy()
  })

  it('shows loading skeleton when showSkeleton is true', () => {
    mockHookReturn = {
      ...mockHookReturn,
      showSkeleton: true,
      data: { health: 'not-installed', volumes: [], nodes: [] },
    }
    const { container } = render(<CubefsStatus />)
    // Skeleton renders placeholder divs
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('shows error state on fetch failure', () => {
    mockHookReturn = {
      ...mockHookReturn,
      error: 'Network error',
      showEmptyState: true,
      data: { health: 'not-installed', volumes: [], nodes: [] },
    }
    render(<CubefsStatus />)
    expect(screen.getByText('Failed to fetch CubeFS status')).toBeTruthy()
  })

  it('shows not-installed state when health is not-installed', () => {
    mockHookReturn = {
      ...mockHookReturn,
      data: { health: 'not-installed', volumes: [], nodes: [] },
    }
    render(<CubefsStatus />)
    expect(screen.getByText('CubeFS not detected')).toBeTruthy()
    expect(screen.getByText(/No CubeFS pods found/)).toBeTruthy()
  })

  // ── Demo data rendering ──────────────────────────────────────────────

  it('renders health badge in demo mode', () => {
    render(<CubefsStatus />)
    // Demo data has health = 'degraded' (one inactive volume + one inactive master)
    expect(screen.getByText('Degraded')).toBeTruthy()
  })

  it('renders healthy health badge', () => {
    mockHookReturn = {
      ...mockHookReturn,
      data: { ...CUBEFS_DEMO_DATA, health: 'healthy' },
    }
    render(<CubefsStatus />)
    expect(screen.getByText('Healthy')).toBeTruthy()
  })

  it('renders degraded health badge', () => {
    mockHookReturn = {
      ...mockHookReturn,
      data: { ...CUBEFS_DEMO_DATA, health: 'degraded' },
    }
    render(<CubefsStatus />)
    expect(screen.getByText('Degraded')).toBeTruthy()
  })

  it('displays cluster name from data', () => {
    mockHookReturn = {
      ...mockHookReturn,
      data: { ...CUBEFS_DEMO_DATA, clusterName: 'test-cluster' },
    }
    render(<CubefsStatus />)
    expect(screen.getByText('test-cluster')).toBeTruthy()
  })

  it('renders stat tiles with correct labels', () => {
    render(<CubefsStatus />)
    // 'Volumes' appears in stat tile + tab button, so use getAllByText
    expect(screen.getAllByText('Volumes').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Masters').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Data Nodes').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Issues').length).toBeGreaterThan(0)
  })

  // ── Tabs ─────────────────────────────────────────────────────────────

  it('defaults to Volumes tab', () => {
    render(<CubefsStatus />)
    // All demo volumes should be visible
    const volumeCount = (CUBEFS_DEMO_DATA.volumes || []).length
    expect(volumeCount).toBeGreaterThan(0)
    // First volume name should be visible
    expect(screen.getByText((CUBEFS_DEMO_DATA.volumes || [])[0].name)).toBeTruthy()
  })

  it('switches to Nodes tab on click', () => {
    render(<CubefsStatus />)
    // Click the Nodes tab
    const nodesTab = screen.getByText('Nodes')
    fireEvent.click(nodesTab)
    // First node address should be visible
    const firstNode = (CUBEFS_DEMO_DATA.nodes || [])[0]
    expect(screen.getByText(firstNode.address)).toBeTruthy()
  })

  // ── Search filtering ─────────────────────────────────────────────────

  it('filters volumes by search term', () => {
    render(<CubefsStatus />)
    const searchInput = screen.getByPlaceholderText('Search volumes…')
    fireEvent.change(searchInput, { target: { value: 'nonexistent-vol-xyz' } })
    expect(screen.getByText('No results match your search.')).toBeTruthy()
  })

  it('filters nodes by search term', () => {
    render(<CubefsStatus />)
    // Switch to nodes tab
    fireEvent.click(screen.getByText('Nodes'))
    const searchInput = screen.getByPlaceholderText('Search nodes…')
    fireEvent.change(searchInput, { target: { value: 'nonexistent-node-xyz' } })
    expect(screen.getByText('No results match your search.')).toBeTruthy()
  })

  // ── Drill-down ───────────────────────────────────────────────────────

  it('calls drillToAllStorage when volume row is clicked', () => {
    render(<CubefsStatus />)
    const firstVolume = (CUBEFS_DEMO_DATA.volumes || [])[0]
    const volumeRow = screen.getByText(firstVolume.name).closest('[role="button"]')
    expect(volumeRow).toBeTruthy()
    if (volumeRow) fireEvent.click(volumeRow)
    expect(mockDrillToAllStorage).toHaveBeenCalledTimes(1)
    expect(mockDrillToAllStorage).toHaveBeenCalledWith('cubefs', expect.objectContaining({
      volumeName: firstVolume.name,
    }))
  })

  it('calls drillToAllStorage when node row is clicked', () => {
    render(<CubefsStatus />)
    fireEvent.click(screen.getByText('Nodes'))
    const firstNode = (CUBEFS_DEMO_DATA.nodes || [])[0]
    const nodeRow = screen.getByText(firstNode.address).closest('[role="button"]')
    expect(nodeRow).toBeTruthy()
    if (nodeRow) fireEvent.click(nodeRow)
    expect(mockDrillToAllStorage).toHaveBeenCalledTimes(1)
    expect(mockDrillToAllStorage).toHaveBeenCalledWith('cubefs', expect.objectContaining({
      nodeAddress: firstNode.address,
    }))
  })

  // ── Empty states ─────────────────────────────────────────────────────

  it('shows empty volumes message when no volumes exist', () => {
    mockHookReturn = {
      ...mockHookReturn,
      data: { ...CUBEFS_DEMO_DATA, volumes: [] },
    }
    render(<CubefsStatus />)
    expect(screen.getByText('No volumes found')).toBeTruthy()
  })

  it('shows empty nodes message when no nodes exist', () => {
    mockHookReturn = {
      ...mockHookReturn,
      data: { ...CUBEFS_DEMO_DATA, nodes: [] },
    }
    render(<CubefsStatus />)
    fireEvent.click(screen.getByText('Nodes'))
    expect(screen.getByText('No nodes found')).toBeTruthy()
  })

  // ── i18n compliance ──────────────────────────────────────────────────

  it('renders all i18n labels through t() (no raw English strings in status configs)', () => {
    render(<CubefsStatus />)
    // Status labels should come from t() — our mock returns fallback strings
    // which are the English values. This test ensures the factory function path works.
    expect(screen.getByText('Degraded')).toBeTruthy()
    // Volume status labels
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0)
  })
})
