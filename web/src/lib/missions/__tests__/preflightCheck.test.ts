import { describe, it, expect, vi } from 'vitest'
import {
  classifyKubectlError,
  runPreflightCheck,
  getRemediationActions,
  type PreflightError,
  type PreflightErrorCode,
} from '../preflightCheck'

// ============================================================================
// classifyKubectlError
// ============================================================================

describe('classifyKubectlError', () => {
  it('classifies missing kubeconfig as MISSING_CREDENTIALS', () => {
    const result = classifyKubectlError(
      'error: no configuration has been provided, try setting KUBERNETES_MASTER environment variable',
      '',
      1,
    )
    expect(result.code).toBe('MISSING_CREDENTIALS')
  })

  it('classifies missing .kube/config file as MISSING_CREDENTIALS', () => {
    const result = classifyKubectlError(
      'stat /home/user/.kube/config: no such file or directory',
      '',
      1,
    )
    expect(result.code).toBe('MISSING_CREDENTIALS')
  })

  it('classifies expired certificate as EXPIRED_CREDENTIALS', () => {
    const result = classifyKubectlError(
      'Unable to connect to the server: x509: certificate has expired or is not yet valid',
      '',
      1,
    )
    expect(result.code).toBe('EXPIRED_CREDENTIALS')
  })

  it('classifies expired token as EXPIRED_CREDENTIALS', () => {
    const result = classifyKubectlError(
      'error: You must be logged in to the server (the token has expired)',
      '',
      1,
    )
    expect(result.code).toBe('EXPIRED_CREDENTIALS')
  })

  it('classifies expired refresh token as EXPIRED_CREDENTIALS', () => {
    const result = classifyKubectlError(
      'error: refresh token has expired, please re-authenticate',
      '',
      1,
    )
    expect(result.code).toBe('EXPIRED_CREDENTIALS')
  })

  it('classifies RBAC forbidden as RBAC_DENIED', () => {
    const result = classifyKubectlError(
      'Error from server (Forbidden): clusterroles.rbac.authorization.k8s.io is forbidden: User "system:serviceaccount:default:console" cannot list resource "clusterroles" in API group "rbac.authorization.k8s.io" at the cluster scope',
      '',
      1,
    )
    expect(result.code).toBe('RBAC_DENIED')
    expect(result.details?.verb).toBe('list')
    expect(result.details?.resource).toBe('clusterroles')
    expect(result.details?.apiGroup).toBe('rbac.authorization.k8s.io')
  })

  it('classifies namespace-scoped RBAC denial', () => {
    const result = classifyKubectlError(
      'Error from server (Forbidden): User "dev-user" cannot create pods in the namespace "production"',
      '',
      1,
    )
    expect(result.code).toBe('RBAC_DENIED')
    expect(result.details?.verb).toBe('create')
    expect(result.details?.resource).toBe('pods')
    expect(result.details?.namespace).toBe('production')
  })

  it('classifies context not found as CONTEXT_NOT_FOUND', () => {
    const result = classifyKubectlError(
      'error: context "staging-cluster" not found',
      '',
      1,
    )
    expect(result.code).toBe('CONTEXT_NOT_FOUND')
    expect(result.details?.requestedContext).toBe('staging-cluster')
  })

  it('classifies connection refused as CLUSTER_UNREACHABLE', () => {
    const result = classifyKubectlError(
      'The connection to the server 192.168.1.100:6443 was refused - did you specify the right host or port?',
      '',
      1,
    )
    expect(result.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('classifies DNS resolution failure as CLUSTER_UNREACHABLE', () => {
    const result = classifyKubectlError(
      'dial tcp: lookup api.mycluster.example.com: no such host',
      '',
      1,
    )
    expect(result.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('classifies i/o timeout as CLUSTER_UNREACHABLE', () => {
    const result = classifyKubectlError(
      'Unable to connect to the server: dial tcp 10.0.0.1:6443: i/o timeout',
      '',
      1,
    )
    expect(result.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('classifies TLS handshake timeout as CLUSTER_UNREACHABLE', () => {
    const result = classifyKubectlError(
      'Unable to connect to the server: net/http: TLS handshake timeout',
      '',
      1,
    )
    expect(result.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('falls back to UNKNOWN_EXECUTION_FAILURE for unrecognized errors', () => {
    const result = classifyKubectlError(
      'some completely unexpected error message',
      '',
      1,
    )
    expect(result.code).toBe('UNKNOWN_EXECUTION_FAILURE')
    expect(result.message).toContain('some completely unexpected error message')
  })

  it('uses stdout when stderr is empty', () => {
    const result = classifyKubectlError(
      '',
      'error: context "missing" does not exist',
      1,
    )
    expect(result.code).toBe('CONTEXT_NOT_FOUND')
  })
})

// ============================================================================
// runPreflightCheck
// ============================================================================

describe('runPreflightCheck', () => {
  it('returns ok:true when kubectl auth can-i succeeds', async () => {
    const exec = vi.fn().mockResolvedValue({
      output: 'Resources  Non-Resource URLs  Resource Names  Verbs\n*.*  []  []  [*]',
      exitCode: 0,
    })

    const result = await runPreflightCheck(exec, 'my-cluster')
    expect(result.ok).toBe(true)
    expect(result.context).toBe('my-cluster')
    expect(exec).toHaveBeenCalledWith(
      ['auth', 'can-i', '--list', '--no-headers'],
      { context: 'my-cluster', timeout: 10_000, priority: true },
    )
  })

  it('returns structured error when kubectl fails with RBAC error', async () => {
    const exec = vi.fn().mockResolvedValue({
      output: '',
      exitCode: 1,
      error: 'Error from server (Forbidden): User "test" cannot list resource "pods" in API group "" at the cluster scope',
    })

    const result = await runPreflightCheck(exec, 'prod')
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('RBAC_DENIED')
    expect(result.context).toBe('prod')
  })

  it('handles connection-level exceptions as CLUSTER_UNREACHABLE', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('Not connected to local agent'))

    const result = await runPreflightCheck(exec)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('handles agent timeout as CLUSTER_UNREACHABLE', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('Connection timeout after 2500ms'))

    const result = await runPreflightCheck(exec)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('classifies non-connection errors from exceptions', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('stat /home/user/.kube/config: no such file or directory'))

    const result = await runPreflightCheck(exec)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('MISSING_CREDENTIALS')
  })
})

// ============================================================================
// getRemediationActions
// ============================================================================

describe('getRemediationActions', () => {
  const errorCodes: PreflightErrorCode[] = [
    'MISSING_CREDENTIALS',
    'EXPIRED_CREDENTIALS',
    'RBAC_DENIED',
    'CONTEXT_NOT_FOUND',
    'CLUSTER_UNREACHABLE',
    'UNKNOWN_EXECUTION_FAILURE',
  ]

  it.each(errorCodes)('returns non-empty actions for %s', (code) => {
    const error: PreflightError = { code, message: 'test' }
    const actions = getRemediationActions(error)
    expect(actions.length).toBeGreaterThan(0)
    // Every error type should have a retry action
    expect(actions.some(a => a.actionType === 'retry')).toBe(true)
  })

  it('generates RBAC snippet when verb and resource are provided', () => {
    const error: PreflightError = {
      code: 'RBAC_DENIED',
      message: 'forbidden',
      details: { verb: 'create', resource: 'clusterpolicies', apiGroup: 'kyverno.io' },
    }
    const actions = getRemediationActions(error)
    const copyAction = actions.find(a => a.actionType === 'copy' && a.codeSnippet?.includes('ClusterRole'))
    expect(copyAction).toBeDefined()
    expect(copyAction?.codeSnippet).toContain('kyverno.io')
    expect(copyAction?.codeSnippet).toContain('clusterpolicies')
    expect(copyAction?.codeSnippet).toContain('create')
  })

  it('includes context name in CONTEXT_NOT_FOUND remediation', () => {
    const error: PreflightError = {
      code: 'CONTEXT_NOT_FOUND',
      message: 'context "staging" not found',
      details: { requestedContext: 'staging' },
    }
    const actions = getRemediationActions(error)
    expect(actions.some(a => a.description.includes('staging'))).toBe(true)
  })

  it('includes context in credential refresh commands', () => {
    const error: PreflightError = {
      code: 'EXPIRED_CREDENTIALS',
      message: 'token expired',
    }
    const actions = getRemediationActions(error, 'prod-cluster')
    const copyAction = actions.find(a => a.actionType === 'copy')
    expect(copyAction?.codeSnippet).toContain('prod-cluster')
  })
})
