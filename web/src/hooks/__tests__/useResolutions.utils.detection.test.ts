import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  detectIssueSignature,
  findSimilarResolutionsStandalone,
  generateResolutionPromptContext,
  calculateSignatureSimilarity,
  useResolutions,
  type IssueSignature,
  type Resolution,
  type SimilarResolution,
} from '../useResolutions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResolution(overrides: Partial<Resolution> = {}): Resolution {
  return {
    id: `res-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    missionId: 'mission-1',
    userId: 'user-1',
    title: 'Fix CrashLoopBackOff',
    visibility: 'private',
    issueSignature: {
      type: 'CrashLoopBackOff',
      resourceKind: 'Pod',
    },
    resolution: {
      summary: 'Increase memory limits',
      steps: ['kubectl edit deployment', 'Set memory to 512Mi'],
    },
    context: {},
    effectiveness: { timesUsed: 5, timesSuccessful: 4 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function seedLocalStorage(
  personal: Resolution[] = [],
  shared: Resolution[] = [],
): void {
  if (personal.length > 0) {
    localStorage.setItem('kc_resolutions', JSON.stringify(personal))
  }
  if (shared.length > 0) {
    localStorage.setItem('kc_shared_resolutions', JSON.stringify(shared))
  }
}

// ---------------------------------------------------------------------------
// detectIssueSignature
// ---------------------------------------------------------------------------

describe('detectIssueSignature', () => {
  it('detects CrashLoopBackOff', () => {
    const sig = detectIssueSignature('Pod is in CrashLoopBackOff state')
    expect(sig.type).toBe('CrashLoopBackOff')
    expect(sig.resourceKind).toBe('Pod')
  })

  it('detects OOMKilled', () => {
    const sig = detectIssueSignature('Container was OOMKilled')
    expect(sig.type).toBe('OOMKilled')
    expect(sig.resourceKind).toBe('Pod')
  })

  it('detects OOMKilled from "out of memory" phrasing', () => {
    const sig = detectIssueSignature('Process ran out of memory and was terminated')
    expect(sig.type).toBe('OOMKilled')
  })

  it('detects ImagePullBackOff', () => {
    const sig = detectIssueSignature('ImagePullBackOff for myregistry/app:latest')
    expect(sig.type).toBe('ImagePullBackOff')
    expect(sig.resourceKind).toBe('Pod')
  })

  it('detects ErrImagePull variant', () => {
    const sig = detectIssueSignature('ErrImagePull: unauthorized access')
    expect(sig.type).toBe('ImagePullBackOff')
  })

  it('detects Unschedulable', () => {
    const sig = detectIssueSignature('Pod is pending unschedulable')
    expect(sig.type).toBe('Unschedulable')
    expect(sig.resourceKind).toBe('Pod')
  })

  it('returns Unknown for unrecognized content', () => {
    const sig = detectIssueSignature('everything looks fine')
    expect(sig.type).toBe('Unknown')
  })

  it('extracts namespace when present', () => {
    const sig = detectIssueSignature(
      'Pod in CrashLoopBackOff in namespace: kube-system',
    )
    expect(sig.type).toBe('CrashLoopBackOff')
    expect(sig.namespace).toBe('kube-system')
  })

  it('extracts error pattern from content', () => {
    const sig = detectIssueSignature(
      'CrashLoopBackOff error: container exited with code 137 after OOM event',
    )
    expect(sig.type).toBe('CrashLoopBackOff')
    expect(sig.errorPattern).toBeDefined()
    expect(sig.errorPattern).toContain('container exited')
  })

  it('detects NodeNotReady', () => {
    const sig = detectIssueSignature('node worker-3 is not ready')
    expect(sig.type).toBe('NodeNotReady')
    expect(sig.resourceKind).toBe('Node')
  })

  it('detects RBAC / unauthorized', () => {
    const sig = detectIssueSignature('request is forbidden: user cannot list pods')
    expect(sig.type).toBe('RBAC')
  })

  it('detects InsufficientResources', () => {
    const sig = detectIssueSignature('insufficient cpu on node worker-1')
    expect(sig.type).toBe('InsufficientResources')
    expect(sig.resourceKind).toBe('Node')
  })

  it('is case insensitive', () => {
    const sig = detectIssueSignature('CRASHLOOPBACKOFF detected')
    expect(sig.type).toBe('CrashLoopBackOff')
  })

  it('detects ReadinessProbe failure', () => {
    const sig = detectIssueSignature('readiness probe failed for container nginx')
    expect(sig.type).toBe('ReadinessProbe')
    expect(sig.resourceKind).toBe('Pod')
  })

  it('detects LivenessProbe failure', () => {
    const sig = detectIssueSignature('liveness probe failed: HTTP probe returned 503')
    expect(sig.type).toBe('LivenessProbe')
    expect(sig.resourceKind).toBe('Pod')
  })

  it('detects failed to pull image', () => {
    const sig = detectIssueSignature('Failed to pull image "myregistry/app:v2"')
    expect(sig.type).toBe('ImagePull')
    expect(sig.resourceKind).toBe('Pod')
  })

  it('detects CertificateExpired', () => {
    const sig = detectIssueSignature('TLS certificate has expired, renew required')
    expect(sig.type).toBe('CertificateExpired')
  })

  it('detects ConnectionRefused', () => {
    const sig = detectIssueSignature('dial tcp 10.0.0.5:8080: connection refused')
    expect(sig.type).toBe('ConnectionRefused')
  })

  it('detects ServiceNotFound', () => {
    const sig = detectIssueSignature('service "backend-api" not found in namespace default')
    expect(sig.type).toBe('ServiceNotFound')
    expect(sig.resourceKind).toBe('Service')
  })

  it('detects ConfigMapNotFound', () => {
    const sig = detectIssueSignature('configmap "app-config" not found')
    expect(sig.type).toBe('ConfigMapNotFound')
    expect(sig.resourceKind).toBe('ConfigMap')
  })

  it('detects SecretNotFound', () => {
    const sig = detectIssueSignature('secret "db-creds" not found in namespace production')
    expect(sig.type).toBe('SecretNotFound')
    expect(sig.resourceKind).toBe('Secret')
  })

  it('detects PVCPending', () => {
    const sig = detectIssueSignature('PVC data-volume is pending, no matching StorageClass')
    expect(sig.type).toBe('PVCPending')
    expect(sig.resourceKind).toBe('PersistentVolumeClaim')
  })

  it('detects DeploymentFailed', () => {
    const sig = detectIssueSignature('deployment "web-app" failed to progress')
    expect(sig.type).toBe('DeploymentFailed')
    expect(sig.resourceKind).toBe('Deployment')
  })

  it('detects RolloutStuck', () => {
    const sig = detectIssueSignature('rollout is stuck waiting for new replicas')
    expect(sig.type).toBe('RolloutStuck')
    expect(sig.resourceKind).toBe('Deployment')
  })

  it('detects QuotaExceeded', () => {
    const sig = detectIssueSignature('resource quota exceeded in namespace dev')
    expect(sig.type).toBe('QuotaExceeded')
  })

  it('detects NetworkPolicy issue', () => {
    const sig = detectIssueSignature('traffic blocked by network policy in namespace prod')
    expect(sig.type).toBe('NetworkPolicy')
    expect(sig.resourceKind).toBe('NetworkPolicy')
  })

  it('detects OPA/Gatekeeper policy violation', () => {
    const sig = detectIssueSignature('gatekeeper violation: containers must not run as root')
    expect(sig.type).toBe('PolicyViolation')
  })

  it('detects OOMKilled from "memory limit" phrasing', () => {
    const sig = detectIssueSignature('container exceeded memory limit and was killed')
    expect(sig.type).toBe('OOMKilled')
    expect(sig.resourceKind).toBe('Pod')
  })

  it('extracts error pattern from "failed:" prefix', () => {
    const sig = detectIssueSignature(
      'CrashLoopBackOff failed: the application startup timed out after 30 seconds',
    )
    expect(sig.errorPattern).toBeDefined()
    expect(sig.errorPattern).toContain('application startup timed out')
  })

  it('extracts namespace from quoted format', () => {
    const sig = detectIssueSignature(
      'Pod CrashLoopBackOff in namespace "monitoring"',
    )
    expect(sig.namespace).toBe('monitoring')
  })

  it('returns no namespace when none is mentioned', () => {
    const sig = detectIssueSignature('CrashLoopBackOff on pod my-app-xyz')
    expect(sig.namespace).toBeUndefined()
  })
})
describe('calculateSignatureSimilarity', () => {
  it('returns 1 for identical signatures', () => {
    const sig: IssueSignature = { type: 'CrashLoopBackOff', resourceKind: 'Pod' }
    expect(calculateSignatureSimilarity(sig, sig)).toBe(1)
  })

  it('returns 0 for completely different signatures', () => {
    const a: IssueSignature = { type: 'OOMKilled', resourceKind: 'Pod' }
    const b: IssueSignature = { type: 'NodeNotReady', resourceKind: 'Node' }
    expect(calculateSignatureSimilarity(a, b)).toBe(0)
  })

  it('gives partial score when type matches but resourceKind differs', () => {
    const a: IssueSignature = { type: 'CrashLoopBackOff', resourceKind: 'Pod' }
    const b: IssueSignature = { type: 'CrashLoopBackOff', resourceKind: 'Deployment' }
    const score = calculateSignatureSimilarity(a, b)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })

  it('includes namespace weight when both have it', () => {
    const base: IssueSignature = { type: 'CrashLoopBackOff', resourceKind: 'Pod', namespace: 'default' }
    const same: IssueSignature = { type: 'CrashLoopBackOff', resourceKind: 'Pod', namespace: 'default' }
    const diff: IssueSignature = { type: 'CrashLoopBackOff', resourceKind: 'Pod', namespace: 'kube-system' }

    expect(calculateSignatureSimilarity(base, same)).toBeGreaterThan(
      calculateSignatureSimilarity(base, diff),
    )
  })

  it('returns 0 when both signatures have only empty type strings', () => {
    const a: IssueSignature = { type: '' }
    const b: IssueSignature = { type: '' }
    // Both types are empty strings — they match but test the edge case
    expect(calculateSignatureSimilarity(a, b)).toBe(0)
  })

  it('scores higher when errorPattern words overlap', () => {
    const base: IssueSignature = {
      type: 'CrashLoopBackOff',
      resourceKind: 'Pod',
      errorPattern: 'container exited with code 137',
    }
    const similar: IssueSignature = {
      type: 'CrashLoopBackOff',
      resourceKind: 'Pod',
      errorPattern: 'container exited with signal SIGKILL code 137',
    }
    const different: IssueSignature = {
      type: 'CrashLoopBackOff',
      resourceKind: 'Pod',
      errorPattern: 'missing configuration file for startup',
    }

    const scoreSimilar = calculateSignatureSimilarity(base, similar)
    const scoreDifferent = calculateSignatureSimilarity(base, different)
    expect(scoreSimilar).toBeGreaterThan(scoreDifferent)
  })

  it('handles type-only signatures without resourceKind', () => {
    const a: IssueSignature = { type: 'QuotaExceeded' }
    const b: IssueSignature = { type: 'QuotaExceeded' }
    // With only type matching, score should be 1.0 (3/3 factors)
    expect(calculateSignatureSimilarity(a, b)).toBe(1)
  })

  it('ignores namespace when only one side has it', () => {
    const withNs: IssueSignature = { type: 'OOMKilled', namespace: 'prod' }
    const withoutNs: IssueSignature = { type: 'OOMKilled' }
    // Namespace factor should be skipped entirely (not penalized)
    expect(calculateSignatureSimilarity(withNs, withoutNs)).toBe(1)
  })
})
