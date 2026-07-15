import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — match the pattern used by sibling tests in this directory
// ---------------------------------------------------------------------------

vi.mock('../../../../../lib/demoMode', () => ({
  isDemoMode: () => false, getDemoMode: () => false, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => false, hasRealToken: () => true, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../hooks/useDemoMode')>()),
  getDemoMode: () => false, default: () => false,
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => true, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => false, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../lib/analytics')>()),
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: {
    getUsage: () => ({ total: 0, remaining: 0, used: 0 }),
    trackRequest: vi.fn(),
    getSettings: () => ({ enabled: false }),
  },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => defaultValue ?? key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const mockUseMultiTenancyOverview = vi.fn()
vi.mock('../useMultiTenancyOverview', () => ({
  useMultiTenancyOverview: () => mockUseMultiTenancyOverview(),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
  useReportCardDataState: () => {},
}))

vi.mock('../../../../lib/modals', () => ({
  useModalState: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}))

vi.mock('../MultiTenancyDetailModal', () => ({
  MultiTenancyDetailModal: () => <div data-testid="detail-modal" />,
}))

vi.mock('../shared', () => ({
  ISOLATION_STATUS_COLORS: { ready: 'text-green-400', degraded: 'text-orange-400', missing: 'text-zinc-500' },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOverviewData(overrides: Record<string, unknown> = {}) {
  return {
    components: [
      { name: 'OVN-K8s', detected: true, health: 'healthy', icon: 'network' },
      { name: 'KubeFlex', detected: true, health: 'healthy', icon: 'layers' },
      { name: 'K3s', detected: false, health: 'unknown', icon: 'box' },
      { name: 'KubeVirt', detected: true, health: 'healthy', icon: 'monitor' },
    ],
    isolationLevels: [
      { type: 'Control-plane', status: 'ready', provider: 'KubeFlex + K3s' },
      { type: 'Data-plane', status: 'ready', provider: 'KubeVirt' },
      { type: 'Network', status: 'ready', provider: 'OVN-Kubernetes' },
    ],
    tenantCount: 3,
    overallScore: 3,
    totalLevels: 3,
    isLoading: false,
    isRefreshing: false,
    consecutiveFailures: 0,
    isDemoData: false,
    isFailed: false,
    ...overrides,
  }
}

function setupMocks(opts: {
  data?: ReturnType<typeof makeOverviewData>
  showSkeleton?: boolean
  showEmptyState?: boolean
} = {}) {
  const data = opts.data ?? makeOverviewData()
  mockUseMultiTenancyOverview.mockReturnValue(data)
  mockUseCardLoadingState.mockReturnValue({
    showSkeleton: opts.showSkeleton ?? false,
    showEmptyState: opts.showEmptyState ?? false,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import { MultiTenancyOverview } from '../MultiTenancyOverview'

describe('MultiTenancyOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    setupMocks()
    const { container } = render(<MultiTenancyOverview />)
    expect(container).toBeDefined()
  })

  it('renders loading state when showSkeleton is true', () => {
    setupMocks({ showSkeleton: true })
    render(<MultiTenancyOverview />)
    expect(screen.getByText('Loading multi-tenancy overview...')).toBeInTheDocument()
  })

  it('renders empty state when showEmptyState is true and no failure', () => {
    setupMocks({
      showEmptyState: true,
      data: makeOverviewData({ components: [] }),
    })
    render(<MultiTenancyOverview />)
    expect(screen.getByText('No multi-tenancy data')).toBeInTheDocument()
  })

  it('renders error state when showEmptyState is true and isFailed', () => {
    setupMocks({
      showEmptyState: true,
      data: makeOverviewData({ components: [], isFailed: true }),
    })
    render(<MultiTenancyOverview />)
    expect(screen.getByText('Failed to load data')).toBeInTheDocument()
  })

  it('renders isolation score header', () => {
    setupMocks()
    render(<MultiTenancyOverview />)
    expect(screen.getByText('Isolation Score')).toBeInTheDocument()
  })

  it('renders overall score and total levels', () => {
    setupMocks()
    render(<MultiTenancyOverview />)
    expect(screen.getByText('3/3')).toBeInTheDocument()
  })

  it('renders tenant count', () => {
    setupMocks()
    render(<MultiTenancyOverview />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('tenants')).toBeInTheDocument()
  })

  it('renders component badges for each component', () => {
    setupMocks()
    render(<MultiTenancyOverview />)
    expect(screen.getByLabelText(/OVN-K8s:/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/KubeFlex:/i)).toBeInTheDocument()
  })

  it('renders isolation level rows', () => {
    setupMocks()
    render(<MultiTenancyOverview />)
    expect(screen.getByText('Control-plane')).toBeInTheDocument()
    expect(screen.getByText('Data-plane')).toBeInTheDocument()
    expect(screen.getByText('Network')).toBeInTheDocument()
  })

  it('renders isolation level providers', () => {
    setupMocks()
    render(<MultiTenancyOverview />)
    expect(screen.getByText('KubeFlex + K3s')).toBeInTheDocument()
    expect(screen.getByText('OVN-Kubernetes')).toBeInTheDocument()
  })

  it('renders isolation levels section header', () => {
    setupMocks()
    render(<MultiTenancyOverview />)
    expect(screen.getByText('Isolation Levels')).toBeInTheDocument()
  })

  it('passes isLoading to useCardLoadingState', () => {
    setupMocks({ data: makeOverviewData({ isLoading: true, components: [] }) })
    render(<MultiTenancyOverview />)
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({ isLoading: true }),
    )
  })

  it('passes isFailed to useCardLoadingState', () => {
    setupMocks({ data: makeOverviewData({ isFailed: true }) })
    render(<MultiTenancyOverview />)
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({ isFailed: true }),
    )
  })

  it('uses demo data when isDemoData is true', () => {
    setupMocks({ data: makeOverviewData({ isDemoData: true }) })
    render(<MultiTenancyOverview />)
    // DEMO_MULTI_TENANCY_OVERVIEW has 3 tenants
    expect(screen.getByText('tenants')).toBeInTheDocument()
  })

  it('renders the detail modal placeholder', () => {
    setupMocks()
    render(<MultiTenancyOverview />)
    expect(screen.getByTestId('detail-modal')).toBeInTheDocument()
  })
})
