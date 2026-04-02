import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — only dependencies, never the hook under test
// ---------------------------------------------------------------------------

const mockStartMission = vi.fn(() => 'mission-123')
const mockSendMessage = vi.fn()

vi.mock('../useMissions', () => ({
  useMissions: () => ({
    startMission: mockStartMission,
    sendMessage: mockSendMessage,
    missions: [],
    activeMission: null,
    isSidebarOpen: false,
    isSidebarMinimized: false,
    isFullScreen: false,
    unreadMissionCount: 0,
    unreadMissionIds: new Set<string>(),
    agents: [],
    selectedAgent: null,
    defaultAgent: null,
    agentsLoading: false,
    isAIDisabled: true,
    saveMission: () => '',
    runSavedMission: () => {},
    retryPreflight: () => {},
    cancelMission: () => {},
    dismissMission: () => {},
    renameMission: () => {},
    rateMission: () => {},
    setActiveMission: () => {},
    markMissionAsRead: () => {},
    selectAgent: () => {},
    connectToAgent: () => {},
    toggleSidebar: () => {},
    openSidebar: () => {},
    closeSidebar: () => {},
    minimizeSidebar: () => {},
    expandSidebar: () => {},
    setFullScreen: () => {},
  }),
}))

import { useDiagnoseRepairLoop } from '../useDiagnoseRepairLoop'
import type { MonitorIssue, MonitoredResource } from '../../types/workloadMonitor'
import { DEFAULT_MAX_LOOPS } from '../../types/workloadMonitor'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResource(overrides: Partial<MonitoredResource> = {}): MonitoredResource {
  return {
    id: 'Deployment/default/test-app',
    kind: 'Deployment',
    name: 'test-app',
    namespace: 'default',
    cluster: 'test-cluster',
    status: 'unhealthy',
    category: 'workload',
    message: 'CrashLoopBackOff',
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
    title: 'Pod crash loop',
    description: 'Pod is in CrashLoopBackOff',
    detectedAt: new Date().toISOString(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useDiagnoseRepairLoop', () => {
  // --- Shape and initial state ---

  it('returns the expected API shape', () => {
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'pod-crash' }),
    )
    expect(result.current).toHaveProperty('state')
    expect(result.current).toHaveProperty('startDiagnose')
    expect(result.current).toHaveProperty('approveRepair')
    expect(result.current).toHaveProperty('approveAllRepairs')
    expect(result.current).toHaveProperty('executeRepairs')
    expect(result.current).toHaveProperty('reset')
    expect(result.current).toHaveProperty('cancel')
    expect(typeof result.current.startDiagnose).toBe('function')
    expect(typeof result.current.approveRepair).toBe('function')
    expect(typeof result.current.approveAllRepairs).toBe('function')
    expect(typeof result.current.executeRepairs).toBe('function')
    expect(typeof result.current.reset).toBe('function')
    expect(typeof result.current.cancel).toBe('function')
  })

  it('starts in idle phase with empty arrays', () => {
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment' }),
    )
    const { state } = result.current
    expect(state.phase).toBe('idle')
    expect(state.issuesFound).toEqual([])
    expect(state.proposedRepairs).toEqual([])
    expect(state.completedRepairs).toEqual([])
    expect(state.loopCount).toBe(0)
    expect(state.maxLoops).toBe(DEFAULT_MAX_LOOPS)
  })

  it('uses custom maxLoops when provided', () => {
    const CUSTOM_MAX = 5
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'test', maxLoops: CUSTOM_MAX }),
    )
    expect(result.current.state.maxLoops).toBe(CUSTOM_MAX)
  })

  // --- startDiagnose transitions ---

  it('transitions to scanning then diagnosing when startDiagnose is called', () => {
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment' }),
    )
    const issues = [makeIssue()]
    const resources = [makeResource()]
    const context = { workload: 'test-app' }

    act(() => {
      result.current.startDiagnose(resources, issues, context)
    })

    // After startDiagnose, state should be 'diagnosing' (scanning → diagnosing in same call)
    expect(result.current.state.phase).toBe('diagnosing')
    expect(result.current.state.issuesFound).toHaveLength(1)
    expect(result.current.state.issuesFound[0].id).toBe('issue-1')
  })

  it('clears previous proposedRepairs and completedRepairs on new startDiagnose', () => {
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment' }),
    )

    act(() => {
      result.current.startDiagnose([makeResource()], [makeIssue()], {})
    })

    expect(result.current.state.proposedRepairs).toEqual([])
    expect(result.current.state.completedRepairs).toEqual([])
  })

  it('calls startMission with correct parameters', () => {
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'llm-d' }),
    )
    const context = { cluster: 'prod' }

    act(() => {
      result.current.startDiagnose([makeResource()], [makeIssue()], context)
    })

    expect(mockStartMission).toHaveBeenCalledTimes(1)
    const callArgs = mockStartMission.mock.calls[0][0]
    expect(callArgs.title).toContain('llm-d')
    expect(callArgs.type).toBe('troubleshoot')
    expect(callArgs.context).toEqual(context)
    expect(callArgs.initialPrompt).toContain('llm-d')
  })

  it('stores missionId in state after startDiagnose', () => {
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment' }),
    )

    act(() => {
      result.current.startDiagnose([makeResource()], [makeIssue()], {})
    })

    expect(result.current.state.missionId).toBe('mission-123')
  })

  // --- Timer-based transitions (diagnosing → proposing-repair) ---

  it('transitions to proposing-repair after timeout when repairable=true', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([makeResource()], [makeIssue()], {})
    })

    expect(result.current.state.phase).toBe('diagnosing')

    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })

    expect(result.current.state.phase).toBe('proposing-repair')
    expect(result.current.state.proposedRepairs.length).toBeGreaterThan(0)
  })

  it('transitions to complete after timeout when repairable=false', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: false }),
    )

    act(() => {
      result.current.startDiagnose([makeResource()], [makeIssue()], {})
    })

    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })

    expect(result.current.state.phase).toBe('complete')
    expect(result.current.state.proposedRepairs).toEqual([])
  })

  it('generates one proposed repair per issue', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const issues = [
      makeIssue({ id: 'issue-a' }),
      makeIssue({ id: 'issue-b' }),
      makeIssue({ id: 'issue-c' }),
    ]

    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([makeResource()], issues, {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })

    expect(result.current.state.proposedRepairs).toHaveLength(3)
    expect(result.current.state.proposedRepairs[0].issueId).toBe('issue-a')
    expect(result.current.state.proposedRepairs[1].issueId).toBe('issue-b')
    expect(result.current.state.proposedRepairs[2].issueId).toBe('issue-c')
  })

  it('proposed repairs start with approved=false', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([makeResource()], [makeIssue()], {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })

    expect(result.current.state.proposedRepairs[0].approved).toBe(false)
  })

  // --- approveRepair ---

  it('approves a single repair by id', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([makeResource()], [makeIssue()], {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })

    const repairId = result.current.state.proposedRepairs[0].id

    act(() => {
      result.current.approveRepair(repairId)
    })

    expect(result.current.state.phase).toBe('awaiting-approval')
    expect(result.current.state.proposedRepairs[0].approved).toBe(true)
  })

  it('does not approve other repairs when a specific one is approved', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const issues = [makeIssue({ id: 'i1' }), makeIssue({ id: 'i2' })]

    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([makeResource()], issues, {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })

    const firstRepairId = result.current.state.proposedRepairs[0].id

    act(() => {
      result.current.approveRepair(firstRepairId)
    })

    expect(result.current.state.proposedRepairs[0].approved).toBe(true)
    expect(result.current.state.proposedRepairs[1].approved).toBe(false)
  })

  // --- approveAllRepairs ---

  it('approves all repairs at once', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const issues = [makeIssue({ id: 'i1' }), makeIssue({ id: 'i2' })]

    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([makeResource()], issues, {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })
    act(() => {
      result.current.approveAllRepairs()
    })

    expect(result.current.state.phase).toBe('awaiting-approval')
    for (const r of result.current.state.proposedRepairs) {
      expect(r.approved).toBe(true)
    }
  })

  // --- executeRepairs ---

  it('transitions to repairing when executeRepairs is called with approved repairs', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([makeResource()], [makeIssue()], {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })
    act(() => {
      result.current.approveAllRepairs()
    })
    act(() => {
      result.current.executeRepairs()
    })

    expect(result.current.state.phase).toBe('repairing')
    expect(mockSendMessage).toHaveBeenCalledWith('mission-123', expect.stringContaining('Execute'))
  })

  it('does nothing when executeRepairs is called with no approved repairs', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([makeResource()], [makeIssue()], {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })

    // No approvals — repairs are all approved=false
    act(() => {
      result.current.executeRepairs()
    })

    // Phase should still be proposing-repair, not repairing
    expect(result.current.state.phase).toBe('proposing-repair')
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('transitions to verifying after repair execution completes', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const REPAIR_TIMEOUT_MS = 5000
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([makeResource()], [makeIssue()], {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })
    act(() => {
      result.current.approveAllRepairs()
    })
    act(() => {
      result.current.executeRepairs()
    })
    act(() => {
      vi.advanceTimersByTime(REPAIR_TIMEOUT_MS)
    })

    expect(result.current.state.phase).toBe('verifying')
    expect(result.current.state.completedRepairs.length).toBeGreaterThan(0)
  })

  it('completes the loop when maxLoops is reached during repair', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const REPAIR_TIMEOUT_MS = 5000
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true, maxLoops: 1 }),
    )

    act(() => {
      result.current.startDiagnose([makeResource()], [makeIssue()], {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })
    act(() => {
      result.current.approveAllRepairs()
    })
    act(() => {
      result.current.executeRepairs()
    })
    act(() => {
      vi.advanceTimersByTime(REPAIR_TIMEOUT_MS)
    })

    // maxLoops=1 and loopCount starts at 0, so 0 >= 1-1 = true => complete
    expect(result.current.state.phase).toBe('complete')
  })

  // --- reset ---

  it('resets to initial idle state', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([makeResource()], [makeIssue()], {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })

    // Now in proposing-repair
    act(() => {
      result.current.reset()
    })

    expect(result.current.state.phase).toBe('idle')
    expect(result.current.state.issuesFound).toEqual([])
    expect(result.current.state.proposedRepairs).toEqual([])
    expect(result.current.state.completedRepairs).toEqual([])
    expect(result.current.state.loopCount).toBe(0)
  })

  // --- cancel ---

  it('cancels the loop and returns to idle with error message', () => {
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment' }),
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

  // --- Repair risk/action/description helpers ---

  it('generates "Restart Deployment" action for unhealthy Deployment issues', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const resource = makeResource({ kind: 'Deployment', status: 'unhealthy' })
    const issue = makeIssue({ resource })

    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([resource], [issue], {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })

    expect(result.current.state.proposedRepairs[0].action).toBe('Restart Deployment')
  })

  it('generates "Scale StatefulSet" action for degraded StatefulSet issues', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const resource = makeResource({ kind: 'StatefulSet', status: 'degraded' })
    const issue = makeIssue({ resource })

    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'statefulset', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([resource], [issue], {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })

    expect(result.current.state.proposedRepairs[0].action).toBe('Scale StatefulSet')
  })

  it('generates "Create <kind>" action for missing resources', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const resource = makeResource({ kind: 'ConfigMap', status: 'missing' })
    const issue = makeIssue({ resource })

    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([resource], [issue], {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })

    expect(result.current.state.proposedRepairs[0].action).toBe('Create ConfigMap')
  })

  it('generates "Check endpoints" action for Service issues', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const resource = makeResource({ kind: 'Service', status: 'unhealthy' })
    const issue = makeIssue({ resource })

    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([resource], [issue], {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })

    expect(result.current.state.proposedRepairs[0].action).toBe('Check endpoints')
  })

  it('generates "Investigate PVC" action for PersistentVolumeClaim issues', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const resource = makeResource({ kind: 'PersistentVolumeClaim', status: 'unhealthy' })
    const issue = makeIssue({ resource })

    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([resource], [issue], {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })

    expect(result.current.state.proposedRepairs[0].action).toBe('Investigate PVC')
  })

  it('generates "Investigate <kind>" for unknown resource kinds', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const resource = makeResource({ kind: 'NetworkPolicy', status: 'unhealthy' })
    const issue = makeIssue({ resource })

    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([resource], [issue], {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })

    expect(result.current.state.proposedRepairs[0].action).toBe('Investigate NetworkPolicy')
  })

  it('assigns medium risk for critical severity issues', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const issue = makeIssue({ severity: 'critical' })

    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([makeResource()], [issue], {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })

    expect(result.current.state.proposedRepairs[0].risk).toBe('medium')
  })

  it('assigns medium risk for Deployment kind regardless of severity', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const resource = makeResource({ kind: 'Deployment', status: 'unhealthy' })
    const issue = makeIssue({ resource, severity: 'warning' })

    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([resource], [issue], {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })

    expect(result.current.state.proposedRepairs[0].risk).toBe('medium')
  })

  it('assigns medium risk for StatefulSet kind', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const resource = makeResource({ kind: 'StatefulSet', status: 'unhealthy' })
    const issue = makeIssue({ resource, severity: 'info' })

    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([resource], [issue], {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })

    expect(result.current.state.proposedRepairs[0].risk).toBe('medium')
  })

  it('assigns low risk for non-critical, non-workload issues', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const resource = makeResource({ kind: 'ConfigMap', status: 'unhealthy' })
    const issue = makeIssue({ resource, severity: 'warning' })

    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([resource], [issue], {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })

    expect(result.current.state.proposedRepairs[0].risk).toBe('low')
  })

  // --- Prompt content ---

  it('includes resource summary in the diagnosis prompt', () => {
    const resource = makeResource({
      kind: 'Deployment',
      name: 'my-app',
      status: 'unhealthy',
      message: 'CrashLoopBackOff',
    })
    const issue = makeIssue({ resource })

    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment' }),
    )

    act(() => {
      result.current.startDiagnose([resource], [issue], { workload: 'my-app' })
    })

    const prompt = mockStartMission.mock.calls[0][0].initialPrompt
    expect(prompt).toContain('Deployment/my-app')
    expect(prompt).toContain('unhealthy')
    expect(prompt).toContain('CrashLoopBackOff')
  })

  it('includes issue details in the diagnosis prompt', () => {
    const issue = makeIssue({
      severity: 'critical',
      title: 'Pod crash loop',
      description: 'Pod is in CrashLoopBackOff',
    })

    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment' }),
    )

    act(() => {
      result.current.startDiagnose([makeResource()], [issue], {})
    })

    const prompt = mockStartMission.mock.calls[0][0].initialPrompt
    expect(prompt).toContain('[critical]')
    expect(prompt).toContain('Pod crash loop')
    expect(prompt).toContain('CrashLoopBackOff')
  })

  it('says "No issues detected" when issue list is empty', () => {
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment' }),
    )

    act(() => {
      result.current.startDiagnose([makeResource()], [], {})
    })

    const prompt = mockStartMission.mock.calls[0][0].initialPrompt
    expect(prompt).toContain('No issues detected')
  })

  it('includes repair instructions when repairable=true', () => {
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([makeResource()], [makeIssue()], {})
    })

    const prompt = mockStartMission.mock.calls[0][0].initialPrompt
    expect(prompt).toContain('propose a specific repair')
  })

  it('includes diagnose-only instructions when repairable=false', () => {
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: false }),
    )

    act(() => {
      result.current.startDiagnose([makeResource()], [makeIssue()], {})
    })

    const prompt = mockStartMission.mock.calls[0][0].initialPrompt
    expect(prompt).toContain('no automated repairs')
  })

  // --- DaemonSet action ---

  it('generates "Restart DaemonSet" action for unhealthy DaemonSet', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const resource = makeResource({ kind: 'DaemonSet', status: 'unhealthy' })
    const issue = makeIssue({ resource })

    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([resource], [issue], {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })

    expect(result.current.state.proposedRepairs[0].action).toBe('Restart DaemonSet')
  })

  // --- Repair description ---

  it('includes issue title and description in repair description', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const issue = makeIssue({
      title: 'Missing ConfigMap',
      description: 'ConfigMap app-config not found',
    })

    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true }),
    )

    act(() => {
      result.current.startDiagnose([makeResource()], [issue], {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })

    const desc = result.current.state.proposedRepairs[0].description
    expect(desc).toContain('Missing ConfigMap')
    expect(desc).toContain('ConfigMap app-config not found')
  })

  // --- loopCount increment when starting from verifying ---

  it('increments loopCount when startDiagnose is called from verifying phase', () => {
    const DIAGNOSE_TIMEOUT_MS = 3000
    const REPAIR_TIMEOUT_MS = 5000
    const { result } = renderHook(() =>
      useDiagnoseRepairLoop({ monitorType: 'deployment', repairable: true, maxLoops: 5 }),
    )

    // First loop
    act(() => {
      result.current.startDiagnose([makeResource()], [makeIssue()], {})
    })
    act(() => {
      vi.advanceTimersByTime(DIAGNOSE_TIMEOUT_MS)
    })
    act(() => {
      result.current.approveAllRepairs()
    })
    act(() => {
      result.current.executeRepairs()
    })
    act(() => {
      vi.advanceTimersByTime(REPAIR_TIMEOUT_MS)
    })

    expect(result.current.state.phase).toBe('verifying')
    expect(result.current.state.loopCount).toBe(0)

    // Second loop — startDiagnose from verifying
    act(() => {
      result.current.startDiagnose([makeResource()], [makeIssue()], {})
    })

    expect(result.current.state.loopCount).toBe(1)
  })
})
