import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const demoModeTestState = vi.hoisted(() => ({
  toggleDemoMode: vi.fn(),
  hasApprovedAgents: vi.fn(),
  agentFetch: vi.fn(),
  useLocalAgent: vi.fn(),
  useBackendHealth: vi.fn(),
  useMissions: vi.fn(),
  isDemoMode: true,
  isDemoModeForced: false,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({
    isDemoMode: demoModeTestState.isDemoMode,
    toggleDemoMode: demoModeTestState.toggleDemoMode,
    setDemoMode: vi.fn(),
  }),
  getDemoMode: () => demoModeTestState.isDemoMode,
  isDemoModeForced: demoModeTestState.isDemoModeForced,
}))

vi.mock('../../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => demoModeTestState.useLocalAgent(),
}))

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => demoModeTestState.useMissions(),
}))

vi.mock('../../../../hooks/useBackendHealth', () => ({
  useBackendHealth: () => demoModeTestState.useBackendHealth(),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}))

vi.mock('../../../agent/AgentApprovalDialog', () => ({
  hasApprovedAgents: () => demoModeTestState.hasApprovedAgents(),
  AgentApprovalDialog: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div>approval-dialog</div> : null,
}))

vi.mock('../../../setup/SetupInstructionsDialog', () => ({
  SetupInstructionsDialog: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div>setup-dialog</div> : null,
}))

vi.mock('@/hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => demoModeTestState.agentFetch(...args),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: ReactNode }) => children,
}))

import { AgentStatusIndicator } from '../AgentStatusIndicator'

describe('AgentStatusIndicator demo mode transition', () => {
  beforeEach(() => {
    demoModeTestState.isDemoMode = true
    demoModeTestState.isDemoModeForced = false
    vi.clearAllMocks()

    demoModeTestState.hasApprovedAgents.mockReturnValue(false)
    demoModeTestState.agentFetch.mockResolvedValue(new Response(JSON.stringify({ availableProviders: [] }), { status: 200 }))
    demoModeTestState.useLocalAgent.mockReturnValue({
      status: 'disconnected',
      health: null,
      connectionEvents: [],
      isConnected: false,
      isDegraded: false,
      isAuthError: false,
      dataErrorCount: 0,
      lastDataError: null,
    })
    demoModeTestState.useBackendHealth.mockReturnValue({
      status: 'disconnected',
      isConnected: false,
      isInClusterMode: false,
    })
    demoModeTestState.useMissions.mockReturnValue({ selectedAgent: 'none', agents: [] })
  })

  it('allows disabling demo mode without opening the CLI agent approval dialog', () => {
    render(<AgentStatusIndicator />)

    fireEvent.click(screen.getByTestId('navbar-agent-status-btn'))
    fireEvent.click(screen.getByTestId('demo-mode-toggle'))

    expect(demoModeTestState.toggleDemoMode).toHaveBeenCalledTimes(1)
    expect(demoModeTestState.agentFetch).not.toHaveBeenCalled()
    expect(screen.queryByText('approval-dialog')).toBeNull()
  })

  it('offers CLI agent authorization from the auth warning state instead', async () => {
    demoModeTestState.isDemoMode = false
    demoModeTestState.useLocalAgent.mockReturnValue({
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

    await waitFor(() => expect(demoModeTestState.agentFetch).toHaveBeenCalledTimes(1))
    expect(screen.getByText('approval-dialog')).toBeTruthy()
    expect(demoModeTestState.toggleDemoMode).not.toHaveBeenCalled()
  })
})
