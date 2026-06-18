import { describe, it, expect } from 'vitest'
import {
  pct,
  parseTimestamp,
  generateId,
  detectEventCorrelations,
  detectClusterDeltas,
  detectCascadeImpact,
  detectConfigDrift,
  detectResourceImbalance,
  detectRestartCorrelation,
  trackRolloutProgress,
  EVENT_CORRELATION_WINDOW_MS,
  CASCADE_DETECTION_WINDOW_MS,
  RESTART_CORRELATION_THRESHOLD,
  CPU_CRITICAL_THRESHOLD_PCT,
  RESTART_CRITICAL_THRESHOLD,
  INFRA_CRITICAL_WORKLOADS,
  MAX_INSIGHTS_PER_CATEGORY,
  MIN_CORRELATED_CLUSTERS,
} from './useMultiClusterInsights'
import type { ClusterEvent, Deployment, PodIssue } from './mcp/types'
import type { ClusterInfo } from './mcp/types'

/** Fixed timestamp used in test factories for determinism */
const FIXED_TIMESTAMP = '2026-01-15T10:00:00.000Z'

// ── Helper factory functions ──────────────────────────────────────────

function makeEvent(overrides: Partial<ClusterEvent> = {}): ClusterEvent {
  return {
    type: 'Warning',
    reason: 'BackOff',
    message: 'Back-off restarting failed container',
    object: 'pod/test-pod',
    namespace: 'default',
    cluster: 'cluster-1',
    count: 1,
    lastSeen: FIXED_TIMESTAMP,
    ...overrides,
  }
}

function makeDeployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    name: 'api-server',
    namespace: 'default',
    cluster: 'cluster-1',
    status: 'running',
    replicas: 3,
    readyReplicas: 3,
    updatedReplicas: 3,
    availableReplicas: 3,
    progress: 100,
    image: 'api-server:v1.0.0',
    ...overrides,
  }
}

function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return {
    name: 'cluster-1',
    context: 'cluster-1-ctx',
    healthy: true,
    cpuCores: 8,
    memoryGB: 32,
    ...overrides,
  }
}

function makePodIssue(overrides: Partial<PodIssue> = {}): PodIssue {
  return {
    name: 'api-server-abc123-xyz',
    namespace: 'default',
    cluster: 'cluster-1',
    status: 'CrashLoopBackOff',
    issues: ['CrashLoopBackOff'],
    restarts: 5,
    ...overrides,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────


describe('pct', () => {
  it('returns 0 for undefined value', () => {
    expect(pct(undefined, 100)).toBe(0)
  })

  it('returns 0 for undefined total', () => {
    expect(pct(50, undefined)).toBe(0)
  })

  it('returns 0 when total is 0', () => {
    expect(pct(50, 0)).toBe(0)
  })

  it('calculates correct percentage', () => {
    expect(pct(25, 100)).toBe(25)
    expect(pct(1, 3)).toBe(33)
  })

  it('returns 0 when value is 0', () => {
    expect(pct(0, 100)).toBe(0)
  })
})


describe('parseTimestamp', () => {
  it('returns 0 for undefined', () => {
    expect(parseTimestamp(undefined)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseTimestamp('')).toBe(0)
  })

  it('parses valid ISO string', () => {
    const ts = '2026-01-15T10:00:00.000Z'
    expect(parseTimestamp(ts)).toBe(new Date(ts).getTime())
  })

  it('returns 0 for malformed date strings', () => {
    expect(parseTimestamp('not-a-date')).toBe(0)
    expect(parseTimestamp('abc123')).toBe(0)
  })
})


describe('generateId', () => {
  it('creates id from category and parts', () => {
    expect(generateId('config-drift', 'ns/app')).toBe('config-drift:ns/app')
  })

  it('joins multiple parts', () => {
    expect(generateId('restart-correlation', 'app-bug', 'ns/app')).toBe(
      'restart-correlation:app-bug:ns/app',
    )
  })
})

// ── Algorithm 1: Event Correlations ───────────────────────────────────

