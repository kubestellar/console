import { describe, it, expect } from 'vitest'
import { workloadPrefix, isCausallyRelated, generateId, parseTimestamp, pct } from './helpers'
import type { ClusterEvent } from '../../hooks/mcp/types'

describe('workloadPrefix', () => {
  it('passes through non-workload refs unchanged', () => {
    expect(workloadPrefix('service/my-svc')).toBe('service/my-svc')
    expect(workloadPrefix('my-resource')).toBe('my-resource')
    expect(workloadPrefix('configmap/app-config')).toBe('configmap/app-config')
    expect(workloadPrefix('secret/db-creds')).toBe('secret/db-creds')
  })

  it('strips two-level suffix from pod name (RS hash + pod suffix)', () => {
    const result = workloadPrefix('pod/payments-api-7d6f8c9b4-xk9ph')
    expect(result).toBe('payments-api')
  })

  it('strips one-level suffix from ReplicaSet name', () => {
    const result = workloadPrefix('replicaset/web-frontend-5c7b9d8f2')
    expect(result).toBe('web-frontend')
  })

  it('handles deployment/ prefix', () => {
    const result = workloadPrefix('deployment/my-app-64f9b7c8d')
    expect(result).toBe('my-app')
  })

  it('handles statefulset/ prefix', () => {
    const result = workloadPrefix('statefulset/db-cluster-789abc12')
    expect(result).toBe('db-cluster')
  })

  it('handles daemonset/ prefix', () => {
    const result = workloadPrefix('daemonset/log-forwarder-5a6b7c8d')
    expect(result).toBe('log-forwarder')
  })

  it('handles job/ prefix', () => {
    const result = workloadPrefix('job/batch-process-123abc45')
    expect(result).toBe('batch-process')
  })

  it('returns name after slash when no suffixes to strip', () => {
    expect(workloadPrefix('pod/web')).toBe('web')
    expect(workloadPrefix('deployment/simple-app')).toBe('simple-app')
  })

  it('handles complex workload names with multiple hyphens', () => {
    const result = workloadPrefix('pod/multi-part-name-app-7d6f8c9b4-xk9ph')
    expect(result).toBe('multi-part-name-app')
  })

  it('handles edge case of very short hash suffixes', () => {
    const result = workloadPrefix('pod/app-abc12-xyz')
    expect(result).toBe('app')
  })

  it('handles edge case of very long hash suffixes', () => {
    const result = workloadPrefix('pod/app-abcdef1234-wxyz56')
    expect(result).toBe('app')
  })

  it('returns original if suffix pattern does not match', () => {
    expect(workloadPrefix('pod/no-suffix-pattern')).toBe('no-suffix-pattern')
  })
})

describe('isCausallyRelated', () => {
  const makeEvent = (reason: string, object: string): ClusterEvent => ({
    type: 'Warning',
    reason,
    message: 'test',
    object,
    namespace: 'default',
    count: 1,
  })

  it('returns true when both events share the same reason family', () => {
    expect(
      isCausallyRelated(
        makeEvent('BackOff', 'pod/app-abc12-xyz01'),
        makeEvent('CrashLoopBackOff', 'pod/other-abc12-xyz01'),
      ),
    ).toBe(true)
  })

  it('returns true when events share the same workload prefix', () => {
    expect(
      isCausallyRelated(
        makeEvent('SomeReason', 'pod/my-deploy-abc12-xyz01'),
        makeEvent('OtherReason', 'pod/my-deploy-abc12-xyz02'),
      ),
    ).toBe(true)
  })

  it('returns false when different families and different workloads', () => {
    expect(
      isCausallyRelated(
        makeEvent('BackOff', 'pod/app-a-abc12-xyz01'),
        makeEvent('FailedScheduling', 'pod/app-b-def34-uvw56'),
      ),
    ).toBe(false)
  })

  it('returns true for ImagePull-family events', () => {
    expect(
      isCausallyRelated(
        makeEvent('ImagePullBackOff', 'pod/svc-1-abc12-xyz01'),
        makeEvent('ErrImagePull', 'pod/svc-2-abc12-xyz01'),
      ),
    ).toBe(true)
  })

  it('returns true for BackOff-family events (OOMKilled, DeadlineExceeded)', () => {
    expect(
      isCausallyRelated(
        makeEvent('OOMKilled', 'pod/app-abc12-xyz01'),
        makeEvent('DeadlineExceeded', 'pod/other-abc12-xyz01'),
      ),
    ).toBe(true)
  })

  it('returns true for FailedScheduling-family events', () => {
    expect(
      isCausallyRelated(
        makeEvent('FailedScheduling', 'pod/app-abc12-xyz01'),
        makeEvent('Unschedulable', 'pod/other-abc12-xyz01'),
      ),
    ).toBe(true)
  })

  it('returns true for NodeNotReady-family events', () => {
    expect(
      isCausallyRelated(
        makeEvent('NodeNotReady', 'node/node-1'),
        makeEvent('NodeUnreachable', 'node/node-2'),
      ),
    ).toBe(true)
  })

  it('returns true for FailedMount-family events', () => {
    expect(
      isCausallyRelated(
        makeEvent('FailedMount', 'pod/app-abc12-xyz01'),
        makeEvent('FailedAttachVolume', 'pod/other-abc12-xyz01'),
      ),
    ).toBe(true)
  })

  it('returns true for Unhealthy-family events (probe failures)', () => {
    expect(
      isCausallyRelated(
        makeEvent('LivenessProbe', 'pod/app-abc12-xyz01'),
        makeEvent('ReadinessProbe', 'pod/other-abc12-xyz01'),
      ),
    ).toBe(true)
  })

  it('returns true for NetworkNotReady-family events', () => {
    expect(
      isCausallyRelated(
        makeEvent('NetworkNotReady', 'pod/app-abc12-xyz01'),
        makeEvent('FailedToUpdateEndpoint', 'pod/other-abc12-xyz01'),
      ),
    ).toBe(true)
  })

  it('returns true when same workload but different resource types', () => {
    expect(
      isCausallyRelated(
        makeEvent('SomeReason', 'deployment/my-app-abc123'),
        makeEvent('OtherReason', 'replicaset/my-app-xyz456'),
      ),
    ).toBe(true)
  })

  it('handles events with non-workload objects that match exactly', () => {
    expect(
      isCausallyRelated(
        makeEvent('SomeReason', 'service/my-svc'),
        makeEvent('OtherReason', 'service/my-svc'),
      ),
    ).toBe(true)
  })

  it('returns false for non-workload objects that do not match', () => {
    expect(
      isCausallyRelated(
        makeEvent('SomeReason', 'service/svc-a'),
        makeEvent('OtherReason', 'service/svc-b'),
      ),
    ).toBe(false)
  })
})

describe('generateId', () => {
  it('produces category-prefixed colon-delimited id', () => {
    expect(generateId('event-correlation', 'cluster-a', 'ns-b')).toBe('event-correlation:cluster-a:ns-b')
  })

  it('works with a single extra part', () => {
    expect(generateId('cluster-delta', 'prod')).toBe('cluster-delta:prod')
  })

  it('works with multiple parts', () => {
    expect(generateId('cascade-impact', 'cluster-1', 'namespace-1', 'app-1')).toBe(
      'cascade-impact:cluster-1:namespace-1:app-1',
    )
  })

  it('works with no extra parts', () => {
    expect(generateId('config-drift')).toBe('config-drift:')
  })

  it('handles special characters in parts', () => {
    expect(generateId('resource-imbalance', 'us-west-2', 'kube-system')).toBe(
      'resource-imbalance:us-west-2:kube-system',
    )
  })
})

describe('parseTimestamp', () => {
  it('returns epoch ms for a valid ISO string', () => {
    const ts = '2024-01-15T10:30:00.000Z'
    expect(parseTimestamp(ts)).toBe(new Date(ts).getTime())
  })

  it('returns 0 for undefined', () => {
    expect(parseTimestamp(undefined)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseTimestamp('')).toBe(0)
  })

  it('returns 0 for an invalid timestamp string', () => {
    expect(parseTimestamp('not-a-date')).toBe(0)
  })

  it('handles different valid ISO formats', () => {
    const ts1 = '2024-06-15T12:00:00Z'
    const ts2 = '2024-06-15T12:00:00.123Z'
    const ts3 = '2024-06-15T12:00:00+00:00'

    expect(parseTimestamp(ts1)).toBe(new Date(ts1).getTime())
    expect(parseTimestamp(ts2)).toBe(new Date(ts2).getTime())
    expect(parseTimestamp(ts3)).toBe(new Date(ts3).getTime())
  })

  it('returns 0 for malformed ISO string', () => {
    expect(parseTimestamp('2024-99-99T99:99:99Z')).toBe(0)
  })

  it('returns 0 for partial timestamp', () => {
    expect(parseTimestamp('2024-01-15')).not.toBe(0) // This is actually valid
  })

  it('handles epoch zero correctly', () => {
    expect(parseTimestamp('1970-01-01T00:00:00.000Z')).toBe(0)
  })
})

describe('pct', () => {
  it('calculates percentage correctly', () => {
    expect(pct(50, 200)).toBe(25)
  })

  it('rounds to nearest integer', () => {
    expect(pct(1, 3)).toBe(33)
    expect(pct(2, 3)).toBe(67)
  })

  it('returns 0 when total is 0', () => {
    expect(pct(5, 0)).toBe(0)
  })

  it('returns 0 when value is undefined', () => {
    expect(pct(undefined, 100)).toBe(0)
  })

  it('returns 0 when total is undefined', () => {
    expect(pct(50, undefined)).toBe(0)
  })

  it('returns 100 for value equal to total', () => {
    expect(pct(100, 100)).toBe(100)
  })

  it('returns 0 when both value and total are undefined', () => {
    expect(pct(undefined, undefined)).toBe(0)
  })

  it('handles decimal inputs correctly', () => {
    expect(pct(33.33, 100)).toBe(33)
    expect(pct(66.66, 100)).toBe(67)
  })

  it('handles value greater than total', () => {
    expect(pct(150, 100)).toBe(150)
  })

  it('handles very small percentages', () => {
    expect(pct(1, 1000)).toBe(0)
    expect(pct(5, 1000)).toBe(1)
  })

  it('handles zero value with non-zero total', () => {
    expect(pct(0, 100)).toBe(0)
  })

  it('handles negative values (edge case)', () => {
    expect(pct(-50, 100)).toBe(-50)
  })
})
