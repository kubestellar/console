import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  loadMissions,
  saveMissions,
  loadUnreadMissionIds,
  saveUnreadMissionIds,
  mergeMissions,
  getSelectedKagentiAgentFromStorage,
  MISSIONS_STORAGE_KEY,
  UNREAD_MISSIONS_KEY,
  KAGENTI_SELECTED_AGENT_KEY,
  MAX_COMPLETED_MISSIONS,
  DEMO_MISSIONS_AS_MISSIONS,
} from './useMissionStorage'
import type { Mission } from './useMissionTypes'

vi.mock('./useDemoMode', () => ({
  getDemoMode: vi.fn(() => false),
}))

vi.mock('../mocks/demoMissions', () => ({
  DEMO_MISSIONS: [],
}))

import { getDemoMode } from './useDemoMode'

const mockGetDemoMode = vi.mocked(getDemoMode)

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: `mission-${Math.random().toString(36).slice(2)}`,
    title: 'Test mission',
    description: 'A test mission',
    status: 'completed',
    type: 'chat',
    messages: [],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T01:00:00Z'),
    ...overrides,
  } as Mission
}

beforeEach(() => {
  localStorage.clear()
  mockGetDemoMode.mockReturnValue(false)
  vi.clearAllMocks()
})

afterEach(() => {
  localStorage.clear()
})

// ── loadMissions ────────────────────────────────────────────────────────────

describe('loadMissions', () => {
  it('returns [] when localStorage is empty', () => {
    expect(loadMissions()).toEqual([])
  })

  it('returns demo missions when demo mode is on and storage is empty', () => {
    mockGetDemoMode.mockReturnValue(true)
    const result = loadMissions()
    expect(result).toBe(DEMO_MISSIONS_AS_MISSIONS)
  })

  it('parses stored missions and converts date strings to Date objects', () => {
    const mission = makeMission({ status: 'completed' })
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify([mission]))

    const result = loadMissions()
    expect(result).toHaveLength(1)
    expect(result[0].createdAt).toBeInstanceOf(Date)
    expect(result[0].updatedAt).toBeInstanceOf(Date)
    expect(result[0].messages[0]?.timestamp).toBeUndefined() // no messages
  })

  it('converts message timestamps to Date objects', () => {
    const mission = makeMission({
      messages: [{ id: 'msg-1', role: 'user', content: 'hi', timestamp: new Date('2024-01-01T00:00:00Z') as unknown as Date }],
    })
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify([mission]))

    const result = loadMissions()
    expect(result[0].messages[0].timestamp).toBeInstanceOf(Date)
  })

  it('marks running missions as needsReconnect', () => {
    const mission = makeMission({ status: 'running', currentStep: 'doing stuff' })
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify([mission]))

    const result = loadMissions()
    expect(result[0].context?.needsReconnect).toBe(true)
    expect(result[0].currentStep).toBe('Reconnecting...')
  })

  it('marks waiting_input missions as needsReconnect', () => {
    const mission = makeMission({ status: 'waiting_input' })
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify([mission]))

    const result = loadMissions()
    expect(result[0].context?.needsReconnect).toBe(true)
  })

  it('converts pending missions to failed with a retry message', () => {
    const mission = makeMission({ status: 'pending' })
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify([mission]))

    const result = loadMissions()
    expect(result[0].status).toBe('failed')
    expect(result[0].currentStep).toBeUndefined()
    expect(result[0].messages.some(m => m.content.includes('reloaded'))).toBe(true)
  })

  it('converts cancelling missions to failed', () => {
    const mission = makeMission({ status: 'cancelling' })
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify([mission]))

    const result = loadMissions()
    expect(result[0].status).toBe('failed')
    expect(result[0].messages.some(m => m.content.includes('cancelled'))).toBe(true)
  })

  it('returns [] and clears storage on malformed JSON', () => {
    localStorage.setItem(MISSIONS_STORAGE_KEY, 'not-valid-json{{{')
    const result = loadMissions()
    expect(result).toEqual([])
    expect(localStorage.getItem(MISSIONS_STORAGE_KEY)).toBeNull()
  })

  it('returns demo missions after clearing corrupted storage when demo mode is on', () => {
    mockGetDemoMode.mockReturnValue(true)
    localStorage.setItem(MISSIONS_STORAGE_KEY, 'bad json')
    // After parse failure + clear, getDemoMode() is re-checked
    mockGetDemoMode.mockReturnValue(true)
    const result = loadMissions()
    expect(result).toBe(DEMO_MISSIONS_AS_MISSIONS)
  })

  it('replaces stale demo missions with fresh ones in demo mode', () => {
    mockGetDemoMode.mockReturnValue(true)
    const staleDemo = [{ id: 'demo-1', title: 'old' }]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(staleDemo))

    const result = loadMissions()
    expect(result).toBe(DEMO_MISSIONS_AS_MISSIONS)
  })

  it('leaves non-demo missions untouched when demo mode is on', () => {
    mockGetDemoMode.mockReturnValue(true)
    const real = makeMission({ id: 'real-mission', status: 'completed' })
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify([real]))

    const result = loadMissions()
    expect(result[0].id).toBe('real-mission')
  })
})

// ── saveMissions ────────────────────────────────────────────────────────────

describe('saveMissions', () => {
  it('saves missions to localStorage', () => {
    const mission = makeMission()
    saveMissions([mission])
    const stored = JSON.parse(localStorage.getItem(MISSIONS_STORAGE_KEY)!)
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe(mission.id)
  })

  it('prunes completed missions on QuotaExceededError and retries', () => {
    const active = makeMission({ status: 'running' })
    const saved = makeMission({ status: 'saved' })
    const old = makeMission({ status: 'completed', updatedAt: new Date('2020-01-01') })
    const recent = makeMission({ status: 'completed', updatedAt: new Date('2024-01-01') })

    let callCount = 0
    const setItemSpy = vi.spyOn(localStorage, 'setItem')
    setItemSpy.mockImplementation((key, _value) => {
      if (key === MISSIONS_STORAGE_KEY && callCount++ === 0) {
        const err = new DOMException('QuotaExceededError')
        Object.defineProperty(err, 'name', { value: 'QuotaExceededError' })
        throw err
      }
    })

    saveMissions([active, saved, old, recent])

    // Second call should have happened with pruned list
    expect(setItemSpy).toHaveBeenCalledTimes(2)
    setItemSpy.mockRestore()
  })

  it('strips messages from completed missions when still full after count-pruning', () => {
    const completed = makeMission({
      status: 'completed',
      messages: [
        { id: 'm1', role: 'user' as const, content: 'a', timestamp: new Date() },
        { id: 'm2', role: 'user' as const, content: 'b', timestamp: new Date() },
        { id: 'm3', role: 'user' as const, content: 'c', timestamp: new Date() },
        { id: 'm4', role: 'user' as const, content: 'd', timestamp: new Date() },
      ],
    })

    let callCount = 0
    const setItemSpy = vi.spyOn(localStorage, 'setItem')
    setItemSpy.mockImplementation((key, _value) => {
      if (key === MISSIONS_STORAGE_KEY && callCount++ < 2) {
        const err = new DOMException('QuotaExceededError')
        Object.defineProperty(err, 'name', { value: 'QuotaExceededError' })
        throw err
      }
    })

    saveMissions([completed])
    expect(setItemSpy).toHaveBeenCalledTimes(3)
    setItemSpy.mockRestore()
  })

  it('clears storage as last resort when all retries fail', () => {
    const removeItemSpy = vi.spyOn(localStorage, 'removeItem')
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation((key) => {
      if (key === MISSIONS_STORAGE_KEY) {
        const err = new DOMException('QuotaExceededError')
        Object.defineProperty(err, 'name', { value: 'QuotaExceededError' })
        throw err
      }
    })

    saveMissions([makeMission({ status: 'completed' })])
    expect(removeItemSpy).toHaveBeenCalledWith(MISSIONS_STORAGE_KEY)
    setItemSpy.mockRestore()
    removeItemSpy.mockRestore()
  })

  it('handles non-quota errors gracefully', () => {
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation((key) => {
      if (key === MISSIONS_STORAGE_KEY) throw new Error('random error')
    })
    expect(() => saveMissions([makeMission()])).not.toThrow()
    setItemSpy.mockRestore()
  })
})

// ── loadUnreadMissionIds / saveUnreadMissionIds ─────────────────────────────

describe('loadUnreadMissionIds', () => {
  it('returns empty Set when nothing stored', () => {
    expect(loadUnreadMissionIds()).toEqual(new Set())
  })

  it('round-trips ids through localStorage', () => {
    const ids = new Set(['a', 'b', 'c'])
    saveUnreadMissionIds(ids)
    expect(loadUnreadMissionIds()).toEqual(ids)
  })

  it('returns empty Set for malformed JSON', () => {
    localStorage.setItem(UNREAD_MISSIONS_KEY, 'bad')
    expect(loadUnreadMissionIds()).toEqual(new Set())
  })

  it('returns empty Set when stored value is not an array', () => {
    localStorage.setItem(UNREAD_MISSIONS_KEY, JSON.stringify({ not: 'array' }))
    expect(loadUnreadMissionIds()).toEqual(new Set())
  })
})

describe('saveUnreadMissionIds', () => {
  it('saves ids to localStorage', () => {
    saveUnreadMissionIds(new Set(['x', 'y']))
    const stored = JSON.parse(localStorage.getItem(UNREAD_MISSIONS_KEY)!)
    expect(stored).toContain('x')
    expect(stored).toContain('y')
  })

  it('handles localStorage write errors gracefully', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage full')
    })
    expect(() => saveUnreadMissionIds(new Set(['a']))).not.toThrow()
    spy.mockRestore()
  })
})

// ── mergeMissions ───────────────────────────────────────────────────────────

describe('mergeMissions', () => {
  it('keeps active prev missions when reloaded is empty', () => {
    const prev = [makeMission({ status: 'running', id: 'a' })]
    const result = mergeMissions(prev, [])
    expect(result).toHaveLength(1)
  })

  it('adds new remote missions not in prev', () => {
    const prev = [makeMission({ id: 'a', status: 'completed' })]
    const remote = [makeMission({ id: 'b', status: 'completed' })]
    const result = mergeMissions(prev, remote)
    expect(result.map(m => m.id)).toContain('b')
  })

  it('prefers remote mission when remote is newer', () => {
    const local = makeMission({ id: 'x', status: 'completed', updatedAt: new Date('2024-01-01') })
    const remote = makeMission({ id: 'x', status: 'failed', updatedAt: new Date('2024-01-02') })
    const result = mergeMissions([local], [remote])
    expect(result[0].status).toBe('failed')
  })

  it('prefers local mission when local is newer', () => {
    const local = makeMission({ id: 'x', status: 'completed', updatedAt: new Date('2024-01-02') })
    const remote = makeMission({ id: 'x', status: 'failed', updatedAt: new Date('2024-01-01') })
    const result = mergeMissions([local], [remote])
    expect(result[0].status).toBe('completed')
  })

  it('drops local inactive missions not in reloaded', () => {
    const local = makeMission({ id: 'old', status: 'completed' })
    const result = mergeMissions([local], [])
    // completed is in INACTIVE_MISSION_STATUSES — should be dropped
    expect(result.find(m => m.id === 'old')).toBeUndefined()
  })

  it('keeps local active missions not in reloaded', () => {
    const local = makeMission({ id: 'active', status: 'running' })
    const result = mergeMissions([local], [])
    expect(result.find(m => m.id === 'active')).toBeDefined()
  })

  it(`caps inactive missions at ${MAX_COMPLETED_MISSIONS} after merge`, () => {
    const manyCompleted: Mission[] = Array.from({ length: MAX_COMPLETED_MISSIONS + 10 }, (_, i) =>
      makeMission({ id: `c${i}`, status: 'completed', updatedAt: new Date(2024, 0, i + 1) })
    )
    const result = mergeMissions([], manyCompleted)
    const inactive = result.filter(m => m.status === 'completed')
    expect(inactive.length).toBeLessThanOrEqual(MAX_COMPLETED_MISSIONS)
  })

  it('handles both prev and reloaded being empty', () => {
    expect(mergeMissions([], [])).toEqual([])
  })
})

// ── getSelectedKagentiAgentFromStorage ──────────────────────────────────────

describe('getSelectedKagentiAgentFromStorage', () => {
  it('returns null when nothing is stored', () => {
    expect(getSelectedKagentiAgentFromStorage()).toBeNull()
  })

  it('parses namespace/name correctly', () => {
    localStorage.setItem(KAGENTI_SELECTED_AGENT_KEY, 'my-ns/my-agent')
    expect(getSelectedKagentiAgentFromStorage()).toEqual({ namespace: 'my-ns', name: 'my-agent' })
  })

  it('returns null when value has no slash', () => {
    localStorage.setItem(KAGENTI_SELECTED_AGENT_KEY, 'no-slash')
    expect(getSelectedKagentiAgentFromStorage()).toBeNull()
  })

  it('returns null when namespace part is empty', () => {
    localStorage.setItem(KAGENTI_SELECTED_AGENT_KEY, '/name-only')
    expect(getSelectedKagentiAgentFromStorage()).toBeNull()
  })

  it('returns null when name part is empty', () => {
    localStorage.setItem(KAGENTI_SELECTED_AGENT_KEY, 'ns-only/')
    expect(getSelectedKagentiAgentFromStorage()).toBeNull()
  })

  it('handles localStorage read errors gracefully', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('private mode') })
    expect(getSelectedKagentiAgentFromStorage()).toBeNull()
    vi.restoreAllMocks()
  })
})
