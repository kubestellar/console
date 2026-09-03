import { describe, it, expect } from 'vitest'
import { countPendingPods, isPendingPhasePodIssue } from '../podPhaseClassification'
import type { ClusterInfo, PodPhaseCensus } from '../../../hooks/mcp/types'
import type { PodIssue } from '../../../hooks/mcp/types.workloads'

function census(overrides: Partial<PodPhaseCensus> = {}): PodPhaseCensus {
  return { running: 0, pending: 0, failed: 0, succeeded: 0, unknown: 0, ...overrides }
}

function clusterWith(podPhases?: PodPhaseCensus): Pick<ClusterInfo, 'podPhases'> {
  return { podPhases }
}

function issue(overrides: Partial<PodIssue> = {}): Pick<PodIssue, 'status' | 'reason'> {
  return { status: 'Running', reason: '', ...overrides }
}

describe('isPendingPhasePodIssue', () => {
  it('counts rows explicitly labelled Pending', () => {
    expect(isPendingPhasePodIssue({ status: 'Pending', reason: 'Pending' })).toBe(true)
    expect(isPendingPhasePodIssue({ status: 'Pending', reason: undefined })).toBe(true)
    expect(isPendingPhasePodIssue({ status: 'Unknown', reason: 'Pending' })).toBe(true)
  })

  // Unschedulable pods never got a node, so Kubernetes still reports them in the
  // Pending phase. The backend promotes "Unschedulable" over the phase fallback,
  // which previously hid them from the pending stat (run 33749456318: 12 vs 76).
  it('counts unschedulable rows, which are still Pending phase', () => {
    expect(isPendingPhasePodIssue({ status: 'Unschedulable', reason: 'Unschedulable' })).toBe(true)
    expect(isPendingPhasePodIssue({
      status: 'Unschedulable: 0/6 nodes are available: insufficient cpu.',
      reason: 'Unschedulable: 0/6 nodes are available: insufficient cpu.',
    })).toBe(true)
    expect(isPendingPhasePodIssue({ status: 'unschedulable', reason: undefined })).toBe(true)
  })

  it('does not count pods that are not in the Pending phase', () => {
    expect(isPendingPhasePodIssue({ status: 'CrashLoopBackOff', reason: 'CrashLoopBackOff' })).toBe(false)
    expect(isPendingPhasePodIssue({ status: 'OOMKilled', reason: 'OOMKilled' })).toBe(false)
    expect(isPendingPhasePodIssue({ status: 'Failed', reason: 'Failed' })).toBe(false)
    expect(isPendingPhasePodIssue({ status: 'ImagePullBackOff', reason: 'ImagePullBackOff' })).toBe(false)
  })

  // A pod that reached Running and later went unready is not Pending, even
  // though it is an "issue" row.
  it('does not count running-but-unready pods as pending', () => {
    expect(isPendingPhasePodIssue({ status: 'Not ready', reason: 'Not ready' })).toBe(false)
    expect(isPendingPhasePodIssue({ status: 'Running', reason: undefined })).toBe(false)
  })

  it('does not treat unrelated reasons that merely mention scheduling as pending', () => {
    expect(isPendingPhasePodIssue({ status: 'High restarts (7)', reason: 'High restarts (7)' })).toBe(false)
    expect(isPendingPhasePodIssue({ status: '', reason: undefined })).toBe(false)
  })
})

describe('countPendingPods', () => {
  // The bug this change fixes (#23097). The pod-issues feed withholds a Pending
  // pod until it is older than the backend's 2-minute podPendingAgeThreshold,
  // so a stat derived from that feed reports 0 while Kubernetes — and the
  // groundtruth canary — already count the pod. The census is ungated.
  it('counts freshly-created Pending pods that the issues feed still suppresses', () => {
    const clusters = [clusterWith(census({ running: 4, pending: 3 }))]
    // Feed is empty: all three pods are younger than the age gate.
    const podIssues: Pick<PodIssue, 'status' | 'reason'>[] = []

    expect(countPendingPods(clusters, podIssues)).toBe(3)
    // Guard against a regression to the feed-derived count.
    expect(countPendingPods(clusters, podIssues)).not.toBe(podIssues.length)
  })

  it('sums the census across clusters', () => {
    const clusters = [
      clusterWith(census({ pending: 2 })),
      clusterWith(census({ pending: 5 })),
      clusterWith(census({ pending: 0, running: 9 })),
    ]
    expect(countPendingPods(clusters, [])).toBe(7)
  })

  // The census must not pick up phases that are not Pending, whatever the
  // issues feed says about them.
  it('ignores running, terminal and unknown-phase pods in the census', () => {
    const clusters = [clusterWith(census({ running: 12, failed: 3, succeeded: 8, unknown: 2, pending: 1 }))]
    const podIssues = [
      issue({ status: 'Not ready', reason: 'Not ready' }),
      issue({ status: 'CrashLoopBackOff', reason: 'CrashLoopBackOff' }),
      issue({ status: 'Failed', reason: 'Failed' }),
    ]
    expect(countPendingPods(clusters, podIssues)).toBe(1)
  })

  // Kubernetes reports unschedulable pods in the Pending phase, so the backend
  // census already includes them — #23096's behaviour is preserved, and now it
  // holds without having to reconstruct the phase from an issue reason.
  it('includes unschedulable pods via the census, matching #23096', () => {
    const clusters = [clusterWith(census({ pending: 76 }))]
    // The feed labels 64 of them Unschedulable and only 12 plain Pending.
    const podIssues = [
      ...Array.from({ length: 64 }, () =>
        issue({ status: 'Unschedulable: 0/6 nodes are available.', reason: 'Unschedulable: 0/6 nodes are available.' })),
      ...Array.from({ length: 12 }, () => issue({ status: 'Pending', reason: 'Pending' })),
    ]
    expect(countPendingPods(clusters, podIssues)).toBe(76)
  })

  describe('fallback when no cluster reports a census', () => {
    // Older backend, or health data not collected yet. Behaviour must be
    // exactly #23096's classifier — including its unschedulable handling.
    it('classifies issue rows, keeping unschedulable pods as Pending', () => {
      const clusters = [clusterWith(undefined), clusterWith(undefined)]
      const podIssues = [
        issue({ status: 'Pending', reason: 'Pending' }),
        issue({ status: 'Unschedulable: insufficient cpu', reason: 'Unschedulable: insufficient cpu' }),
        issue({ status: 'CrashLoopBackOff', reason: 'CrashLoopBackOff' }),
        issue({ status: 'Not ready', reason: 'Not ready' }),
      ]
      expect(countPendingPods(clusters, podIssues)).toBe(2)
    })

    it('falls back for an empty cluster list', () => {
      expect(countPendingPods([], [issue({ status: 'Pending', reason: 'Pending' })])).toBe(1)
      expect(countPendingPods([], [])).toBe(0)
    })
  })

  // A partially-collected fleet must not silently fall back and mix counting
  // strategies: clusters that report a census are authoritative for their pods.
  it('uses the census when only some clusters report one', () => {
    const clusters = [clusterWith(census({ pending: 4 })), clusterWith(undefined)]
    const podIssues = [issue({ status: 'Pending', reason: 'Pending' })]
    expect(countPendingPods(clusters, podIssues)).toBe(4)
  })

  it('treats a census of all zeroes as authoritative, not as missing data', () => {
    const clusters = [clusterWith(census())]
    const podIssues = [issue({ status: 'Pending', reason: 'Pending' })]
    expect(countPendingPods(clusters, podIssues)).toBe(0)
  })
})
