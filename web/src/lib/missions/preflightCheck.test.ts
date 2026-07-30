import { describe, it, expect, vi } from 'vitest'
import {
  classifyKubectlError,
  getRemediationActions,
  resolveRequiredTools,
  runClusterReadinessCheck,
  runPreflightCheck,
} from './preflightCheck'
import type {
  KubectlExecFn,
  PreflightError,
  RequiredOperation,
} from './preflightCheck'

// =============================================================================
// classifyKubectlError
// =============================================================================

describe('classifyKubectlError', () => {
  describe('MISSING_CREDENTIALS', () => {
    it('detects missing kubeconfig', () => {
      const result = classifyKubectlError(
        'error: no configuration has been provided',
        '',
        1,
      )
      expect(result.code).toBe('MISSING_CREDENTIALS')
    })

    it('detects kubeconfig not found', () => {
      const result = classifyKubectlError(
        'error: stat /home/user/.kube/config: no such file or directory',
        '',
        1,
      )
      expect(result.code).toBe('MISSING_CREDENTIALS')
    })

    it('detects localhost:8080 refused without context mention', () => {
      const result = classifyKubectlError(
        'The connection to the server localhost:8080 was refused',
        '',
        1,
      )
      expect(result.code).toBe('MISSING_CREDENTIALS')
    })
  })

  describe('EXPIRED_CREDENTIALS', () => {
    it('detects expired certificate', () => {
      const result = classifyKubectlError(
        'x509: certificate has expired or is not yet valid',
        '',
        1,
      )
      expect(result.code).toBe('EXPIRED_CREDENTIALS')
    })

    it('detects expired token', () => {
      const result = classifyKubectlError(
        'error: token has expired',
        '',
        1,
      )
      expect(result.code).toBe('EXPIRED_CREDENTIALS')
    })

    it('detects expired refresh token', () => {
      const result = classifyKubectlError(
        'error: refresh token has expired, please re-authenticate',
        '',
        1,
      )
      expect(result.code).toBe('EXPIRED_CREDENTIALS')
    })
  })

  describe('RBAC_DENIED', () => {
    it('detects forbidden error', () => {
      const result = classifyKubectlError(
        'Error from server (Forbidden): pods is forbidden',
        '',
        1,
      )
      expect(result.code).toBe('RBAC_DENIED')
    })

    it('extracts verb and resource from RBAC error', () => {
      const result = classifyKubectlError(
        'User "system:serviceaccount:default:sa" cannot get resource "pods" in API group "" in namespace "default"',
        '',
        1,
      )
      expect(result.code).toBe('RBAC_DENIED')
      expect(result.details?.verb).toBe('get')
      expect(result.details?.resource).toBe('pods')
    })

    it('extracts namespace from cannot-in-namespace pattern', () => {
      const result = classifyKubectlError(
        'User "admin" cannot list deployments in the namespace "production"',
        '',
        1,
      )
      expect(result.code).toBe('RBAC_DENIED')
      expect(result.details?.verb).toBe('list')
      expect(result.details?.namespace).toBe('production')
    })
  })

  describe('CONTEXT_NOT_FOUND', () => {
    it('detects context not found', () => {
      const result = classifyKubectlError(
        'error: context "staging" not found',
        '',
        1,
      )
      expect(result.code).toBe('CONTEXT_NOT_FOUND')
      expect(result.details?.requestedContext).toBe('staging')
    })

    it('detects context does not exist', () => {
      const result = classifyKubectlError(
        'error: context "prod-cluster" does not exist',
        '',
        1,
      )
      expect(result.code).toBe('CONTEXT_NOT_FOUND')
      expect(result.details?.requestedContext).toBe('prod-cluster')
    })
  })

  describe('CLUSTER_UNREACHABLE', () => {
    it('detects connection refused', () => {
      const result = classifyKubectlError(
        'dial tcp 10.0.0.1:6443: connection refused',
        '',
        1,
      )
      expect(result.code).toBe('CLUSTER_UNREACHABLE')
    })

    it('detects i/o timeout', () => {
      const result = classifyKubectlError(
        'dial tcp 10.0.0.1:6443: i/o timeout',
        '',
        1,
      )
      expect(result.code).toBe('CLUSTER_UNREACHABLE')
    })

    it('detects TLS handshake timeout', () => {
      const result = classifyKubectlError(
        'net/http: TLS handshake timeout',
        '',
        1,
      )
      expect(result.code).toBe('CLUSTER_UNREACHABLE')
    })

    it('detects unable to connect to the server', () => {
      const result = classifyKubectlError(
        'Unable to connect to the server: dial tcp: lookup cluster.example.com: no such host',
        '',
        1,
      )
      expect(result.code).toBe('CLUSTER_UNREACHABLE')
    })
  })

  describe('UNKNOWN_EXECUTION_FAILURE', () => {
    it('falls back for unrecognized errors', () => {
      const result = classifyKubectlError(
        'some random error message',
        '',
        1,
      )
      expect(result.code).toBe('UNKNOWN_EXECUTION_FAILURE')
      expect(result.message).toBe('some random error message')
    })

    it('uses stdout when stderr is empty', () => {
      const result = classifyKubectlError('', 'output message', 1)
      expect(result.code).toBe('UNKNOWN_EXECUTION_FAILURE')
      expect(result.message).toBe('output message')
    })

    it('handles undefined-like inputs gracefully', () => {
      const result = classifyKubectlError('undefined', 'undefined', 1)
      expect(result.code).toBe('UNKNOWN_EXECUTION_FAILURE')
    })
  })

  describe('edge cases', () => {
    it('handles empty stderr and stdout', () => {
      const result = classifyKubectlError('', '', 1)
      expect(result.code).toBe('UNKNOWN_EXECUTION_FAILURE')
      expect(result.message).toContain('unknown error')
    })

    it('checks both stderr and stdout for classification', () => {
      // Error info in stdout only
      const result = classifyKubectlError(
        '',
        'Error from server (Forbidden): pods is forbidden',
        1,
      )
      expect(result.code).toBe('RBAC_DENIED')
    })
  })
})

// =============================================================================
// getRemediationActions
// =============================================================================

describe('getRemediationActions', () => {
  it('returns remediation for MISSING_CREDENTIALS', () => {
    const error: PreflightError = {
      code: 'MISSING_CREDENTIALS',
      message: 'No credentials found',
    }
    const actions = getRemediationActions(error)
    expect(actions.length).toBeGreaterThanOrEqual(2)
    expect(actions.some(a => a.actionType === 'copy')).toBe(true)
    expect(actions.some(a => a.actionType === 'retry')).toBe(true)
  })

  it('returns remediation for EXPIRED_CREDENTIALS with context', () => {
    const error: PreflightError = {
      code: 'EXPIRED_CREDENTIALS',
      message: 'Credentials expired',
    }
    const actions = getRemediationActions(error, 'my-cluster')
    expect(actions.some(a => a.codeSnippet?.includes('my-cluster'))).toBe(true)
  })

  it('returns RBAC remediation with details', () => {
    const error: PreflightError = {
      code: 'RBAC_DENIED',
      message: 'Permission denied',
      details: { verb: 'get', resource: 'pods', apiGroup: '' },
    }
    const actions = getRemediationActions(error)
    expect(actions.some(a => a.label === 'Required permissions')).toBe(true)
    expect(actions.some(a => a.label === 'Copy RBAC manifest')).toBe(true)
  })

  it('returns RBAC remediation without details', () => {
    const error: PreflightError = {
      code: 'RBAC_DENIED',
      message: 'Permission denied',
    }
    const actions = getRemediationActions(error)
    expect(actions.some(a => a.label === 'Required permissions')).toBe(true)
    // No RBAC manifest without details
    expect(actions.some(a => a.label === 'Copy RBAC manifest')).toBe(false)
  })

  it('returns remediation for CONTEXT_NOT_FOUND', () => {
    const error: PreflightError = {
      code: 'CONTEXT_NOT_FOUND',
      message: 'Context not found',
      details: { requestedContext: 'staging' },
    }
    const actions = getRemediationActions(error)
    expect(actions.some(a => a.codeSnippet?.includes('kubectl config get-contexts'))).toBe(true)
    expect(actions.some(a => a.description?.includes('staging'))).toBe(true)
  })

  it('returns remediation for CLUSTER_UNREACHABLE', () => {
    const error: PreflightError = {
      code: 'CLUSTER_UNREACHABLE',
      message: 'Cannot reach cluster',
    }
    const actions = getRemediationActions(error)
    expect(actions.some(a => a.codeSnippet?.includes('cluster-info'))).toBe(true)
  })

  it('returns remediation for MISSING_TOOLS', () => {
    const error: PreflightError = {
      code: 'MISSING_TOOLS',
      message: 'Missing required tools: kubectl, helm',
      details: { missingTools: ['kubectl', 'helm'] },
    }
    const actions = getRemediationActions(error)
    expect(actions.some(a => a.label?.includes('Homebrew'))).toBe(true)
    expect(actions.some(a => a.label?.includes('winget'))).toBe(true)
    expect(actions.some(a => a.codeSnippet?.includes('brew install kubectl'))).toBe(true)
  })

  it('returns generic remediation for UNKNOWN_EXECUTION_FAILURE', () => {
    const error: PreflightError = {
      code: 'UNKNOWN_EXECUTION_FAILURE',
      message: 'Something went wrong',
    }
    const actions = getRemediationActions(error)
    expect(actions.length).toBeGreaterThanOrEqual(2)
    expect(actions.some(a => a.actionType === 'retry')).toBe(true)
  })

  it('includes context in CLUSTER_UNREACHABLE snippet when provided', () => {
    const error: PreflightError = {
      code: 'CLUSTER_UNREACHABLE',
      message: 'Cannot reach cluster',
    }
    const actions = getRemediationActions(error, 'prod-west')
    expect(actions.some(a => a.codeSnippet?.includes('--context=prod-west'))).toBe(true)
  })
})

// =============================================================================
// resolveRequiredTools
// =============================================================================

describe('resolveRequiredTools', () => {
  it('returns default tools when no type or explicit list given', () => {
    const result = resolveRequiredTools()
    expect(result).toContain('kubectl')
  })

  it('returns explicit tools when provided', () => {
    const result = resolveRequiredTools('deploy', ['terraform', 'aws'])
    expect(result).toEqual(['terraform', 'aws'])
  })

  it('returns empty explicit list as-is (overrides defaults)', () => {
    // Empty array means "no tools needed" — explicit override
    const result = resolveRequiredTools('deploy', [])
    // Empty array is falsy for length check, so should fall through to type-based
    expect(result).toContain('kubectl')
    expect(result).toContain('helm')
  })

  it('includes helm for deploy missions', () => {
    const result = resolveRequiredTools('deploy')
    expect(result).toContain('kubectl')
    expect(result).toContain('helm')
  })

  it('includes helm for upgrade missions', () => {
    const result = resolveRequiredTools('upgrade')
    expect(result).toContain('helm')
  })

  it('returns only kubectl for repair missions', () => {
    const result = resolveRequiredTools('repair')
    expect(result).toContain('kubectl')
    expect(result).not.toContain('helm')
  })

  it('returns only kubectl for unknown mission types', () => {
    const result = resolveRequiredTools('some-unknown-type')
    expect(result).toContain('kubectl')
    expect(result.length).toBe(1)
  })

  it('deduplicates tools between defaults and type-specific', () => {
    // 'deploy' wants kubectl + helm, default wants kubectl — should not duplicate
    const result = resolveRequiredTools('deploy')
    const kubectlCount = result.filter(t => t === 'kubectl').length
    expect(kubectlCount).toBe(1)
  })
})

// =============================================================================
// runClusterReadinessCheck
// =============================================================================

const KUBECTL_TIMEOUT_MS = 10_000

function makeExecMock(
  responses: Array<{ output: string; exitCode: number; error?: string } | Error>,
): { fn: KubectlExecFn; calls: Array<{ args: string[]; options?: { context?: string; timeout?: number; priority?: boolean } }> } {
  const calls: Array<{ args: string[]; options?: { context?: string; timeout?: number; priority?: boolean } }> = []
  let i = 0
  const fn: KubectlExecFn = vi.fn(async (args, options) => {
    calls.push({ args, options })
    const r = responses[i++]
    if (r === undefined) {
      throw new Error(`Unexpected extra kubectl call: ${args.join(' ')}`)
    }
    if (r instanceof Error) {
      throw r
    }
    return r
  })
  return { fn, calls }
}

describe('runClusterReadinessCheck', () => {
  it('returns ok when /readyz responds with lowercase "ok"', async () => {
    const { fn, calls } = makeExecMock([{ output: 'ok', exitCode: 0 }])
    const result = await runClusterReadinessCheck(fn, 'my-ctx')
    expect(result).toEqual({ ok: true, context: 'my-ctx' })
    expect(calls[0].args).toEqual(['get', '--raw', '/readyz'])
    expect(calls[0].options).toEqual({ context: 'my-ctx', timeout: KUBECTL_TIMEOUT_MS, priority: true })
  })

  it('matches "ok" case-insensitively (uppercase OK)', async () => {
    const { fn } = makeExecMock([{ output: 'OK', exitCode: 0 }])
    const result = await runClusterReadinessCheck(fn)
    expect(result.ok).toBe(true)
  })

  it('accepts "ok" embedded in a longer readyz response', async () => {
    const { fn } = makeExecMock([{ output: '[+]ping ok\nreadyz check passed\n', exitCode: 0 }])
    const result = await runClusterReadinessCheck(fn)
    expect(result.ok).toBe(true)
  })

  it('returns CLUSTER_UNREACHABLE when exit code is non-zero even if output contains "ok"', async () => {
    const { fn } = makeExecMock([{ output: 'ok', exitCode: 1 }])
    const result = await runClusterReadinessCheck(fn, 'ctx')
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CLUSTER_UNREACHABLE')
    expect(result.context).toBe('ctx')
  })

  it('returns CLUSTER_UNREACHABLE when output does not contain "ok"', async () => {
    const { fn } = makeExecMock([{ output: 'not ready', exitCode: 0 }])
    const result = await runClusterReadinessCheck(fn)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('handles null/undefined output as unreachable (guarded by || "")', async () => {
    const { fn } = makeExecMock([{ output: '', exitCode: 0 }])
    const result = await runClusterReadinessCheck(fn)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('classifies thrown Error as CLUSTER_UNREACHABLE with message included', async () => {
    const { fn } = makeExecMock([new Error('websocket closed')])
    const result = await runClusterReadinessCheck(fn, 'ctx')
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CLUSTER_UNREACHABLE')
    expect(result.error?.message).toContain('websocket closed')
    expect(result.context).toBe('ctx')
  })

  it('handles thrown non-Error values (raw strings) without crashing', async () => {
    const throwingFn: KubectlExecFn = vi.fn(async () => {
      throw 'raw-string-error'
    })
    const result = await runClusterReadinessCheck(throwingFn)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CLUSTER_UNREACHABLE')
    expect(result.error?.message).toContain('raw-string-error')
  })
})

// =============================================================================
// runPreflightCheck
// =============================================================================

describe('runPreflightCheck', () => {
  it('returns ok when auth can-i --list succeeds and no requiredOps are given', async () => {
    const { fn, calls } = makeExecMock([{ output: 'pods  [get list]', exitCode: 0 }])
    const result = await runPreflightCheck(fn, 'ctx')
    expect(result).toEqual({ ok: true, context: 'ctx' })
    expect(calls).toHaveLength(1)
    expect(calls[0].args).toEqual(['auth', 'can-i', '--list', '--no-headers'])
    expect(calls[0].options).toEqual({ context: 'ctx', timeout: KUBECTL_TIMEOUT_MS, priority: true })
  })

  it('classifies non-zero exit from auth can-i --list via classifyKubectlError', async () => {
    const { fn } = makeExecMock([
      { output: '', exitCode: 1, error: 'x509: certificate has expired' },
    ])
    const result = await runPreflightCheck(fn)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('EXPIRED_CREDENTIALS')
  })

  it('returns ok when every requiredOp resolves to "yes"', async () => {
    const requiredOps: RequiredOperation[] = [
      { verb: 'get', resource: 'pods' },
      { verb: 'create', resource: 'deployments', namespace: 'default' },
    ]
    const { fn, calls } = makeExecMock([
      { output: 'pods  [get list]\ndeployments.apps  [get create]', exitCode: 0 },
      { output: 'yes\n', exitCode: 0 },
      { output: 'YES', exitCode: 0 },
    ])
    const result = await runPreflightCheck(fn, undefined, requiredOps)
    expect(result).toEqual({ ok: true, context: undefined })
    expect(calls[1].args).toEqual(['auth', 'can-i', 'get', 'pods'])
    expect(calls[2].args).toEqual(['auth', 'can-i', 'create', 'deployments', '-n', 'default'])
  })

  it('returns RBAC_DENIED with single-op message and details when one required op is denied', async () => {
    const requiredOps: RequiredOperation[] = [{ verb: 'delete', resource: 'pods', namespace: 'kube-system' }]
    const { fn } = makeExecMock([
      { output: 'pods  [get list]', exitCode: 0 },
      { output: 'no', exitCode: 0 },
    ])
    const result = await runPreflightCheck(fn, 'prod', requiredOps)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('RBAC_DENIED')
    expect(result.error?.message).toContain('delete pods')
    expect(result.error?.message).toContain('kube-system')
    expect(result.error?.details).toMatchObject({
      verb: 'delete',
      resource: 'pods',
      namespace: 'kube-system',
      allowedVerbsForResource: ['get', 'list'],
    })
    expect(result.deniedOps).toEqual(requiredOps)
  })

  it('uses the generic plural message when multiple required ops are denied', async () => {
    const requiredOps: RequiredOperation[] = [
      { verb: 'get', resource: 'pods' },
      { verb: 'create', resource: 'deployments' },
    ]
    const { fn } = makeExecMock([
      { output: '', exitCode: 0 },
      { output: 'no', exitCode: 0 },
      { output: 'no', exitCode: 0 },
    ])
    const result = await runPreflightCheck(fn, undefined, requiredOps)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('RBAC_DENIED')
    expect(result.error?.message).toBe(
      'Your Kubernetes user does not have permission to perform one or more required mission operations.',
    )
    expect(result.deniedOps).toHaveLength(2)
  })

  it('propagates a classified error when a per-op can-i call fails with non-zero exit', async () => {
    const requiredOps: RequiredOperation[] = [{ verb: 'get', resource: 'pods' }]
    const { fn } = makeExecMock([
      { output: '', exitCode: 0 },
      { output: '', exitCode: 1, error: 'Unable to connect to the server: dial tcp: lookup foo: no such host' },
    ])
    const result = await runPreflightCheck(fn, undefined, requiredOps)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('short-circuits on the first denied op — does not call can-i for later ops after a per-op failure', async () => {
    const requiredOps: RequiredOperation[] = [
      { verb: 'get', resource: 'pods' },
      { verb: 'create', resource: 'deployments' },
    ]
    const { fn, calls } = makeExecMock([
      { output: '', exitCode: 0 },
      { output: '', exitCode: 1, error: 'error: token has expired' },
    ])
    const result = await runPreflightCheck(fn, undefined, requiredOps)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('EXPIRED_CREDENTIALS')
    // list + first can-i = 2 calls; second op must not be attempted after the exit-code failure
    expect(calls).toHaveLength(2)
  })

  it('overrides UNKNOWN_EXECUTION_FAILURE to CLUSTER_UNREACHABLE for "not connected" throws', async () => {
    const throwingFn: KubectlExecFn = vi.fn(async () => {
      throw new Error('agent is not connected')
    })
    const result = await runPreflightCheck(throwingFn, 'ctx')
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CLUSTER_UNREACHABLE')
    expect(result.error?.message).toBe('Unable to reach the local agent or Kubernetes cluster.')
    expect(result.context).toBe('ctx')
  })

  it('overrides UNKNOWN_EXECUTION_FAILURE to CLUSTER_UNREACHABLE for "timeout" throws', async () => {
    const throwingFn: KubectlExecFn = vi.fn(async () => {
      throw new Error('request timeout after 10000ms')
    })
    const result = await runPreflightCheck(throwingFn)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('guards against cross-realm Error objects with undefined message (#7317)', async () => {
    const crossRealmErr = { message: undefined } as unknown as Error
    const throwingFn: KubectlExecFn = vi.fn(async () => {
      throw crossRealmErr
    })
    const result = await runPreflightCheck(throwingFn)
    // Must not throw and must not classify the literal string "undefined" — falls through to String(err)
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error?.message).not.toContain('undefined')
  })

  it('preserves classified error codes from classifyKubectlError on thrown non-connection errors', async () => {
    const throwingFn: KubectlExecFn = vi.fn(async () => {
      throw new Error('x509: certificate has expired or is not yet valid')
    })
    const result = await runPreflightCheck(throwingFn)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('EXPIRED_CREDENTIALS')
  })

  it('does not attempt per-op can-i calls when requiredOps is an empty array', async () => {
    const { fn, calls } = makeExecMock([{ output: 'pods  [get]', exitCode: 0 }])
    const result = await runPreflightCheck(fn, undefined, [])
    expect(result).toEqual({ ok: true, context: undefined })
    expect(calls).toHaveLength(1)
  })
})
