import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock useMissions before importing the hook
const mockStartMission = vi.fn(() => 'mission-123')
const mockSendMessage = vi.fn()
// Mutable missions store — completeMission() replaces this with a new array
// so that React detects a reference change and re-triggers the useEffect
// that drives the diagnosing → proposing-repair transition (#7290).
let mockMissionsStore: Array<{ id: string; status: string }> = []

vi.mock('../useMissions', () => ({
  useMissions: vi.fn(() => ({
    startMission: mockStartMission,
    sendMessage: mockSendMessage,
    get missions() { return mockMissionsStore },
    activeMission: null,
    isSidebarOpen: false,
    agents: [],
    selectedAgent: null,
    defaultAgent: null,
  })),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
  }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    FETCH_DEFAULT_TIMEOUT_MS: 10000,
  }
})

import { useDiagnoseRepairLoop } from '../useDiagnoseRepairLoop'
import type { MonitoredResource, MonitorIssue } from '../../types/workloadMonitor'

function makeResource(overrides: Partial<MonitoredResource> = {}): MonitoredResource {
  return {
    id: 'Deployment/default/test-app',
    kind: 'Deployment',
    name: 'test-app',
    namespace: 'default',
    cluster: 'cluster-1',
    status: 'unhealthy',
    category: 'workload',
    message: 'Pod crash looping',
    lastChecked: new Date().toISOString(),
    optional: false,
    order: 0,
    ...overrides,
  }
}

function makeIssue(overrides: Partial<MonitorIssue> = {}): MonitorIssue {
  return {
    id: 'issue-1',
    resource: makeResource(),
    severity: 'critical',
    title: 'Pod CrashLoopBackOff',
    description: 'Container is crash looping',
    detectedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('useDiagnoseRepairLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockMissionsStore = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * Simulate mission completion so the useEffect in useDiagnoseRepairLoop
   * sees a terminal status and transitions from diagnosing to proposing-repair
   * (or complete for non-repairable mode). After #7290, phase transitions are
   * driven by mission status, not a fixed 3s timer.
   *
   * Assigns a new array reference so React detects the dependency change.
   */
  function completeMission(hook: { rerender: () => void }) {
    mockMissionsStore = [{ id: 'mission-123', status: 'completed' }]
    hook.rerender()
  }

  it('returns expected shape with all methods and state', () => {
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'pod-crash' })
    )
    expect(result.current).toHaveProperty('state')
    expect(result.current).toHaveProperty('startDiagnose')
    expect(result.current).toHaveProperty('approveRepair')
    expect(result.current).toHaveProperty('approveAllRepairs')
    expect(result.current).toHaveProperty('executeRepairs')
    expect(result.current).toHaveProperty('reset')
    expect(result.current).toHaveProperty('cancel')
  })

  it('initializes with idle phase and empty arrays', () => {
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'workload' })
    )
    expect(result.current.state.phase).toBe('idle')
    expect(result.current.state.issuesFound).toEqual([])
    expect(result.current.state.proposedRepairs).toEqual([])
    expect(result.current.state.completedRepairs).toEqual([])
    expect(result.current.state.loopCount).toBe(0)
  })

  it('uses default maxLoops of 3 when not specified', () => {
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'workload' })
    )
    expect(result.current.state.maxLoops).toBe(3)
  })

  it('accepts custom maxLoops', () => {
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'workload', maxLoops: 5 })
    )
    expect(result.current.state.maxLoops).toBe(5)
  })

  it('startDiagnose transitions to scanning then diagnosing', () => {
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'workload' })
    )
    const resources = [makeResource()]
    const issues = [makeIssue()]

    act(() => {
      result.current.startDiagnose(resources, issues, { cluster: 'test' })
    })
    // After startDiagnose, it transitions through scanning to diagnosing
    expect(result.current.state.phase).toBe('diagnosing')
    expect(result.current.state.issuesFound).toEqual(issues)
  })

  it('startDiagnose calls startMission with appropriate prompt', () => {
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'llm-d' })
    )
    const resources = [makeResource()]
    const issues = [makeIssue()]

    act(() => {
      result.current.startDiagnose(resources, issues, { cluster: 'test' })
    })
    expect(mockStartMission).toHaveBeenCalledTimes(1)
    const callArgs = mockStartMission.mock.calls[0][0]
    expect(callArgs.title).toBe('llm-d Diagnosis')
    expect(callArgs.type).toBe('troubleshoot')
    expect(callArgs.initialPrompt).toContain('llm-d')
  })

  it('transitions to proposing-repair when mission completes (repairable)', () => {
    const hook = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'workload', repairable: true })
    )
    const resources = [makeResource()]
    const issues = [makeIssue()]

    act(() => {
      hook.result.current.startDiagnose(resources, issues, {})
    })
    expect(hook.result.current.state.phase).toBe('diagnosing')

    act(() => {
      completeMission(hook)
    })
    expect(hook.result.current.state.phase).toBe('proposing-repair')
    expect(hook.result.current.state.proposedRepairs.length).toBe(1)
  })

  it('transitions to complete when mission completes (not repairable)', () => {
    const hook = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'workload', repairable: false })
    )

    act(() => {
      hook.result.current.startDiagnose([makeResource()], [makeIssue()], {})
    })

    act(() => {
      completeMission(hook)
    })
    expect(hook.result.current.state.phase).toBe('complete')
    expect(hook.result.current.state.proposedRepairs).toEqual([])
  })

  it('approveRepair marks specific repair as approved', () => {
    const hook = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'workload' })
    )

    act(() => {
      hook.result.current.startDiagnose(
        [makeResource()],
        [makeIssue({ id: 'issue-A' }), makeIssue({ id: 'issue-B' })],
        {}
      )
    })
    act(() => { completeMission(hook) })

    const firstRepairId = hook.result.current.state.proposedRepairs[0].id
    act(() => {
      hook.result.current.approveRepair(firstRepairId)
    })

    expect(hook.result.current.state.phase).toBe('awaiting-approval')
    const approved = hook.result.current.state.proposedRepairs.find(r => r.id === firstRepairId)
    expect(approved?.approved).toBe(true)

    // Second repair should still be unapproved
    const second = hook.result.current.state.proposedRepairs.find(r => r.id !== firstRepairId)
    expect(second?.approved).toBe(false)
  })

  it('approveAllRepairs marks all repairs as approved', () => {
    const hook = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'workload' })
    )

    act(() => {
      hook.result.current.startDiagnose(
        [makeResource()],
        [makeIssue({ id: 'issue-1' }), makeIssue({ id: 'issue-2' })],
        {}
      )
    })
    act(() => { completeMission(hook) })

    act(() => {
      hook.result.current.approveAllRepairs()
    })

    expect(hook.result.current.state.phase).toBe('awaiting-approval')
    expect(hook.result.current.state.proposedRepairs.every(r => r.approved)).toBe(true)
  })

  it('executeRepairs does nothing when no repairs are approved', () => {
    const hook = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'workload' })
    )

    act(() => {
      hook.result.current.startDiagnose([makeResource()], [makeIssue()], {})
    })
    act(() => { completeMission(hook) })

    // Don't approve any repairs
    act(() => {
      hook.result.current.executeRepairs()
    })

    // Phase should still be proposing-repair, not repairing
    expect(hook.result.current.state.phase).toBe('proposing-repair')
  })

  it('executeRepairs sends message to mission and transitions to verifying', () => {
    const hook = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'workload' })
    )

    act(() => {
      hook.result.current.startDiagnose([makeResource()], [makeIssue()], {})
    })
    act(() => { completeMission(hook) })
    act(() => { hook.result.current.approveAllRepairs() })
    act(() => { hook.result.current.executeRepairs() })

    // Regression guard (#11560/#11562): the stale *diagnosis* mission is
    // already 'completed' at this point. The repair-completion useEffect
    // must NOT immediately transition past 'repairing' due to that stale
    // status — it should only fire when the *repair* mission changes.
    expect(hook.result.current.state.phase).toBe('repairing')
    expect(mockSendMessage).toHaveBeenCalledWith('mission-123', expect.stringContaining('Execute'))

    /** Safety-net timeout (ms) defined in useDiagnoseRepairLoop for repair completion */
    const REPAIR_SAFETY_TIMEOUT_MS = 60_000
    act(() => { vi.advanceTimersByTime(REPAIR_SAFETY_TIMEOUT_MS) })
    expect(hook.result.current.state.phase).toBe('verifying')
    expect(hook.result.current.state.completedRepairs.length).toBe(1)
  })

  it('reset returns state to initial', () => {
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'workload' })
    )

    act(() => {
      result.current.startDiagnose([makeResource()], [makeIssue()], {})
    })
    expect(result.current.state.phase).toBe('diagnosing')

    act(() => {
      result.current.reset()
    })
    expect(result.current.state.phase).toBe('idle')
    expect(result.current.state.issuesFound).toEqual([])
    expect(result.current.state.proposedRepairs).toEqual([])
    expect(result.current.state.loopCount).toBe(0)
  })

  it('cancel transitions to idle with error message', () => {
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'workload' })
    )

    act(() => {
      result.current.startDiagnose([makeResource()], [makeIssue()], {})
    })

    act(() => {
      result.current.cancel()
    })

    expect(result.current.state.phase).toBe('idle')
    expect(result.current.state.error).toBe('Cancelled by user')
  })

  it('generates correct default repair actions based on resource kind', () => {
    const hook = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'workload' })
    )

    const deploymentIssue = makeIssue({
      resource: makeResource({ kind: 'Deployment', status: 'unhealthy' }),
    })
    const serviceIssue = makeIssue({
      id: 'issue-svc',
      resource: makeResource({ kind: 'Service', status: 'degraded' }),
    })

    act(() => {
      hook.result.current.startDiagnose(
        [makeResource(), makeResource({ kind: 'Service' })],
        [deploymentIssue, serviceIssue],
        {}
      )
    })
    act(() => { completeMission(hook) })

    const repairs = hook.result.current.state.proposedRepairs
    expect(repairs.length).toBe(2)
    // Deployment with unhealthy status => 'Restart Deployment'
    expect(repairs[0].action).toContain('Deployment')
    // Service => 'Check endpoints'
    expect(repairs[1].action).toBe('Check endpoints')
  })

  it('completes after reaching maxLoops', () => {
    const hook = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'workload', maxLoops: 1 })
    )

    act(() => {
      hook.result.current.startDiagnose([makeResource()], [makeIssue()], {})
    })
    act(() => { completeMission(hook) })
    act(() => { hook.result.current.approveAllRepairs() })
    act(() => { hook.result.current.executeRepairs() })
    /** Safety-net timeout (ms) defined in useDiagnoseRepairLoop for repair completion */
    const REPAIR_SAFETY_TIMEOUT_MS = 60_000
    act(() => { vi.advanceTimersByTime(REPAIR_SAFETY_TIMEOUT_MS) })

    // maxLoops=1 so it should complete instead of verifying
    expect(hook.result.current.state.phase).toBe('complete')
  })

  it('repair risk is medium for critical severity issues', () => {
    const hook = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'workload' })
    )

    act(() => {
      hook.result.current.startDiagnose(
        [makeResource()],
        [makeIssue({ severity: 'critical' })],
        {}
      )
    })
    act(() => { completeMission(hook) })

    expect(hook.result.current.state.proposedRepairs[0].risk).toBe('medium')
  })

  it('generates Create action for missing resources', () => {
    const hook = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'workload' })
    )

    const missingIssue = makeIssue({
      resource: makeResource({ kind: 'ConfigMap', status: 'missing' }),
    })

    act(() => {
      hook.result.current.startDiagnose([makeResource()], [missingIssue], {})
    })
    act(() => { completeMission(hook) })

    expect(hook.result.current.state.proposedRepairs[0].action).toBe('Create ConfigMap')
  })
})
