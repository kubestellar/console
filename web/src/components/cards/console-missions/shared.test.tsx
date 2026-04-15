import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
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

vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
)

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
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

  it('returns true when an Anthropic API key is in localStorage', () => {
    localStorage.setItem(ANTHROPIC_KEY_STORAGE, 'sk-ant-test-key')

    const { result } = renderHook(() => useApiKeyCheck(), { wrapper })

    expect(result.current.hasAvailableAgent()).toBe(true)
  })

  it('returns false with no local agent, no WS agents, and no API key', () => {
    const { result } = renderHook(() => useApiKeyCheck(), { wrapper })

    expect(result.current.hasAvailableAgent()).toBe(false)
  })

  it('returns false when only an empty/whitespace API key is present', () => {
    localStorage.setItem(ANTHROPIC_KEY_STORAGE, '   ')

    const { result } = renderHook(() => useApiKeyCheck(), { wrapper })

    expect(result.current.hasAvailableAgent()).toBe(false)
  })
})
