import type { PodIssue } from '../../hooks/mcp/types.workloads'

/**
 * Backend `FindPodIssues` labels an unschedulable pod with the raw issue string
 * `Unschedulable: <message>` and, because "Unschedulable" outranks the phase
 * fallback in `podPrimaryReasonPriority`, promotes it to the row's
 * status/reason. Those pods are still in the Kubernetes `Pending` phase — they
 * simply never got a node — so a `reason === 'Pending'` test alone under-counts
 * them.
 *
 * The live groundtruth canary compares `pods-pending` against
 * `pods.filter(phase === 'Pending')`, which does include unschedulable pods.
 * Run 33749456318 reported 12 against a truthful 76 for exactly this reason:
 * 64 of the Pending pods were unschedulable and therefore labelled
 * `Unschedulable` instead of `Pending`.
 *
 * Only pods whose *primary* label is Unschedulable are treated as Pending here.
 * A pod that reached `Running` and later went unready is reported with a
 * different status (e.g. `Not ready`) and must not be counted.
 */
const UNSCHEDULABLE_PREFIX = 'unschedulable'

function isUnschedulableLabel(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().toLowerCase().startsWith(UNSCHEDULABLE_PREFIX)
}

/**
 * True when a pod-issue row represents a pod in the Kubernetes `Pending` phase:
 * either explicitly labelled `Pending`, or labelled `Unschedulable` (which
 * implies Pending).
 */
export function isPendingPhasePodIssue(issue: Pick<PodIssue, 'status' | 'reason'>): boolean {
  if (issue.reason === 'Pending' || issue.status === 'Pending') return true
  return isUnschedulableLabel(issue.reason) || isUnschedulableLabel(issue.status)
}
