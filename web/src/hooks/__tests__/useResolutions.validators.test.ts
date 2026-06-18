import { describe, it, expect } from 'vitest'
import { detectIssueSignature } from '../useResolutions'

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

