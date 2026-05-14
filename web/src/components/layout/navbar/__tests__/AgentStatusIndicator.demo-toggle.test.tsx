import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockToggleDemoMode = vi.fn()
const mockHasApprovedAgents = vi.fn()
const mockAgentFetch = vi.fn()
const mockUseLocalAgent = vi.fn()
const mockUseBackendHealth = vi.fn()
const mockUseMissions = vi.fn()

let mockIsDemoMode = true
let mockIsDemoModeForced = false

vi.mock('../../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({
    isDemoMode: mockIsDemoMode,
    toggleDemoMode: mockToggleDemoMode,
    setDemoMode: vi.fn(),
  }),
  getDemoMode: () => mockIsDemoMode,
  isDemoModeForced: mockIsDemoModeForced,
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
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: ReactNode }) => children,
}))

import { AgentStatusIndicator } from '../AgentStatusIndicator'

describe('AgentStatusIndicator demo mode transition', () => {
  beforeEach(() => {
    mockIsDemoMode = true
    mockIsDemoModeForced = false
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
    mockIsDemoMode = false
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
