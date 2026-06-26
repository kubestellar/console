import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const {
  demoModeState,
  mockToggleDemoMode,
  mockHasApprovedAgents,
  mockAgentFetch,
  mockUseLocalAgent,
  mockUseBackendHealth,
  mockUseDashboardHealth,
  mockUseMissions,
} = vi.hoisted(() => ({
  demoModeState: {
    isDemoMode: true,
    isDemoModeForced: false,
  },
  mockToggleDemoMode: vi.fn(),
  mockHasApprovedAgents: vi.fn(),
  mockAgentFetch: vi.fn(),
  mockUseLocalAgent: vi.fn(),
  mockUseBackendHealth: vi.fn(),
  mockUseDashboardHealth: vi.fn(),
  mockUseMissions: vi.fn(),
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({
    isDemoMode: demoModeState.isDemoMode,
    toggleDemoMode: mockToggleDemoMode,
    setDemoMode: vi.fn(),
  }),
  getDemoMode: () => demoModeState.isDemoMode,
  isDemoModeForced: demoModeState.isDemoModeForced,
}))

vi.mock('../../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => mockUseLocalAgent(),
}))

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => mockUseMissions(),
}))

vi.mock('../../../../hooks/useBackendHealth', () => ({
  useBackendHealth: () => mockUseBackendHealth(),
}))

vi.mock('../../../../hooks/useDashboardHealth', () => ({
  useDashboardHealth: () => mockUseDashboardHealth(),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}))

vi.mock('../../../agent/AgentApprovalDialog', () => ({
  hasApprovedAgents: () => mockHasApprovedAgents(),
  AgentApprovalDialog: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div>approval-dialog</div> : null,
}))

vi.mock('../../../setup/SetupInstructionsDialog', () => ({
  SetupInstructionsDialog: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div>setup-dialog</div> : null,
}))

vi.mock('@/hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
  clusterCache: { clusters: [], isLoading: false, lastUpdated: null },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: ReactNode }) => children,
}))

import { AgentStatusIndicator } from '../AgentStatusIndicator'

describe('AgentStatusIndicator demo mode transition', () => {
  beforeEach(() => {
    demoModeState.isDemoMode = true
    demoModeState.isDemoModeForced = false
    vi.clearAllMocks()

    mockHasApprovedAgents.mockReturnValue(false)
    mockAgentFetch.mockResolvedValue(new Response(JSON.stringify({ availableProviders: [] }), { status: 200 }))
    mockUseLocalAgent.mockReturnValue({
      status: 'disconnected',
      health: null,
      connectionEvents: [],
      isConnected: false,
      isDegraded: false,
      isAuthError: false,
      dataErrorCount: 0,
      lastDataError: null,
    })
    mockUseBackendHealth.mockReturnValue({
      status: 'disconnected',
      isConnected: false,
      isInClusterMode: false,
    })
    mockUseDashboardHealth.mockReturnValue({
      status: 'healthy',
      message: 'All systems healthy',
      details: [],
      criticalCount: 0,
      warningCount: 0,
    })
    mockUseMissions.mockReturnValue({ selectedAgent: 'none', agents: [] })
  })

  it('allows disabling demo mode without opening the CLI agent approval dialog', () => {
    render(<AgentStatusIndicator />)

    fireEvent.click(screen.getByTestId('navbar-agent-status-btn'))
    fireEvent.click(screen.getByTestId('demo-mode-toggle'))

    expect(mockToggleDemoMode).toHaveBeenCalledTimes(1)
    expect(mockAgentFetch).not.toHaveBeenCalled()
    expect(screen.queryByText('approval-dialog')).toBeNull()
  })

  it('offers CLI agent authorization from the auth warning state instead', async () => {
    demoModeState.isDemoMode = false
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

    fireEvent.click(screen.getByTestId('navbar-agent-status-btn'))
    fireEvent.click(screen.getByTestId('agent-approval-cta'))

    await waitFor(() => expect(mockAgentFetch).toHaveBeenCalledTimes(1))
    expect(screen.getByText('approval-dialog')).toBeTruthy()
    expect(mockToggleDemoMode).not.toHaveBeenCalled()
  })
})
