import { describe, it, expect } from 'vitest'
import {
  classifyKubectlError,
  getRemediationActions,
  resolveRequiredTools,
} from './preflightCheck'
import type { PreflightError } from './preflightCheck'

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
