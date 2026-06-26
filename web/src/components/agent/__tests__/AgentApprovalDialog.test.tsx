import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AgentInfo } from '../../../types/agent'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'agent.approval.title': 'Enable Agent Access',
        'agent.approval.description': 'Allow agents to run commands on your cluster',
        'agent.approval.executeWarning': 'Agents can execute commands',
        'agent.approval.cancel': 'Cancel',
        'agent.approval.approveEnable': 'Approve & Enable',
        'agent.approval.noAgentsDetected': 'No agents detected',
      }
      if (key === 'agent.approval.detectedAgents') {
        return `${opts?.count ?? 0} agent(s) detected`
      }
      return map[key] ?? key
    },
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}))

vi.mock('../../../lib/modals', () => ({
  BaseModal: ({
    isOpen,
    onClose,
    children,
  }: {
    isOpen: boolean
    onClose: () => void
    children: React.ReactNode
  }) => {
    if (!isOpen) return null
    return <div data-testid="base-modal">{children}</div>
  },
}))

import * as modals from '../../../lib/modals'
;(modals.BaseModal as unknown as Record<string, unknown>).Header = ({
  title,
  onClose,
}: {
  title: string
  description: string
  onClose: () => void
}) => (
  <div>
    <h2>{title}</h2>
    <button aria-label="Close" onClick={onClose}>×</button>
  </div>
)
;(modals.BaseModal as unknown as Record<string, unknown>).Content = ({
  children,
}: {
  children: React.ReactNode
}) => <div data-testid="modal-content">{children}</div>
;(modals.BaseModal as unknown as Record<string, unknown>).Footer = ({
  children,
}: {
  children: React.ReactNode
}) => <div data-testid="modal-footer">{children}</div>

vi.mock('../AgentIcon', () => ({
  AgentIcon: ({ provider }: { provider: string }) => (
    <span data-testid={`agent-icon-${provider}`} />
  ),
}))

import {
  AgentApprovalDialog,
  hasApprovedAgents,
  setAgentsApproved,
  clearAgentsApproval,
} from '../AgentApprovalDialog'

const STORAGE_KEY = 'kc_agents_approved'

const CLAUDE_AGENT: AgentInfo = {
  name: 'claude',
  displayName: 'Claude',
  description: 'Anthropic Claude AI',
  provider: 'claude',
  available: true,
}

const OPENAI_AGENT: AgentInfo = {
  name: 'openai',
  displayName: 'OpenAI GPT',
  description: 'OpenAI GPT-4',
  provider: 'openai',
  available: true,
}

const UNAVAILABLE_AGENT: AgentInfo = {
  name: 'gemini',
  displayName: 'Gemini',
  description: 'Google Gemini',
  provider: 'gemini',
  available: false,
}

function renderDialog(
  overrides: Partial<{
    isOpen: boolean
    agents: AgentInfo[]
    onApprove: () => void
    onCancel: () => void
  }> = {},
) {
  const props = {
    isOpen: true,
    agents: [CLAUDE_AGENT],
    onApprove: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<AgentApprovalDialog {...props} />) }
}

// Run helper-function suites FIRST — before any test clicks Approve,
// which sets the module-level sessionApproved flag irreversibly.
describe('hasApprovedAgents', () => {
  beforeEach(() => localStorage.clear())

  it('returns false when nothing stored', () => {
    expect(hasApprovedAgents()).toBe(false)
  })

  it('returns true when localStorage has "true"', () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    expect(hasApprovedAgents()).toBe(true)
  })

  it('returns false for any other stored value', () => {
    localStorage.setItem(STORAGE_KEY, '1')
    expect(hasApprovedAgents()).toBe(false)
  })
})

describe('clearAgentsApproval', () => {
  beforeEach(() => localStorage.clear())

  it('removes the localStorage key', () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    clearAgentsApproval()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('AgentApprovalDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders when isOpen is true', () => {
    renderDialog()
    expect(screen.getByTestId('base-modal')).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    renderDialog({ isOpen: false })
    expect(screen.queryByTestId('base-modal')).not.toBeInTheDocument()
  })

  it('renders modal content and footer', () => {
    renderDialog()
    expect(screen.getByTestId('modal-content')).toBeInTheDocument()
    expect(screen.getByTestId('modal-footer')).toBeInTheDocument()
  })

  it('renders the title', () => {
    renderDialog()
    expect(screen.getByText('Enable Agent Access')).toBeInTheDocument()
  })

  it('renders the execute warning', () => {
    renderDialog()
    expect(screen.getByText('Agents can execute commands')).toBeInTheDocument()
  })

  it('renders available agents by name', () => {
    renderDialog({ agents: [CLAUDE_AGENT, OPENAI_AGENT] })
    expect(screen.getByText('Claude')).toBeInTheDocument()
    expect(screen.getByText('OpenAI GPT')).toBeInTheDocument()
  })

  it('renders agent description', () => {
    renderDialog()
    expect(screen.getByText('Anthropic Claude AI')).toBeInTheDocument()
  })

  it('renders agent icon per provider', () => {
    renderDialog({ agents: [CLAUDE_AGENT] })
    expect(screen.getByTestId('agent-icon-claude')).toBeInTheDocument()
  })

  it('filters out unavailable agents', () => {
    renderDialog({ agents: [CLAUDE_AGENT, UNAVAILABLE_AGENT] })
    expect(screen.queryByText('Gemini')).not.toBeInTheDocument()
    expect(screen.getByText('Claude')).toBeInTheDocument()
  })

  it('shows no-agents message when all agents are unavailable', () => {
    renderDialog({ agents: [UNAVAILABLE_AGENT] })
    expect(screen.getByText('No agents detected')).toBeInTheDocument()
  })

  it('shows no-agents message when agents array is empty', () => {
    renderDialog({ agents: [] })
    expect(screen.getByText('No agents detected')).toBeInTheDocument()
  })

  it('renders the Cancel button', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('renders the Approve & Enable button', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
  })

  it('calls onCancel when Cancel button is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderDialog()
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(props.onCancel).toHaveBeenCalledOnce()
  })

  it('calls onCancel when header X button is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderDialog()
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(props.onCancel).toHaveBeenCalledOnce()
  })

  it('calls onApprove when Approve & Enable is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderDialog()
    await user.click(screen.getByRole('button', { name: /approve/i }))
    expect(props.onApprove).toHaveBeenCalledOnce()
  })

  it('persists approval to localStorage when Approve is clicked', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: /approve/i }))
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true')
  })

  it('does not persist approval when Cancel is clicked', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('shows agent count in detected agents header', () => {
    renderDialog({ agents: [CLAUDE_AGENT, OPENAI_AGENT] })
    expect(screen.getByText(/2 agent\(s\) detected/i)).toBeInTheDocument()
  })
})

describe('setAgentsApproved', () => {
  beforeEach(() => localStorage.clear())

  it('sets localStorage key to "true"', () => {
    setAgentsApproved()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true')
  })

  it('makes hasApprovedAgents return true', () => {
    setAgentsApproved()
    expect(hasApprovedAgents()).toBe(true)
  })
})
