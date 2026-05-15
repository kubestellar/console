import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

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
  useMissions: () => ({ selectedAgent: 'none', agents: [] }),
}))

const mockUseBackendHealth = vi.fn(() => ({
  status: '',
  isConnected: false,
  isInClusterMode: null,
}))

vi.mock('../../../../hooks/useBackendHealth', () => ({
  useBackendHealth: () => mockUseBackendHealth(),
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
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}))

vi.mock('@/hooks/mcp/shared', () => ({
  agentFetch: vi.fn(),
  clusterCache: { clusters: [], isLoading: false, lastUpdated: null },
}))

vi.mock('../../../agent/AgentApprovalDialog', () => ({
  hasApprovedAgents: () => false,
  AgentApprovalDialog: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div>approval-dialog</div> : null,
}))

vi.mock('../../../setup/SetupInstructionsDialog', () => ({
  SetupInstructionsDialog: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div>setup-dialog</div> : null,
}))

import { AgentStatusIndicator } from '../AgentStatusIndicator'

describe('AgentStatusIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseLocalAgent.mockReturnValue({
      status: '',
      health: {},
      connectionEvents: [],
      isConnected: false,
      isDegraded: false,
      isAuthError: false,
      dataErrorCount: 0,
      lastDataError: null,
    })
    mockUseBackendHealth.mockReturnValue({
      status: '',
      isConnected: false,
      isInClusterMode: null,
    })
    mockUseDashboardHealth.mockReturnValue({
      status: 'healthy',
      message: 'All systems healthy',
      details: [],
      criticalCount: 0,
      warningCount: 0,
    })
  })

  it('renders without crashing', () => {
    const { container } = render(<AgentStatusIndicator />)
    expect(container).toBeTruthy()
  })

  it('shows auth warning details in the dropdown when agent auth fails', () => {
    mockUseLocalAgent.mockReturnValue({
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

    expect(screen.getByTestId('navbar-agent-status-btn').getAttribute('title')).toBe('agent.localAgentDisconnected')
    expect(screen.getByText('networkUtils.offline')).toBeTruthy()

    fireEvent.click(screen.getByTestId('navbar-agent-status-btn'))

    expect(screen.getByText('agent.localAgentAuthErrorLabel')).toBeTruthy()
    expect(screen.getByText('agent.authErrorDescription')).toBeTruthy()
    expect(screen.getByTestId('agent-approval-cta')).toBeTruthy()
  })

  it('shows explicit online state when the agent is connected', () => {
    mockUseLocalAgent.mockReturnValueOnce({
      status: 'connected',
      health: { version: '1.2.3' },
      connectionEvents: [],
      isConnected: true,
      isDegraded: false,
      isAuthError: false,
      dataErrorCount: 0,
      lastDataError: null,
    })
    mockUseBackendHealth.mockReturnValueOnce({
      status: 'connected',
      isConnected: true,
      isInClusterMode: null,
    })

    render(<AgentStatusIndicator />)

    expect(screen.getByText('networkUtils.online')).toBeTruthy()
    expect(screen.getByTestId('navbar-agent-status-btn').getAttribute('title')).toBe('agent.liveMode')
  })

  it('shows degraded state when backend connectivity is unhealthy', () => {
    mockUseLocalAgent.mockReturnValueOnce({
      status: 'connected',
      health: { version: '1.2.3' },
      connectionEvents: [],
      isConnected: true,
      isDegraded: false,
      isAuthError: false,
      dataErrorCount: 0,
      lastDataError: null,
    })
    mockUseBackendHealth.mockReturnValueOnce({
      status: 'disconnected',
      isConnected: false,
      isInClusterMode: null,
    })
    mockUseDashboardHealth.mockReturnValueOnce({
      status: 'warning',
      message: 'Backend unavailable',
      details: [],
      criticalCount: 1,
      warningCount: 0,
    })

    render(<AgentStatusIndicator />)

    expect(screen.getByText('Backend unavailable')).toBeTruthy()
    expect(screen.getByTestId('navbar-agent-status-btn').getAttribute('title')).toBe('agent.backendUnavailable')
  })
})
