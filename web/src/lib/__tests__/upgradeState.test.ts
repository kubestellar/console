import { describe, it, expect, beforeEach } from 'vitest'
import { getUpgradeState, setUpgradeState, subscribeUpgradeState } from '../upgradeState'

beforeEach(() => {
  // Reset to idle before each test
  setUpgradeState({ phase: 'idle' })
})

describe('getUpgradeState', () => {
  it('returns idle phase by default', () => {
    expect(getUpgradeState().phase).toBe('idle')
  })

  it('reflects the last set state', () => {
    setUpgradeState({ phase: 'triggering' })
    expect(getUpgradeState().phase).toBe('triggering')
  })
})

describe('setUpgradeState', () => {
  it('updates the current state', () => {
    setUpgradeState({ phase: 'restarting' })
    expect(getUpgradeState().phase).toBe('restarting')
  })

  it('includes errorMessage when set', () => {
    setUpgradeState({ phase: 'error', errorMessage: 'timeout' })
    const state = getUpgradeState()
    expect(state.phase).toBe('error')
    expect(state.errorMessage).toBe('timeout')
  })

  it('notifies subscribers on state change', () => {
    const received: string[] = []
    const unsub = subscribeUpgradeState((s) => received.push(s.phase))
    setUpgradeState({ phase: 'complete' })
    unsub()
    expect(received).toContain('complete')
  })

  it('notifies multiple subscribers', () => {
    const a: string[] = []
    const b: string[] = []
    const u1 = subscribeUpgradeState((s) => a.push(s.phase))
    const u2 = subscribeUpgradeState((s) => b.push(s.phase))
    setUpgradeState({ phase: 'restarting' })
    u1()
    u2()
    expect(a).toContain('restarting')
    expect(b).toContain('restarting')
  })
})

describe('subscribeUpgradeState', () => {
  it('returns an unsubscribe function', () => {
    const unsub = subscribeUpgradeState(() => {})
    expect(typeof unsub).toBe('function')
    unsub()
  })

  it('unsubscribed listener does not receive future updates', () => {
    const calls: string[] = []
    const unsub = subscribeUpgradeState((s) => calls.push(s.phase))
    unsub()
    setUpgradeState({ phase: 'complete' })
    expect(calls).toHaveLength(0)
  })
})
