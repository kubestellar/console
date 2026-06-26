import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const {
  mockIsAuthenticated,
  mockIsDemoMode,
  mockMissions,
  mockRunSavedMission,
  mockShowToast,
  mockEmitOrbitMissionRun,
} = vi.hoisted(() => ({
  mockIsAuthenticated: vi.fn(() => true),
  mockIsDemoMode: vi.fn(() => false),
  mockMissions: vi.fn(() => [] as unknown[]),
  mockRunSavedMission: vi.fn(),
  mockShowToast: vi.fn(),
  mockEmitOrbitMissionRun: vi.fn(),
}))

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated() }),
}))

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../useMissions', () => ({
  useMissions: () => ({
    missions: mockMissions(),
    runSavedMission: mockRunSavedMission,
  }),
}))

vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('../../lib/analytics', () => ({
  emitOrbitMissionRun: mockEmitOrbitMissionRun,
}))

import { useOrbitAutoRun } from '../useOrbitAutoRun'

function makeOrbitMission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'orbit-1',
    title: 'Health Check',
    status: 'saved',
    importedFrom: { missionClass: 'orbit' },
    context: {
      orbitConfig: {
        cadence: 'daily',
        orbitType: 'health-check',
        autoRun: true,
        lastRunAt: new Date(Date.now() - 25 * 3_600_000).toISOString(),
      },
    },
    ...overrides,
  }
}

describe('useOrbitAutoRun', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockIsAuthenticated.mockReturnValue(true)
    mockIsDemoMode.mockReturnValue(false)
    mockMissions.mockReturnValue([])
    mockRunSavedMission.mockClear()
    mockShowToast.mockClear()
    mockEmitOrbitMissionRun.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not run for unauthenticated users', () => {
    mockIsAuthenticated.mockReturnValue(false)
    mockMissions.mockReturnValue([makeOrbitMission()])
    renderHook(() => useOrbitAutoRun())
    expect(mockRunSavedMission).not.toHaveBeenCalled()
  })

  it('does not run in demo mode', () => {
    mockIsDemoMode.mockReturnValue(true)
    mockMissions.mockReturnValue([makeOrbitMission()])
    renderHook(() => useOrbitAutoRun())
    expect(mockRunSavedMission).not.toHaveBeenCalled()
  })

  it('auto-runs a due orbit mission with autoRun enabled', () => {
    mockMissions.mockReturnValue([makeOrbitMission()])
    renderHook(() => useOrbitAutoRun())
    expect(mockRunSavedMission).toHaveBeenCalledWith('orbit-1')
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('Health Check'),
      'info',
    )
    expect(mockEmitOrbitMissionRun).toHaveBeenCalledWith('health-check', 'auto')
  })

  it('does not run when autoRun is disabled', () => {
    const mission = makeOrbitMission()
    ;(mission.context.orbitConfig as Record<string, unknown>).autoRun = false
    mockMissions.mockReturnValue([mission])
    renderHook(() => useOrbitAutoRun())
    expect(mockRunSavedMission).not.toHaveBeenCalled()
  })

  it('does not run when mission is not yet due', () => {
    const mission = makeOrbitMission()
    ;(mission.context.orbitConfig as Record<string, unknown>).lastRunAt = new Date(Date.now() - 12 * 3_600_000).toISOString()
    mockMissions.mockReturnValue([mission])
    renderHook(() => useOrbitAutoRun())
    expect(mockRunSavedMission).not.toHaveBeenCalled()
  })

  it('triggers different missions independently (dedup is per-ID)', () => {
    // orbit-dedup-a triggers on first render
    mockMissions.mockReturnValue([makeOrbitMission({ id: 'orbit-dedup-a', title: 'Check A' })])
    renderHook(() => useOrbitAutoRun())
    expect(mockRunSavedMission).toHaveBeenCalledWith('orbit-dedup-a')

    // orbit-dedup-b triggers independently
    mockRunSavedMission.mockClear()
    mockMissions.mockReturnValue([makeOrbitMission({ id: 'orbit-dedup-b', title: 'Check B' })])
    renderHook(() => useOrbitAutoRun())
    expect(mockRunSavedMission).toHaveBeenCalledWith('orbit-dedup-b')
  })

  it('skips non-orbit missions', () => {
    mockMissions.mockReturnValue([{
      id: 'install-1',
      title: 'Install Something',
      status: 'saved',
      importedFrom: { missionClass: 'install' },
      context: {},
    }])
    renderHook(() => useOrbitAutoRun())
    expect(mockRunSavedMission).not.toHaveBeenCalled()
  })

  it('skips missions that are not in saved status', () => {
    mockMissions.mockReturnValue([makeOrbitMission({ status: 'running' })])
    renderHook(() => useOrbitAutoRun())
    expect(mockRunSavedMission).not.toHaveBeenCalled()
  })
})
