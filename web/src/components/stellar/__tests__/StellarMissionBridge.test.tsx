/**
 * StellarMissionBridge must not open its own EventSource (#14220).
 * Mission triggers arrive via the shared useStellar SSE + CustomEvent bridge.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { STELLAR_MISSION_TRIGGER_EVENT } from '../../../hooks/useStellar'

const mockStartMission = vi.fn(() => 'mission-1')

vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({
    startMission: mockStartMission,
    missions: [],
  }),
}))

let eventSourceCtorCalls = 0

beforeEach(() => {
  eventSourceCtorCalls = 0
  mockStartMission.mockClear()
  vi.stubGlobal('EventSource', vi.fn(() => {
    eventSourceCtorCalls += 1
    return {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      close: vi.fn(),
      readyState: 0,
      onopen: null,
      onerror: null,
    }
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

import { StellarMissionBridge } from '../StellarMissionBridge'

describe('StellarMissionBridge', () => {
  it('does not construct EventSource', () => {
    render(<StellarMissionBridge />)
    expect(eventSourceCtorCalls).toBe(0)
  })

  it('starts a mission when stellar:mission_trigger is dispatched', async () => {
    render(<StellarMissionBridge />)
    const payload = {
      solveId: 'solve-1',
      eventId: 'evt-1',
      cluster: 'c1',
      namespace: 'ns',
      workload: 'wl',
      reason: 'crash',
      message: 'pod failed',
      title: 'Fix pod',
      prompt: 'repair it',
    }
    await act(async () => {
      window.dispatchEvent(new CustomEvent(STELLAR_MISSION_TRIGGER_EVENT, { detail: payload }))
    })
    expect(mockStartMission).toHaveBeenCalledTimes(1)
    expect(mockStartMission).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Fix pod',
      cluster: 'c1',
      skipReview: true,
    }))
  })
})
