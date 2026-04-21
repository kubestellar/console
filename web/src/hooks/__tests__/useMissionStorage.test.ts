import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock getDemoMode so storage functions are testable without demo mode side effects
const { mockGetDemoMode } = vi.hoisted(() => ({
  mockGetDemoMode: vi.fn(() => false),
}))

vi.mock('../useDemoMode', () => ({
  getDemoMode: mockGetDemoMode,
}))

vi.mock('../../mocks/demoMissions', () => ({
  DEMO_MISSIONS: [
    {
      id: 'demo-1',
      title: 'Demo mission',
      description: 'A demo',
      type: 'troubleshoot',
      status: 'completed',
      messages: [],
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    },
  ],
}))

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
} from '../useMissionStorage'
import type { Mission } from '../useMissionTypes'

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'mission-1',
    title: 'Test',
    description: 'Test mission',
    type: 'troubleshoot',
    status: 'completed',
    messages: [],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  mockGetDemoMode.mockReturnValue(false)
})

describe('loadMissions', () => {
  it('returns empty array when nothing stored and not in demo mode', () => {
    expect(loadMissions()).toEqual([])
  })

  it('returns parsed missions from localStorage', () => {
    const mission = makeMission()
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify([mission]))
    const result = loadMissions()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('mission-1')
  })

  it('converts date strings to Date objects', () => {
    const mission = makeMission()
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify([mission]))
    const [loaded] = loadMissions()
    expect(loaded.createdAt).toBeInstanceOf(Date)
    expect(loaded.updatedAt).toBeInstanceOf(Date)
  })

  it('marks running missions for reconnection', () => {
    const mission = makeMission({ status: 'running' })
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify([mission]))
    const [loaded] = loadMissions()
    expect(loaded.currentStep).toBe('Reconnecting...')
    expect((loaded.context as Record<string, unknown>)?.needsReconnect).toBe(true)
  })

  it('fails pending missions (cannot be resumed after reload)', () => {
    const mission = makeMission({ status: 'pending' })
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify([mission]))
    const [loaded] = loadMissions()
    expect(loaded.status).toBe('failed')
  })

  it('fails cancelling missions after reload', () => {
    const mission = makeMission({ status: 'cancelling' })
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify([mission]))
    const [loaded] = loadMissions()
    expect(loaded.status).toBe('failed')
  })

  it('clears storage and returns empty on malformed JSON', () => {
    localStorage.setItem(MISSIONS_STORAGE_KEY, 'not-valid-json{{{')
    const result = loadMissions()
    expect(result).toEqual([])
    expect(localStorage.getItem(MISSIONS_STORAGE_KEY)).toBeNull()
  })

  it('returns demo missions in demo mode when storage is empty', () => {
    mockGetDemoMode.mockReturnValue(true)
    const result = loadMissions()
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('saveMissions', () => {
  it('saves missions to localStorage', () => {
    const missions = [makeMission()]
    saveMissions(missions)
    const stored = localStorage.getItem(MISSIONS_STORAGE_KEY)
    expect(stored).toBeTruthy()
    expect(JSON.parse(stored!)[0].id).toBe('mission-1')
  })

  it('prunes old completed missions when quota exceeded', () => {
    const active = makeMission({ id: 'active', status: 'running' })
    const old = makeMission({ id: 'old', status: 'completed', updatedAt: new Date('2025-01-01') })

    const quotaError = Object.assign(new DOMException('QuotaExceededError'), { name: 'QuotaExceededError', code: 22 })
    let callCount = 0
    vi.spyOn(window.localStorage, 'setItem').mockImplementation((...args) => {
      callCount++
      if (callCount === 1) throw quotaError
      // allow subsequent calls
      Object.getPrototypeOf(window.localStorage).setItem.apply(window.localStorage, args)
    })

    expect(() => saveMissions([active, old])).not.toThrow()
    vi.restoreAllMocks()
  })
})

describe('loadUnreadMissionIds / saveUnreadMissionIds', () => {
  it('returns empty Set when nothing stored', () => {
    expect(loadUnreadMissionIds().size).toBe(0)
  })

  it('round-trips a set of IDs', () => {
    const ids = new Set(['m1', 'm2', 'm3'])
    saveUnreadMissionIds(ids)
    const loaded = loadUnreadMissionIds()
    expect(loaded.has('m1')).toBe(true)
    expect(loaded.has('m2')).toBe(true)
    expect(loaded.size).toBe(3)
  })

  it('returns empty Set for malformed JSON', () => {
    localStorage.setItem(UNREAD_MISSIONS_KEY, 'not-json')
    expect(loadUnreadMissionIds().size).toBe(0)
  })

  it('returns empty Set when stored value is not an array', () => {
    localStorage.setItem(UNREAD_MISSIONS_KEY, JSON.stringify({ ids: ['m1'] }))
    expect(loadUnreadMissionIds().size).toBe(0)
  })
})

describe('mergeMissions', () => {
  it('returns remote missions when prev is empty', () => {
    const remote = [makeMission({ id: 'r1' })]
    expect(mergeMissions([], remote)).toHaveLength(1)
  })

  it('prefers newer remote mission over older local', () => {
    const local = makeMission({ id: 'm1', updatedAt: new Date('2026-01-01') })
    const remote = makeMission({ id: 'm1', title: 'Updated', updatedAt: new Date('2026-06-01') })
    const result = mergeMissions([local], [remote])
    expect(result[0].title).toBe('Updated')
  })

  it('keeps local mission when it is newer', () => {
    const local = makeMission({ id: 'm1', title: 'Local', updatedAt: new Date('2026-06-01') })
    const remote = makeMission({ id: 'm1', title: 'Remote', updatedAt: new Date('2026-01-01') })
    const result = mergeMissions([local], [remote])
    expect(result[0].title).toBe('Local')
  })

  it('drops inactive local missions not in remote', () => {
    const local = makeMission({ id: 'inactive', status: 'completed' })
    const result = mergeMissions([local], [])
    expect(result).toHaveLength(0)
  })

  it('keeps active local missions not in remote', () => {
    const local = makeMission({ id: 'active', status: 'running' })
    const result = mergeMissions([local], [])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('active')
  })

  it('appends remote-only missions not in prev', () => {
    const local = makeMission({ id: 'm1' })
    const remote = makeMission({ id: 'm2' })
    const result = mergeMissions([local], [remote])
    const ids = result.map(m => m.id)
    expect(ids).toContain('m2')
  })
})

describe('getSelectedKagentiAgentFromStorage', () => {
  it('returns null when nothing stored', () => {
    expect(getSelectedKagentiAgentFromStorage()).toBeNull()
  })

  it('parses namespace/name format correctly', () => {
    localStorage.setItem(KAGENTI_SELECTED_AGENT_KEY, 'default/my-agent')
    const result = getSelectedKagentiAgentFromStorage()
    expect(result).toEqual({ namespace: 'default', name: 'my-agent' })
  })

  it('returns null for invalid format (no slash)', () => {
    localStorage.setItem(KAGENTI_SELECTED_AGENT_KEY, 'just-name')
    expect(getSelectedKagentiAgentFromStorage()).toBeNull()
  })

  it('returns null for empty stored value', () => {
    localStorage.setItem(KAGENTI_SELECTED_AGENT_KEY, '')
    expect(getSelectedKagentiAgentFromStorage()).toBeNull()
  })
})
