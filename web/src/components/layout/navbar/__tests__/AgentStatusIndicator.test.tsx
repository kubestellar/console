import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => false, getDemoMode: () => false, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => false, hasRealToken: () => true, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => false, default: () => false,
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => true, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => false, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

const mockUseLocalAgent = vi.fn(() => ({
  status: '',
  health: {},
  connectionEvents: [],
  isConnected: false,
  isDegraded: false,
  isAuthError: false,
  dataErrorCount: 0,
  lastDataError: null,
}))

vi.mock('../../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => mockUseLocalAgent(),
}))

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({ selectedAgent: vi.fn(), agents: [] }),
}))

vi.mock('../../../../hooks/useBackendHealth', () => ({
  useBackendHealth: () => ({ status: '', isConnected: false, isInClusterMode: null }),
}))

const mockUseDashboardHealth = vi.fn(() => ({
  status: 'healthy',
  message: 'All systems healthy',
  details: [],
  criticalCount: 0,
  warningCount: 0,
}))

vi.mock('../../../../hooks/useDashboardHealth', () => ({
  useDashboardHealth: () => mockUseDashboardHealth(),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: vi.fn(),
}))

import { AgentStatusIndicator } from '../AgentStatusIndicator'

describe('AgentStatusIndicator', () => {
  it('renders without crashing', () => {
    const { container } = render(<AgentStatusIndicator />)
    expect(container).toBeTruthy()
  })

  it('shows auth warning state when agent auth fails', () => {
    mockUseLocalAgent.mockReturnValueOnce({
      status: 'auth_error',
      health: { version: '1.2.3' },
      connectionEvents: [],
      isConnected: false,
      isDegraded: false,
      isAuthError: true,
      dataErrorCount: 0,
      lastDataError: null,
    })

    render(<AgentStatusIndicator />)

    expect(screen.getByTestId('navbar-agent-status-btn').getAttribute('title')).toBe('agent.authErrorTitle')
    expect(screen.getByText('agent.authError')).toBeTruthy()
  })

  it('uses dashboard health warning state for the top pill', () => {
    mockUseDashboardHealth.mockReturnValueOnce({
      status: 'warning',
      message: 'Degraded',
      details: ['Local agent degraded (3 errors)'],
      criticalCount: 0,
      warningCount: 1,
    })

    render(<AgentStatusIndicator />)

    expect(screen.getByText('Degraded')).toBeTruthy()
    expect(screen.getByTestId('navbar-agent-status-btn').getAttribute('title')).toBe('Degraded\nLocal agent degraded (3 errors)')
  })
})
