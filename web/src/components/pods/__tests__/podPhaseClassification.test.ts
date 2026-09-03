import { describe, it, expect } from 'vitest'
import { isPendingPhasePodIssue } from '../podPhaseClassification'

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
