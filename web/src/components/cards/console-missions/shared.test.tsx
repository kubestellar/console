import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { useApiKeyCheck, ANTHROPIC_KEY_STORAGE } from './shared'

// ── External module mocks ─────────────────────────────────────────────────────

const mockUseMissions = vi.fn()
vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => mockUseMissions(),
}))

const mockIsAgentConnected = vi.fn()
vi.mock('../../../hooks/useLocalAgent', () => ({
  isAgentConnected: () => mockIsAgentConnected(),
}))

const mockShowToast = vi.fn()
vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

const mockAgentFetch = vi.fn()
vi.mock('../../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
)

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  mockAgentFetch.mockRejectedValue(new Error('offline'))
  // Default: no WS-reported agents, no stored key.
  mockUseMissions.mockReturnValue({
    agents: [],
    selectedAgent: null,
  })
  mockIsAgentConnected.mockReturnValue(false)
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useApiKeyCheck.hasAvailableAgent', () => {
  it('returns true when a local kc-agent is connected (#8093)', () => {
    // Repro for #8093: Mike has bob-Andersons-Office connected via kc-agent
    // but no API keys configured and no agents in the WS list yet. Repair
    // button should still proceed.
    mockIsAgentConnected.mockReturnValue(true)

    const { result } = renderHook(() => useApiKeyCheck(), { wrapper })

    expect(result.current.hasAvailableAgent()).toBe(true)
  })

  it('returns true when an agent in the WS list is available', () => {
    mockUseMissions.mockReturnValue({
      agents: [{ name: 'claude', available: true }],
      selectedAgent: 'claude',
    })

    const { result } = renderHook(() => useApiKeyCheck(), { wrapper })

    expect(result.current.hasAvailableAgent()).toBe(true)
  })

  it('returns true when an Anthropic API key is in sessionStorage', () => {
    sessionStorage.setItem(ANTHROPIC_KEY_STORAGE, 'sk-ant-test-key')

    const { result } = renderHook(() => useApiKeyCheck(), { wrapper })

    expect(result.current.hasAvailableAgent()).toBe(true)
  })

  it('returns false with no local agent, no WS agents, and no API key', () => {
    const { result } = renderHook(() => useApiKeyCheck(), { wrapper })

    expect(result.current.hasAvailableAgent()).toBe(false)
  })

  it('returns false when only an empty/whitespace API key is present', () => {
    sessionStorage.setItem(ANTHROPIC_KEY_STORAGE, '   ')

    const { result } = renderHook(() => useApiKeyCheck(), { wrapper })

    expect(result.current.hasAvailableAgent()).toBe(false)
  })

  it('blocks repair when the agent is connected but no key is configured', async () => {
    mockIsAgentConnected.mockReturnValue(true)
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [{ configured: false }] }),
    })

    const onSuccess = vi.fn()
    const { result } = renderHook(() => useApiKeyCheck(), { wrapper })

    result.current.checkKeyAndRun(onSuccess)

    await waitFor(() => {
      expect(onSuccess).not.toHaveBeenCalled()
      expect(result.current.showKeyPrompt).toBe(true)
      expect(mockShowToast).toHaveBeenCalledWith(
        'No AI API key configured. Add one in Settings to use AI-powered repair.',
        'error',
      )
    })
  })

  it('allows repair when the connected agent reports a configured valid key', async () => {
    mockIsAgentConnected.mockReturnValue(true)
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [{ configured: true, valid: true }] }),
    })

    const onSuccess = vi.fn()
    const { result } = renderHook(() => useApiKeyCheck(), { wrapper })

    result.current.checkKeyAndRun(onSuccess)

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(result.current.showKeyPrompt).toBe(false)
    })
  })
})
