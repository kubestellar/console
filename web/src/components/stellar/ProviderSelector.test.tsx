import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetProviders = vi.fn()
let mockAgents: Array<Record<string, unknown>> = []

vi.mock('../../services/stellar', () => ({
  stellarApi: {
    getProviders: (...args: unknown[]) => mockGetProviders(...args),
  },
}))

vi.mock('../../hooks/useMissions', () => ({
  useMissions: () => ({ agents: mockAgents }),
}))

vi.mock('../agent/AgentIcon', () => ({
  AgentIcon: ({ provider }: { provider: string }) => <span data-testid="agent-icon">{provider}</span>,
}))

import { ProviderSelector } from './ProviderSelector'

describe('ProviderSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAgents = []
    mockGetProviders.mockResolvedValue({ user: [], global: [] })
  })

  it('shows "auto" when no session is selected', async () => {
    render(<ProviderSelector session={null} onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: /auto/ })).toBeInTheDocument()
    await waitFor(() => expect(mockGetProviders).toHaveBeenCalled())
  })

  it('shows the raw provider name when no option matches', async () => {
    render(
      <ProviderSelector session={{ provider: 'mystery', model: '', source: 'request' }} onSelect={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /mystery/ })).toBeInTheDocument()
    await waitFor(() => expect(mockGetProviders).toHaveBeenCalled())
  })

  it('opens the menu and shows empty-state when no providers exist', async () => {
    render(<ProviderSelector session={null} onSelect={vi.fn()} />)
    fireEvent.click(document.getElementById('stellar-provider-selector-btn')!)
    expect(await screen.findByText(/No providers detected/)).toBeInTheDocument()
  })

  it('selects Auto and closes the menu', async () => {
    const onSelect = vi.fn()
    render(<ProviderSelector session={null} onSelect={onSelect} />)
    await waitFor(() => expect(mockGetProviders).toHaveBeenCalled())
    fireEvent.click(document.getElementById('stellar-provider-selector-btn')!)
    fireEvent.click(screen.getByText('Use best available provider'))
    expect(onSelect).toHaveBeenCalledWith({ provider: '', model: '', source: 'auto' })
    expect(screen.queryByText('Use best available provider')).not.toBeInTheDocument()
  })

  it('lists available CLI agents and selects one', async () => {
    mockAgents = [
      { name: 'claude-code', displayName: 'Claude Code', provider: 'anthropic-local', model: 'opus', available: true },
      { name: 'hidden', displayName: 'Hidden Agent', provider: 'x', available: false },
    ]
    const onSelect = vi.fn()
    render(<ProviderSelector session={null} onSelect={onSelect} />)
    await waitFor(() => expect(mockGetProviders).toHaveBeenCalled())
    fireEvent.click(document.getElementById('stellar-provider-selector-btn')!)
    expect(screen.queryByText('Hidden Agent')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Claude Code'))
    expect(onSelect).toHaveBeenCalledWith({
      provider: 'claude-code', model: '', source: 'env-default', isCli: true,
    })
  })

  it('lists LLM providers and selects an available one', async () => {
    mockGetProviders.mockResolvedValue({
      user: [{ id: 'u1', provider: 'openai', displayName: 'My OpenAI', model: 'gpt-4' }],
      global: [{ name: 'anthropic', displayName: 'Anthropic', model: 'sonnet', available: true }],
    })
    const onSelect = vi.fn()
    render(<ProviderSelector session={null} onSelect={onSelect} />)
    await waitFor(() => expect(mockGetProviders).toHaveBeenCalled())
    fireEvent.click(document.getElementById('stellar-provider-selector-btn')!)
    expect(await screen.findByText('My OpenAI')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Anthropic'))
    expect(onSelect).toHaveBeenCalledWith({
      provider: 'anthropic', model: 'sonnet', source: 'env-default', isCli: false,
    })
  })

  it('does not select unavailable providers', async () => {
    mockGetProviders.mockResolvedValue({
      user: [],
      global: [{ name: 'offline', displayName: 'Offline LLM', model: 'm', available: false }],
    })
    const onSelect = vi.fn()
    render(<ProviderSelector session={null} onSelect={onSelect} />)
    await waitFor(() => expect(mockGetProviders).toHaveBeenCalled())
    fireEvent.click(document.getElementById('stellar-provider-selector-btn')!)
    fireEvent.click(await screen.findByText('Offline LLM'))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('shows error and retries loading providers', async () => {
    mockGetProviders.mockRejectedValueOnce(new Error('boom'))
    render(<ProviderSelector session={null} onSelect={vi.fn()} />)
    await waitFor(() => expect(mockGetProviders).toHaveBeenCalledTimes(1))
    fireEvent.click(document.getElementById('stellar-provider-selector-btn')!)
    expect(await screen.findByText('Could not load provider list.')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Retry'))
    await waitFor(() => expect(mockGetProviders).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(screen.queryByText('Could not load provider list.')).not.toBeInTheDocument(),
    )
  })
})
