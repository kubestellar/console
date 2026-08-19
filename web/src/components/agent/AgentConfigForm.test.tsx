import React from 'react'
/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const startConnection = vi.fn()
const retry = vi.fn()
const resetConnection = vi.fn()
const dismissConnection = vi.fn()
const toggleDropdown = vi.fn()
const closeDropdown = vi.fn()
let isOpen = false
let hasApproved = true

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../hooks/useProviderConnection', () => ({
  useProviderConnection: () => ({
    connectionState: { phase: 'idle' },
    startConnection,
    retry,
    reset: resetConnection,
    dismiss: dismissConnection,
  }),
}))

vi.mock('./useAgentDropdown', () => ({
  useAgentDropdown: () => ({
    isOpen,
    closeDropdown,
    toggleDropdown,
    dropdownRef: { current: null },
    buttonRef: { current: null },
    panelRef: { current: null },
    dropdownPos: isOpen ? { top: 10, right: 10 } : null,
  }),
}))

vi.mock('./AgentApprovalDialog', () => ({
  AgentApprovalDialog: ({ isOpen: open, onApprove, onCancel }: { isOpen: boolean; onApprove: () => void; onCancel: () => void }) =>
    open ? (
      <div>
        <button onClick={onApprove}>approve</button>
        <button onClick={onCancel}>cancel</button>
      </div>
    ) : null,
  hasApprovedAgents: () => hasApproved,
}))

vi.mock('./AgentCardGrid', () => ({
  AgentCardGrid: ({ onSelect }: { onSelect: (name: string) => void }) => (
    <div>
      <button onClick={() => onSelect('claude')}>select-claude</button>
      <button onClick={() => onSelect('needs-provider')}>select-needs-provider</button>
    </div>
  ),
}))

vi.mock('./CapabilityDetailPanel', () => ({
  CapabilityDetailPanel: () => <div data-testid="capability-panel" />,
}))

vi.mock('../../lib/utils/localStorage', () => ({
  safeGetItem: vi.fn(() => null),
  safeSetItem: vi.fn(),
}))

import { AgentConfigForm } from './AgentConfigForm'
import type { AgentInfo } from '../../types/agent'

function agent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    name: 'claude',
    displayName: 'Claude',
    description: 'Claude agent',
    provider: 'claude',
    available: true,
    ...overrides,
  }
}

function baseProps(overrides: Partial<React.ComponentProps<typeof AgentConfigForm>> = {}) {
  const agents = [agent()]
  return {
    compact: false,
    className: '',
    isDemoMode: false,
    activeBackend: 'kc-agent',
    agents,
    agentsLoading: false,
    selectedAgent: 'claude',
    selectedAgentInfo: agents[0],
    cliAgents: agents,
    clusterAgents: [],
    sortedAgents: agents,
    currentAgent: agents[0],
    hasAvailableAgents: true,
    hasCliAgent: true,
    agentToProviderKey: { 'needs-provider': 'vscode' },
    selectAgent: vi.fn(),
    connectToAgent: vi.fn(),
    openInstallGuide: vi.fn(),
    handleInstallMission: vi.fn(),
    ...overrides,
  }
}

describe('AgentConfigForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isOpen = false
    hasApproved = true
  })

  it('renders the agent selector button showing the current agent name', () => {
    render(<AgentConfigForm {...baseProps()} />)
    expect(screen.getByText('Claude')).toBeInTheDocument()
  })

  it('shows "AI Agent" fallback label when no agents are available', () => {
    render(<AgentConfigForm {...baseProps({ hasAvailableAgents: false, currentAgent: undefined })} />)
    expect(screen.getByText('AI Agent')).toBeInTheDocument()
  })

  it('shows the "none" label when selectedAgent is "none"', () => {
    render(<AgentConfigForm {...baseProps({ selectedAgent: 'none' })} />)
    expect(screen.getByText('agent.noneAgent')).toBeInTheDocument()
  })

  it('calls toggleDropdown when the selector button is clicked outside demo mode', () => {
    render(<AgentConfigForm {...baseProps({ isDemoMode: false })} />)
    fireEvent.click(screen.getByLabelText('agent.selectAgent'))
    expect(toggleDropdown).toHaveBeenCalled()
  })

  it('does not call toggleDropdown when in demo mode', () => {
    render(<AgentConfigForm {...baseProps({ isDemoMode: true })} />)
    fireEvent.click(screen.getByLabelText('agent.selectAgent'))
    expect(toggleDropdown).not.toHaveBeenCalled()
  })

  it('renders the dropdown panel and agent grid when open', () => {
    isOpen = true
    render(<AgentConfigForm {...baseProps()} />)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByText('select-claude')).toBeInTheDocument()
    expect(screen.getByTestId('capability-panel')).toBeInTheDocument()
  })

  it('selects an agent directly when it requires no provider prerequisites and the user is approved', () => {
    isOpen = true
    const selectAgent = vi.fn()
    render(<AgentConfigForm {...baseProps({ selectAgent })} />)
    fireEvent.click(screen.getByText('select-claude'))
    expect(selectAgent).toHaveBeenCalledWith('claude')
    expect(closeDropdown).toHaveBeenCalled()
    expect(startConnection).not.toHaveBeenCalled()
  })

  it('starts a provider connection when the selected agent has prerequisites', () => {
    isOpen = true
    const selectAgent = vi.fn()
    render(<AgentConfigForm {...baseProps({ selectAgent })} />)
    fireEvent.click(screen.getByText('select-needs-provider'))
    expect(selectAgent).toHaveBeenCalledWith('needs-provider')
    expect(startConnection).toHaveBeenCalledWith('needs-provider', expect.any(Function))
  })

  it('shows the approval dialog instead of selecting when the user has not approved agents', () => {
    isOpen = true
    hasApproved = false
    const selectAgent = vi.fn()
    render(<AgentConfigForm {...baseProps({ selectAgent })} />)
    fireEvent.click(screen.getByText('select-claude'))
    expect(selectAgent).not.toHaveBeenCalled()
    expect(screen.getByText('approve')).toBeInTheDocument()
  })

  it('selects the pending agent once the approval dialog is approved', () => {
    isOpen = true
    hasApproved = false
    const selectAgent = vi.fn()
    render(<AgentConfigForm {...baseProps({ selectAgent })} />)
    fireEvent.click(screen.getByText('select-claude'))
    fireEvent.click(screen.getByText('approve'))
    expect(selectAgent).toHaveBeenCalledWith('claude')
  })

  it('clears the pending agent without selecting when approval is cancelled', () => {
    isOpen = true
    hasApproved = false
    const selectAgent = vi.fn()
    render(<AgentConfigForm {...baseProps({ selectAgent })} />)
    fireEvent.click(screen.getByText('select-claude'))
    fireEvent.click(screen.getByText('cancel'))
    expect(selectAgent).not.toHaveBeenCalled()
    expect(screen.queryByText('approve')).not.toBeInTheDocument()
  })

  it('shows a loading indicator when there are no sorted agents and agents are loading', () => {
    isOpen = true
    render(<AgentConfigForm {...baseProps({ sortedAgents: [], agentsLoading: true })} />)
    expect(screen.getByText('agent.connectingToAgent')).toBeInTheDocument()
  })

  it('shows a retry option when there are no sorted agents and loading has finished', () => {
    isOpen = true
    const connectToAgent = vi.fn()
    render(<AgentConfigForm {...baseProps({ sortedAgents: [], agentsLoading: false, connectToAgent })} />)
    const retryBtn = screen.getByText('Retry connection')
    fireEvent.click(retryBtn)
    expect(connectToAgent).toHaveBeenCalled()
  })
})
