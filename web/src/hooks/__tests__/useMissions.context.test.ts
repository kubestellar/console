import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('./useMissionTypes', () => ({
  INACTIVE_MISSION_STATUSES: ['completed', 'failed', 'cancelled'],
  isActiveMission: (m: { status: string }) => !['completed', 'failed', 'cancelled'].includes(m.status),
}))

import { generateRequestId, useMissions, MissionContext } from '../useMissions.context'

// ---------------------------------------------------------------------------
// generateRequestId
// ---------------------------------------------------------------------------

describe('generateRequestId', () => {
  it('returns a string with the default prefix', () => {
    const id = generateRequestId()
    expect(id).toMatch(/^claude-\d+-\d+-[a-f0-9]{6}$/)
  })

  it('uses a custom prefix', () => {
    const id = generateRequestId('mission')
    expect(id.startsWith('mission-')).toBe(true)
  })

  it('generates unique IDs on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()))
    expect(ids.size).toBe(100)
  })

  it('includes a monotonic counter component', () => {
    const id1 = generateRequestId()
    const id2 = generateRequestId()
    const counter1 = parseInt(id1.split('-')[2], 10)
    const counter2 = parseInt(id2.split('-')[2], 10)
    expect(counter2).toBeGreaterThan(counter1)
  })
})

// ---------------------------------------------------------------------------
// useMissions — fallback behavior
// ---------------------------------------------------------------------------

describe('useMissions', () => {
  it('returns a safe fallback when called outside MissionProvider', () => {
    const { result } = renderHook(() => useMissions())
    expect(result.current.missions).toEqual([])
    expect(result.current.activeMission).toBeNull()
    expect(result.current.isAIDisabled).toBe(true)
    expect(result.current.isSidebarOpen).toBe(false)
    expect(result.current.agents).toEqual([])
    expect(result.current.unreadMissionCount).toBe(0)
  })

  it('fallback actions are no-ops', () => {
    const { result } = renderHook(() => useMissions())
    expect(result.current.startMission({ prompt: 'test' } as never)).toBe('')
    expect(result.current.editAndResend('id', 'msg')).toBeNull()
    expect(() => result.current.dismissMission('id')).not.toThrow()
    expect(() => result.current.toggleSidebar()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// MissionContext
// ---------------------------------------------------------------------------

describe('MissionContext', () => {
  it('is exported and can be used as a React context', () => {
    expect(MissionContext).toBeDefined()
    expect(MissionContext.Provider).toBeDefined()
  })
})
