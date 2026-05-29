import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const mockSetDemoMode = vi.fn()
const mockHasApprovedAgents = vi.fn()
const mockWasAgentEverConnected = vi.fn()

vi.mock('../../../lib/demoMode', () => ({
  setDemoMode: (...args: unknown[]) => mockSetDemoMode(...args),
}))

vi.mock('../../agent/AgentApprovalDialog', () => ({
  hasApprovedAgents: () => mockHasApprovedAgents(),
}))

vi.mock('../../../hooks/useLocalAgent', () => ({
  wasAgentEverConnected: () => mockWasAgentEverConnected(),
}))

import { useAutoDemoMode } from '../useAutoDemoMode'

describe('useAutoDemoMode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockHasApprovedAgents.mockReturnValue(true)
    mockWasAgentEverConnected.mockReturnValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const defaultOptions = {
    agentStatus: 'connected' as string,
    isInClusterMode: false,
    isDemoMode: false,
    isDemoModeForced: false,
  }

  it('does not enable demo mode when agent is connected', () => {
    renderHook(() => useAutoDemoMode(defaultOptions))

    vi.advanceTimersByTime(10000)
    expect(mockSetDemoMode).not.toHaveBeenCalled()
  })

  it('enables demo mode immediately when agent was never connected', () => {
    mockWasAgentEverConnected.mockReturnValue(false)

    renderHook(() => useAutoDemoMode({
      ...defaultOptions,
      agentStatus: 'disconnected',
    }))

    expect(mockSetDemoMode).toHaveBeenCalledWith(true)
  })

  it('starts 8s timer when user toggled off demo mode and agent disconnects', () => {
    const { rerender } = renderHook(
      (props) => useAutoDemoMode(props),
      { initialProps: { ...defaultOptions, isDemoMode: true, agentStatus: 'disconnected' } }
    )

    // Simulate user toggling demo mode off (was true, now false, agent not connected)
    rerender({ ...defaultOptions, isDemoMode: false, agentStatus: 'disconnected' })

    // Timer should not have fired yet
    expect(mockSetDemoMode).not.toHaveBeenCalled()

    // After 8 seconds
    vi.advanceTimersByTime(8000)
    expect(mockSetDemoMode).toHaveBeenCalledWith(true)
  })

  it('cancels timer and resets userToggledOff when isDemoModeForced changes', () => {
    const { rerender } = renderHook(
      (props) => useAutoDemoMode(props),
      { initialProps: { ...defaultOptions, isDemoMode: true, agentStatus: 'disconnected' } }
    )

    // User toggles off → sets userToggledOffRef
    rerender({ ...defaultOptions, isDemoMode: false, agentStatus: 'disconnected' })

    // Timer started, advance partially
    vi.advanceTimersByTime(3000)
    expect(mockSetDemoMode).not.toHaveBeenCalled()

    // isDemoModeForced becomes true → should cancel timer and reset ref
    rerender({ ...defaultOptions, isDemoMode: false, agentStatus: 'disconnected', isDemoModeForced: true })

    // Advance past the original 8s — timer should NOT fire
    vi.advanceTimersByTime(10000)
    expect(mockSetDemoMode).not.toHaveBeenCalled()

    // isDemoModeForced back to false, agent disconnects again
    rerender({ ...defaultOptions, isDemoMode: false, agentStatus: 'disconnected', isDemoModeForced: false })

    // userToggledOffRef was reset, so no new timer should start
    vi.advanceTimersByTime(10000)
    expect(mockSetDemoMode).not.toHaveBeenCalled()
  })

  it('disables demo mode when agent connects and demo was auto-enabled', () => {
    mockWasAgentEverConnected.mockReturnValue(false)

    const { rerender } = renderHook(
      (props) => useAutoDemoMode(props),
      { initialProps: { ...defaultOptions, agentStatus: 'disconnected' } }
    )

    // Demo mode was auto-enabled
    expect(mockSetDemoMode).toHaveBeenCalledWith(true)
    mockSetDemoMode.mockClear()

    // Agent connects, demo mode still on
    rerender({ ...defaultOptions, agentStatus: 'connected', isDemoMode: true })

    expect(mockSetDemoMode).toHaveBeenCalledWith(false, true)
  })

  it('does not disable demo mode on connect if agents are not approved', () => {
    mockWasAgentEverConnected.mockReturnValue(false)
    mockHasApprovedAgents.mockReturnValue(false)

    const { rerender } = renderHook(
      (props) => useAutoDemoMode(props),
      { initialProps: { ...defaultOptions, agentStatus: 'disconnected' } }
    )

    expect(mockSetDemoMode).toHaveBeenCalledWith(true)
    mockSetDemoMode.mockClear()

    rerender({ ...defaultOptions, agentStatus: 'connected', isDemoMode: true })

    // Should NOT auto-disable because agents not approved
    expect(mockSetDemoMode).not.toHaveBeenCalledWith(false, true)
  })

  it('does not start timer when in cluster mode', () => {
    const { rerender } = renderHook(
      (props) => useAutoDemoMode(props),
      { initialProps: { ...defaultOptions, isDemoMode: true, agentStatus: 'disconnected' } }
    )

    // User toggles off
    rerender({ ...defaultOptions, isDemoMode: false, agentStatus: 'disconnected', isInClusterMode: true })

    vi.advanceTimersByTime(10000)
    expect(mockSetDemoMode).not.toHaveBeenCalled()
  })

  it('grace period timer resets userToggledOff when it fires', () => {
    const { rerender } = renderHook(
      (props) => useAutoDemoMode(props),
      { initialProps: { ...defaultOptions, isDemoMode: true, agentStatus: 'disconnected' } }
    )

    // Toggle off
    rerender({ ...defaultOptions, isDemoMode: false, agentStatus: 'disconnected' })

    // Let timer fire
    vi.advanceTimersByTime(8000)
    expect(mockSetDemoMode).toHaveBeenCalledWith(true)
    mockSetDemoMode.mockClear()

    // Next disconnect should NOT start another timer (userToggledOff was reset)
    rerender({ ...defaultOptions, isDemoMode: false, agentStatus: 'connected' })
    rerender({ ...defaultOptions, isDemoMode: false, agentStatus: 'disconnected' })

    vi.advanceTimersByTime(10000)
    expect(mockSetDemoMode).not.toHaveBeenCalled()
  })
})
