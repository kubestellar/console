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
  setDemoMode: (...args: unknown[]) => mockSetDemoMode(...args),
}))

vi.mock('../../agent/AgentApprovalDialog', () => ({
  hasApprovedAgents: () => mockHasApprovedAgents(),
}))

vi.mock('../../../hooks/useLocalAgent', () => ({
  wasAgentEverConnected: () => mockWasAgentEverConnected(),
}))

import { useAutoDemoMode } from '../useAutoDemoMode'

const AGENT_CONNECT_GRACE_MS = 8000

type UseAutoDemoModeOptions = Parameters<typeof useAutoDemoMode>[0]

const BASE_OPTIONS: UseAutoDemoModeOptions = {
  agentStatus: 'disconnected',
  isInClusterMode: false,
  isDemoMode: false,
  isDemoModeForced: false,
}

function renderUseAutoDemoMode(initialProps: UseAutoDemoModeOptions = BASE_OPTIONS) {
  return renderHook(useAutoDemoMode, { initialProps })
}

describe('useAutoDemoMode', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockHasApprovedAgents.mockReturnValue(false)
    mockWasAgentEverConnected.mockReturnValue(true)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('does not enable demo mode when agent is connected', () => {
    mockWasAgentEverConnected.mockReturnValue(false)

    renderUseAutoDemoMode({
      ...BASE_OPTIONS,
      agentStatus: 'connected',
    })

    expect(mockSetDemoMode).not.toHaveBeenCalled()
  })

  it('enables demo mode immediately when agent was never connected and disconnects', () => {
    mockWasAgentEverConnected.mockReturnValue(false)

    renderUseAutoDemoMode(BASE_OPTIONS)

    expect(mockSetDemoMode).toHaveBeenCalledWith(true)
    expect(mockSetDemoMode).toHaveBeenCalledTimes(1)
  })

  it('starts an 8 second timer when the user toggles demo off after disconnect', () => {
    const { rerender } = renderUseAutoDemoMode({
      ...BASE_OPTIONS,
      agentStatus: 'connected',
      isDemoMode: true,
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

  it('cancels the timer and resets user intent when forced demo mode changes', () => {
    const { rerender } = renderUseAutoDemoMode({
      ...BASE_OPTIONS,
      isDemoMode: true,
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

    rerender(BASE_OPTIONS)

    act(() => {
      vi.advanceTimersByTime(AGENT_CONNECT_GRACE_MS)
    })

    expect(mockSetDemoMode).not.toHaveBeenCalled()
  })

  it('disables demo mode when the agent reconnects after auto-enabling it and approvals exist', () => {
    mockWasAgentEverConnected.mockReturnValue(false)
    mockHasApprovedAgents.mockReturnValue(true)

    const { rerender } = renderUseAutoDemoMode(BASE_OPTIONS)

    expect(mockSetDemoMode).toHaveBeenNthCalledWith(1, true)

    rerender({
      ...BASE_OPTIONS,
      agentStatus: 'connected',
      isDemoMode: true,
    })

    expect(mockSetDemoMode).toHaveBeenNthCalledWith(2, false, true)
    expect(mockSetDemoMode).toHaveBeenCalledTimes(2)
  })

  it('does not disable demo mode on connect when agents are not approved', () => {
    mockWasAgentEverConnected.mockReturnValue(false)

    const { rerender } = renderUseAutoDemoMode(BASE_OPTIONS)

    rerender({
      ...BASE_OPTIONS,
      agentStatus: 'connected',
      isDemoMode: true,
    })

    expect(mockSetDemoMode).toHaveBeenCalledTimes(1)
    expect(mockSetDemoMode).toHaveBeenCalledWith(true)
  })

  it('does not start the grace period timer in cluster mode', () => {
    const { rerender } = renderUseAutoDemoMode({
      ...BASE_OPTIONS,
      isInClusterMode: true,
      isDemoMode: true,
    })

    rerender({
      ...BASE_OPTIONS,
      isInClusterMode: true,
      isDemoMode: false,
    })

    act(() => {
      vi.advanceTimersByTime(AGENT_CONNECT_GRACE_MS)
    })

    expect(mockSetDemoMode).not.toHaveBeenCalled()
  })

  it('cleans up the grace period timer on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')

    const { rerender, unmount } = renderUseAutoDemoMode({
      ...BASE_OPTIONS,
      isDemoMode: true,
    })

    rerender({
      ...BASE_OPTIONS,
      isDemoMode: false,
    })

    unmount()

    act(() => {
      vi.advanceTimersByTime(AGENT_CONNECT_GRACE_MS)
    })

    expect(clearTimeoutSpy).toHaveBeenCalled()
    expect(mockSetDemoMode).not.toHaveBeenCalled()

    clearTimeoutSpy.mockRestore()
  })

  it('resets the user-toggled-off state after the grace period fires', () => {
    const { rerender } = renderUseAutoDemoMode({
      ...BASE_OPTIONS,
      isDemoMode: true,
    })

    rerender({
      ...BASE_OPTIONS,
      isDemoMode: false,
    })

    act(() => {
      vi.advanceTimersByTime(AGENT_CONNECT_GRACE_MS)
    })

    expect(mockSetDemoMode).toHaveBeenCalledTimes(1)
    expect(mockSetDemoMode).toHaveBeenCalledWith(true)

    mockSetDemoMode.mockClear()

    rerender({
      ...BASE_OPTIONS,
      isDemoModeForced: true,
    })
    rerender(BASE_OPTIONS)

    act(() => {
      vi.advanceTimersByTime(AGENT_CONNECT_GRACE_MS)
    })

    expect(mockSetDemoMode).not.toHaveBeenCalled()
  })

  it('marks demo mode as user-toggled-off when it is turned off while disconnected', () => {
    const { rerender } = renderUseAutoDemoMode({
      ...BASE_OPTIONS,
      isDemoMode: true,
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

    expect(mockSetDemoMode).toHaveBeenCalledTimes(1)
    expect(mockSetDemoMode).toHaveBeenCalledWith(true)
  })
})
