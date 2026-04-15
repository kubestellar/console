import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Module mocks (must be before any imports that pull these in transitively)
// ---------------------------------------------------------------------------

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true,
  getDemoMode: () => true,
  isNetlifyDeployment: false,
  isDemoModeForced: false,
  canToggleDemoMode: () => true,
  setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(),
  subscribeDemoMode: () => () => {},
  isDemoToken: () => true,
  hasRealToken: () => false,
  setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true,
  default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false,
  isDemoModeForced: false,
  isNetlifyDeployment: false,
  canToggleDemoMode: () => true,
  isDemoToken: () => true,
  setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(),
  emitLogin: vi.fn(),
  emitEvent: vi.fn(),
  analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(),
  emitCardExpanded: vi.fn(),
  emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: {
    getUsage: () => ({ total: 0, remaining: 0, used: 0 }),
    trackRequest: vi.fn(),
    getSettings: () => ({ enabled: false }),
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { KeycloakStatus } from '../KeycloakStatus'
import { KEYCLOAK_DEMO_DATA } from '../demoData'

// ---------------------------------------------------------------------------
// Mock the data hook so we control rendered state
// ---------------------------------------------------------------------------

vi.mock('../useKeycloakStatus', () => ({
  useKeycloakStatus: vi.fn(),
}))

import { useKeycloakStatus } from '../useKeycloakStatus'

const INITIAL_DATA = {
  health: 'not-installed' as const,
  operatorPods: { ready: 0, total: 0 },
  realms: [],
  totalClients: 0,
  totalUsers: 0,
  totalActiveSessions: 0,
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Factory for the canonical hook return shape, per CLAUDE.md Caching Contract.
// Individual tests override only the fields they care about.
function makeHookResult(overrides: Partial<ReturnType<typeof useKeycloakStatus>>) {
  return {
    data: INITIAL_DATA,
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(async () => {}),
    showSkeleton: false,
    showEmptyState: false,
    ...overrides,
  } as ReturnType<typeof useKeycloakStatus>
}

describe('KeycloakStatus', () => {
  it('renders skeleton while loading', () => {
    vi.mocked(useKeycloakStatus).mockReturnValue(
      makeHookResult({ isLoading: true, showSkeleton: true }),
    )
    const { container } = render(<KeycloakStatus />)
    // Skeleton renders pulsing divs, not realm rows
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('renders not-installed state when Keycloak is absent', () => {
    vi.mocked(useKeycloakStatus).mockReturnValue(makeHookResult({}))
    render(<KeycloakStatus />)
    expect(screen.getByText('keycloak.notInstalled')).toBeTruthy()
  })

  it('renders error state when fetch fails and there is no data', () => {
    vi.mocked(useKeycloakStatus).mockReturnValue(
      makeHookResult({
        isFailed: true,
        consecutiveFailures: 3,
        showEmptyState: true,
      }),
    )
    render(<KeycloakStatus />)
    expect(screen.getByText('keycloak.fetchError')).toBeTruthy()
  })

  it('renders live data with health badge and realm list', () => {
    vi.mocked(useKeycloakStatus).mockReturnValue(
      makeHookResult({ data: KEYCLOAK_DEMO_DATA }),
    )
    render(<KeycloakStatus />)
    // Health badge — "degraded" also appears on the staging realm row, so use getAllByText
    expect(screen.getAllByText('keycloak.degraded').length).toBeGreaterThanOrEqual(1)
    // All five demo realms are visible
    expect(screen.getByText('master')).toBeTruthy()
    expect(screen.getByText('platform')).toBeTruthy()
    expect(screen.getByText('staging')).toBeTruthy()
    expect(screen.getByText('dev-sandbox')).toBeTruthy()
    expect(screen.getByText('legacy-sso')).toBeTruthy()
  })

  it('renders without crashing', () => {
    vi.mocked(useKeycloakStatus).mockReturnValue(
      makeHookResult({ data: KEYCLOAK_DEMO_DATA }),
    )
    const { container } = render(<KeycloakStatus />)
    expect(container).toBeTruthy()
  })
})
