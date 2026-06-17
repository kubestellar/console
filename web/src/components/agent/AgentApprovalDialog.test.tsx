import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  AgentApprovalDialog,
  hasApprovedAgents,
  setAgentsApproved,
  clearAgentsApproval,
} from './AgentApprovalDialog'
import type { AgentInfo } from '../../types/agent'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { count: number }) => {
      if (key === 'agent.approval.detectedAgents' && typeof fallback === 'object') {
        return `Detected ${fallback.count} agents`
      }
      return fallback || key
    },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock modals
vi.mock('../../lib/modals', () => ({
  BaseModal: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __esModule: true,
    default: ({ children, isOpen }: any) => (isOpen ? <div role="dialog">{children}</div> : null),
    Header: ({ title, description }: { title: string; description: string }) => (
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    ),
    Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Footer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
}))

// Mock AgentIcon
vi.mock('./AgentIcon', () => ({
  AgentIcon: ({ provider }: { provider: string }) => <div data-testid={`agent-icon-${provider}`} />,
}))

const mockAgents: AgentInfo[] = [
  {
    name: 'claude',
    displayName: 'Claude',
    provider: 'anthropic',
    description: 'Claude AI assistant',
    available: true,
  },
  {
    name: 'gpt4',
    displayName: 'GPT-4',
    provider: 'openai',
    description: 'OpenAI GPT-4',
    available: true,
  },
  {
    name: 'unavailable',
    displayName: 'Unavailable Agent',
    provider: 'test',
    description: 'Not available',
    available: false,
  },
]

describe('AgentApprovalDialog', () => {
  const mockOnApprove = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    clearAgentsApproval()
    localStorage.clear()
  })

  afterEach(() => {
    clearAgentsApproval()
  })

  it('does not render when isOpen is false', () => {
    render(
      <AgentApprovalDialog
        isOpen={false}
        agents={mockAgents}
        onApprove={mockOnApprove}
        onCancel={mockOnCancel}
      />
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders dialog when isOpen is true', () => {
    render(
      <AgentApprovalDialog
        isOpen={true}
        agents={mockAgents}
        onApprove={mockOnApprove}
        onCancel={mockOnCancel}
      />
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('displays warning about agent capabilities', () => {
    render(
      <AgentApprovalDialog
        isOpen={true}
        agents={mockAgents}
        onApprove={mockOnApprove}
        onCancel={mockOnCancel}
      />
    )

    expect(screen.getByText(/agent.approval.executeWarning/)).toBeInTheDocument()
  })

  it('displays only available agents', () => {
    render(
      <AgentApprovalDialog
        isOpen={true}
        agents={mockAgents}
        onApprove={mockOnApprove}
        onCancel={mockOnCancel}
      />
    )

    expect(screen.getByText('Claude')).toBeInTheDocument()
    expect(screen.getByText('GPT-4')).toBeInTheDocument()
    expect(screen.queryByText('Unavailable Agent')).not.toBeInTheDocument()

    // Should show 2 available agents
    expect(screen.getByText(/Detected 2 agents/)).toBeInTheDocument()
  })

  it('shows message when no agents are available', () => {
    render(
      <AgentApprovalDialog
        isOpen={true}
        agents={[]}
        onApprove={mockOnApprove}
        onCancel={mockOnCancel}
      />
    )

    expect(screen.getByText(/agent.approval.noAgentsDetected/)).toBeInTheDocument()
  })

  it('calls onCancel when cancel button is clicked', () => {
    render(
      <AgentApprovalDialog
        isOpen={true}
        agents={mockAgents}
        onApprove={mockOnApprove}
        onCancel={mockOnCancel}
      />
    )

    const cancelButton = screen.getByRole('button', { name: /agent.approval.cancel/i })
    fireEvent.click(cancelButton)

    expect(mockOnCancel).toHaveBeenCalledTimes(1)
    expect(mockOnApprove).not.toHaveBeenCalled()
  })

  it('sets approval and calls onApprove when approve button is clicked', () => {
    render(
      <AgentApprovalDialog
        isOpen={true}
        agents={mockAgents}
        onApprove={mockOnApprove}
        onCancel={mockOnCancel}
      />
    )

    // Should not be approved initially
    expect(hasApprovedAgents()).toBe(false)

    const approveButton = screen.getByRole('button', { name: /agent.approval.approveEnable/i })
    fireEvent.click(approveButton)

    // Should now be approved
    expect(hasApprovedAgents()).toBe(true)
    expect(mockOnApprove).toHaveBeenCalledTimes(1)
  })

  it('handles null agents array gracefully', () => {
    render(
      <AgentApprovalDialog
        isOpen={true}
        agents={null as any}
        onApprove={mockOnApprove}
        onCancel={mockOnCancel}
      />
    )

    // Should not crash and should show no agents message
    expect(screen.getByText(/agent.approval.noAgentsDetected/)).toBeInTheDocument()
  })
})

describe('Agent approval state management', () => {
  beforeEach(() => {
    clearAgentsApproval()
    localStorage.clear()
  })

  afterEach(() => {
    clearAgentsApproval()
  })

  it('hasApprovedAgents returns false initially', () => {
    expect(hasApprovedAgents()).toBe(false)
  })

  it('setAgentsApproved sets approval in localStorage', () => {
    setAgentsApproved()
    expect(hasApprovedAgents()).toBe(true)
    expect(localStorage.getItem('kc_agents_approved')).toBe('true')
  })

  it('clearAgentsApproval removes approval from localStorage', () => {
    setAgentsApproved()
    expect(hasApprovedAgents()).toBe(true)

    clearAgentsApproval()
    // Session approval remains but localStorage is cleared
    expect(localStorage.getItem('kc_agents_approved')).toBeNull()
  })

  it('falls back to session approval when localStorage is unavailable', () => {
    // Mock localStorage to throw (simulating quota exceeded or disabled storage)
    const originalSetItem = localStorage.setItem
    const originalGetItem = localStorage.getItem
    
    localStorage.setItem = vi.fn(() => {
      throw new Error('QuotaExceededError')
    })
    localStorage.getItem = vi.fn(() => {
      throw new Error('Storage access denied')
    })

    setAgentsApproved()
    expect(hasApprovedAgents()).toBe(true)

    // Restore
    localStorage.setItem = originalSetItem
    localStorage.getItem = originalGetItem
  })
})
