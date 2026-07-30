import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockSetDemoMode,
  mockHasApprovedAgents,
  mockWasAgentEverConnected,
} = vi.hoisted(() => ({
  mockSetDemoMode: vi.fn(),
  mockHasApprovedAgents: vi.fn(),
  mockWasAgentEverConnected: vi.fn(),
}))

vi.mock('../../../lib/demoMode', () => ({
  setDemoMode: (...args: Parameters<typeof mockSetDemoMode>) => mockSetDemoMode(...args),
}))

vi.mock('../../agent/AgentApprovalDialog', () => ({
  hasApprovedAgents: () => mockHasApprovedAgents(),
}))

vi.mock('../../../hooks/useLocalAgent', () => ({
  wasAgentEverConnected: () => mockWasAgentEverConnected(),
}))

import { useAutoDemoMode } from '../useAutoDemoMode'

const AGENT_CONNECT_GRACE_MS = 8000

const BASE_OPTIONS = {
  agentStatus: 'disconnected',
  isInClusterMode: false,
  isDemoMode: false,
  isDemoModeForced: false,
} as const

describe('useAutoDemoMode', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockHasApprovedAgents.mockReturnValue(false)
    mockWasAgentEverConnected.mockReturnValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resets the user-toggled-off state when forced demo mode cancels the timer', () => {
    const { rerender } = renderHook(useAutoDemoMode, {
      initialProps: {
        ...BASE_OPTIONS,
        isDemoMode: true,
      },
    })

    rerender({
      ...BASE_OPTIONS,
      isDemoMode: false,
    })

    rerender({
      ...BASE_OPTIONS,
      isDemoModeForced: true,
    })

    act(() => {
      vi.advanceTimersByTime(AGENT_CONNECT_GRACE_MS)
    })

    expect(mockSetDemoMode).not.toHaveBeenCalled()

    rerender({
      ...BASE_OPTIONS,
      isDemoModeForced: false,
    })

    act(() => {
      vi.advanceTimersByTime(AGENT_CONNECT_GRACE_MS)
    })

    expect(mockSetDemoMode).not.toHaveBeenCalled()
  })

  it('re-enables demo mode after the disconnect grace period when the user toggles it off', () => {
    const { rerender } = renderHook(useAutoDemoMode, {
      initialProps: {
        ...BASE_OPTIONS,
        isDemoMode: true,
      },
    })

    rerender({
      ...BASE_OPTIONS,
      isDemoMode: false,
    })

    act(() => {
      vi.advanceTimersByTime(AGENT_CONNECT_GRACE_MS - 1)
    })

    expect(mockSetDemoMode).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(mockSetDemoMode).toHaveBeenCalledWith(true)
    expect(mockSetDemoMode).toHaveBeenCalledTimes(1)
  })

  it('turns off auto-enabled demo mode after the agent reconnects with approved agents', () => {
    mockWasAgentEverConnected.mockReturnValue(false)
    mockHasApprovedAgents.mockReturnValue(true)

    const { rerender } = renderHook(useAutoDemoMode, {
      initialProps: BASE_OPTIONS,
    })

    expect(mockSetDemoMode).toHaveBeenCalledWith(true)

    rerender({
      ...BASE_OPTIONS,
      agentStatus: 'connected',
      isDemoMode: true,
    })

    expect(mockSetDemoMode).toHaveBeenNthCalledWith(2, false, true)
  })
})
