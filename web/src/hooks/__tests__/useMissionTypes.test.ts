import { describe, it, expect } from 'vitest'
import { isActiveMission, INACTIVE_MISSION_STATUSES } from '../useMissionTypes'
import type { MissionStatus } from '../useMissionTypes'

describe('INACTIVE_MISSION_STATUSES', () => {
  it('contains saved, completed, failed, cancelled', () => {
    expect(INACTIVE_MISSION_STATUSES.has('saved')).toBe(true)
    expect(INACTIVE_MISSION_STATUSES.has('completed')).toBe(true)
    expect(INACTIVE_MISSION_STATUSES.has('failed')).toBe(true)
    expect(INACTIVE_MISSION_STATUSES.has('cancelled')).toBe(true)
  })

  it('does not contain active statuses', () => {
    const activeStatuses: MissionStatus[] = ['pending', 'running', 'waiting_input', 'blocked', 'cancelling']
    for (const status of activeStatuses) {
      expect(INACTIVE_MISSION_STATUSES.has(status)).toBe(false)
    }
  })
})

describe('isActiveMission', () => {
  it('returns false for saved missions', () => {
    expect(isActiveMission({ status: 'saved' })).toBe(false)
  })

  it('returns false for completed missions', () => {
    expect(isActiveMission({ status: 'completed' })).toBe(false)
  })

  it('returns false for failed missions', () => {
    expect(isActiveMission({ status: 'failed' })).toBe(false)
  })

  it('returns false for cancelled missions', () => {
    expect(isActiveMission({ status: 'cancelled' })).toBe(false)
  })

  it('returns true for pending missions', () => {
    expect(isActiveMission({ status: 'pending' })).toBe(true)
  })

  it('returns true for running missions', () => {
    expect(isActiveMission({ status: 'running' })).toBe(true)
  })

  it('returns true for waiting_input missions', () => {
    expect(isActiveMission({ status: 'waiting_input' })).toBe(true)
  })

  it('returns true for blocked missions', () => {
    expect(isActiveMission({ status: 'blocked' })).toBe(true)
  })

  it('returns true for cancelling missions', () => {
    expect(isActiveMission({ status: 'cancelling' })).toBe(true)
  })
})
