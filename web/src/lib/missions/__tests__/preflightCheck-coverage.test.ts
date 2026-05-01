/**
 * Additional coverage tests for preflightCheck.ts
 *
 * Targets uncovered branches in:
 * - classifyKubectlError (undefined/null guards, additional patterns)
 * - resolveRequiredTools
 * - runToolPreflightCheck
 * - getRemediationActions (MISSING_TOOLS, context-specific snippets, RBAC without details)
 * - runPreflightCheck catch branch (cross-realm errors, non-Error objects)
 * - generateRBACSnippet (namespace-scoped Role vs ClusterRole)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  classifyKubectlError,
  resolveRequiredTools,
  runToolPreflightCheck,
  runPreflightCheck,
  getRemediationActions,
  type PreflightError,
} from '../preflightCheck'

// ============================================================================
// classifyKubectlError — additional branches
// ============================================================================

describe('classifyKubectlError — additional branches', () => {
  it('treats the literal string "undefined" as empty stderr', () => {
    const result = classifyKubectlError('undefined', 'undefined', 1)
    expect(result.code).toBe('UNKNOWN_EXECUTION_FAILURE')
    // When both are "undefined" the message should be the fallback
    expect(result.message).toBe('An unknown error occurred while checking cluster access.')
  })

  it('classifies "invalid configuration" + "no configuration" as MISSING_CREDENTIALS', () => {
    const result = classifyKubectlError(
      'error: invalid configuration: no configuration has been provided',
      '',
      1,
    )
    expect(result.code).toBe('MISSING_CREDENTIALS')
  })

  it('classifies localhost:8080 refused without context as MISSING_CREDENTIALS', () => {
    const result = classifyKubectlError(
      'the connection to the server localhost:8080 was refused',
      '',
      1,
    )
    expect(result.code).toBe('MISSING_CREDENTIALS')
  })

  it('classifies "x509: certificate not yet valid" as EXPIRED_CREDENTIALS', () => {
    const result = classifyKubectlError(
      'x509: certificate signed by unknown authority or not yet valid',
      '',
      1,
    )
    expect(result.code).toBe('EXPIRED_CREDENTIALS')
  })

  it('classifies "token is expired" as EXPIRED_CREDENTIALS', () => {
    const result = classifyKubectlError(
      'error: token is expired',
      '',
      1,
    )
    expect(result.code).toBe('EXPIRED_CREDENTIALS')
  })

  it('classifies "credentials have expired" as EXPIRED_CREDENTIALS', () => {
    const result = classifyKubectlError(
      'error: credentials have expired, re-login required',
      '',
      1,
    )
    expect(result.code).toBe('EXPIRED_CREDENTIALS')
  })

  it('classifies "unable to connect to the server" + "tls" + "expired" as EXPIRED_CREDENTIALS', () => {
    const result = classifyKubectlError(
      'unable to connect to the server: tls certificate has expired',
      '',
      1,
    )
    expect(result.code).toBe('EXPIRED_CREDENTIALS')
  })

  it('classifies simple "forbidden" as RBAC_DENIED without details', () => {
    const result = classifyKubectlError('forbidden', '', 1)
    expect(result.code).toBe('RBAC_DENIED')
    expect(result.details).toBeUndefined()
  })

  it('classifies "user cannot get" pattern as RBAC_DENIED', () => {
    const result = classifyKubectlError(
      'user "admin" cannot get pods',
      '',
      1,
    )
    expect(result.code).toBe('RBAC_DENIED')
  })

  it('classifies "user cannot delete" as RBAC_DENIED', () => {
    const result = classifyKubectlError(
      'user "admin" cannot delete configmaps',
      '',
      1,
    )
    expect(result.code).toBe('RBAC_DENIED')
  })

  it('classifies "user cannot update" as RBAC_DENIED', () => {
    const result = classifyKubectlError(
      'user "admin" cannot update deployments',
      '',
      1,
    )
    expect(result.code).toBe('RBAC_DENIED')
  })

  it('classifies "user cannot patch" as RBAC_DENIED', () => {
    const result = classifyKubectlError(
      'user "admin" cannot patch services',
      '',
      1,
    )
    expect(result.code).toBe('RBAC_DENIED')
  })

  it('classifies "error from server (forbidden)" with non-zero exit as RBAC_DENIED', () => {
    const NON_ZERO_EXIT = 1
    const result = classifyKubectlError(
      'error from server (forbidden): access denied',
      '',
      NON_ZERO_EXIT,
    )
    expect(result.code).toBe('RBAC_DENIED')
  })

  it('classifies "no context exists with the name" as CONTEXT_NOT_FOUND', () => {
    const result = classifyKubectlError(
      'no context exists with the name "my-ctx"',
      '',
      1,
    )
    expect(result.code).toBe('CONTEXT_NOT_FOUND')
  })

  it('classifies "context does not exist" with name extraction', () => {
    const result = classifyKubectlError(
      'error: context "prod-west" does not exist',
      '',
      1,
    )
    expect(result.code).toBe('CONTEXT_NOT_FOUND')
    expect(result.details?.requestedContext).toBe('prod-west')
  })

  it('returns generic message when context name cannot be extracted', () => {
    const result = classifyKubectlError(
      'no context exists with the name specified',
      '',
      1,
    )
    expect(result.code).toBe('CONTEXT_NOT_FOUND')
    expect(result.message).toContain('not found in your kubeconfig')
    expect(result.details).toBeUndefined()
  })

  it('classifies "dial tcp" + "timeout" as CLUSTER_UNREACHABLE', () => {
    const result = classifyKubectlError(
      'dial tcp 10.0.0.1:6443: connect: timeout',
      '',
      1,
    )
    expect(result.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('classifies "context deadline exceeded" as CLUSTER_UNREACHABLE', () => {
    const result = classifyKubectlError(
      'context deadline exceeded',
      '',
      1,
    )
    expect(result.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('classifies "unable to connect to the server" as CLUSTER_UNREACHABLE', () => {
    const result = classifyKubectlError(
      'unable to connect to the server: connection reset by peer',
      '',
      1,
    )
    expect(result.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('classifies "the server was unable to return a response" as CLUSTER_UNREACHABLE', () => {
    const result = classifyKubectlError(
      'the server was unable to return a response in the time allotted',
      '',
      1,
    )
    expect(result.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('classifies "eof" + "connect" as CLUSTER_UNREACHABLE', () => {
    const result = classifyKubectlError(
      'connect: eof during connection',
      '',
      1,
    )
    expect(result.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('uses stdout in fallback message when stderr is empty', () => {
    const result = classifyKubectlError('', 'some output info', 1)
    expect(result.code).toBe('UNKNOWN_EXECUTION_FAILURE')
    expect(result.message).toBe('some output info')
  })
})

// ============================================================================
// resolveRequiredTools
// ============================================================================

describe('resolveRequiredTools', () => {
  it('returns explicit tools when provided', () => {
    const result = resolveRequiredTools('deploy', ['custom-tool', 'helm'])
    expect(result).toEqual(['custom-tool', 'helm'])
  })

  it('returns default tools when no mission type or explicit tools', () => {
    const result = resolveRequiredTools()
    expect(result).toContain('kubectl')
  })

  it('merges default and mission-type tools for "deploy"', () => {
    const result = resolveRequiredTools('deploy')
    expect(result).toContain('kubectl')
    expect(result).toContain('helm')
  })

  it('merges default and mission-type tools for "upgrade"', () => {
    const result = resolveRequiredTools('upgrade')
    expect(result).toContain('kubectl')
    expect(result).toContain('helm')
  })

  it('returns only kubectl for "troubleshoot" type', () => {
    const result = resolveRequiredTools('troubleshoot')
    expect(result).toEqual(['kubectl'])
  })

  it('returns only kubectl for "analyze" type', () => {
    const result = resolveRequiredTools('analyze')
    expect(result).toEqual(['kubectl'])
  })

  it('merges tools for "maintain" type', () => {
    const result = resolveRequiredTools('maintain')
    expect(result).toContain('kubectl')
    expect(result).toContain('helm')
  })

  it('returns only default tools for unknown mission type', () => {
    const result = resolveRequiredTools('unknown-type')
    expect(result).toEqual(['kubectl'])
  })

  it('deduplicates tools', () => {
    const result = resolveRequiredTools('repair')
    // repair needs kubectl, default also needs kubectl — should only appear once
    const kubectlCount = result.filter(t => t === 'kubectl').length
    const EXPECTED_SINGLE_OCCURRENCE = 1
    expect(kubectlCount).toBe(EXPECTED_SINGLE_OCCURRENCE)
  })

  it('falls back to type-based lookup when explicit tools array is empty', () => {
    // An empty array has length 0 (falsy), so resolveRequiredTools falls
    // through to the mission-type default tool set rather than returning [].
    const result = resolveRequiredTools('deploy', [])
    expect(result).toContain('helm')
  })
})

// ============================================================================
// runToolPreflightCheck
// ============================================================================

describe('runToolPreflightCheck', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns ok:true when all required tools are installed', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue([
        { name: 'helm', installed: true, version: '3.14.0', path: '/usr/local/bin/helm' },
      ]),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    const result = await runToolPreflightCheck('http://localhost:8585', ['kubectl', 'helm'])
    expect(result.ok).toBe(true)
    expect(result.tools.length).toBeGreaterThan(0)
  })

  it('returns missing tools error when a required tool is not installed', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue([
        { name: 'helm', installed: false },
      ]),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    const result = await runToolPreflightCheck('http://localhost:8585', ['kubectl', 'helm'])
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('MISSING_TOOLS')
    expect(result.error?.details?.missingTools).toContain('helm')
  })

  it('handles non-ok HTTP response', async () => {
    const SERVER_ERROR_STATUS = 500
    const mockResponse = {
      ok: false,
      status: SERVER_ERROR_STATUS,
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    const result = await runToolPreflightCheck('http://localhost:8585', ['kubectl'])
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('UNKNOWN_EXECUTION_FAILURE')
    expect(result.error?.message).toContain('500')
  })

  it('handles fetch error (agent unavailable)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'))

    const result = await runToolPreflightCheck('http://localhost:8585', ['kubectl'])
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('UNKNOWN_EXECUTION_FAILURE')
    expect(result.error?.message).toContain('fetch failed')
  })

  it('handles response with tools nested under "tools" key', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        tools: [
          { name: 'helm', installed: true, version: '3.14.0' },
        ],
      }),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    const result = await runToolPreflightCheck('http://localhost:8585', ['kubectl', 'helm'])
    expect(result.ok).toBe(true)
  })

  it('handles response with unexpected shape', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ unexpected: 'data' }),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    // kubectl is always added as installed, so only kubectl is fine
    const result = await runToolPreflightCheck('http://localhost:8585', ['kubectl'])
    expect(result.ok).toBe(true)
  })

  it('handles non-Error thrown exceptions', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue('string error')

    const result = await runToolPreflightCheck('http://localhost:8585', ['kubectl'])
    expect(result.ok).toBe(false)
    expect(result.error?.message).toContain('string error')
  })
})

// ============================================================================
// runPreflightCheck — additional catch branch coverage
// ============================================================================

describe('runPreflightCheck — catch branch coverage', () => {
  it('handles cross-realm error with undefined message', async () => {
    const crossRealmError = { message: undefined }
    const exec = vi.fn().mockRejectedValue(crossRealmError)

    const result = await runPreflightCheck(exec)
    expect(result.ok).toBe(false)
    // Falls through to String(err) path → '[object Object]' classified as UNKNOWN_EXECUTION_FAILURE
    expect(result.error?.code).toBe('UNKNOWN_EXECUTION_FAILURE')
  })

  it('handles non-Error thrown value (string)', async () => {
    const exec = vi.fn().mockRejectedValue('raw string error')

    const result = await runPreflightCheck(exec)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('UNKNOWN_EXECUTION_FAILURE')
    expect(result.error?.message).toBe('raw string error')
  })

  it('handles null thrown value', async () => {
    const exec = vi.fn().mockRejectedValue(null)

    const result = await runPreflightCheck(exec)
    expect(result.ok).toBe(false)
    // null is normalized to 'Unknown execution error' via String(null ?? 'Unknown execution error')
    expect(result.error?.code).toBe('UNKNOWN_EXECUTION_FAILURE')
    expect(result.error?.message).toBe('Unknown execution error')
  })

  it('handles "unavailable" in exception message as CLUSTER_UNREACHABLE', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('Service unavailable'))

    const result = await runPreflightCheck(exec)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('passes context through in error results from exceptions', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('random error'))

    const result = await runPreflightCheck(exec, 'my-context')
    expect(result.ok).toBe(false)
    expect(result.context).toBe('my-context')
  })
})

// ============================================================================
// getRemediationActions — additional branches
// ============================================================================

describe('getRemediationActions — additional branches', () => {
  it('uses cloud provider login commands for MISSING_CREDENTIALS when context is provided', () => {
    const error: PreflightError = {
      code: 'MISSING_CREDENTIALS',
      message: 'No kubeconfig',
    }
    const actions = getRemediationActions(error, 'prod-ctx')
    const copyActions = actions.filter(a => a.actionType === 'copy')
    // The second copy action should include cloud provider commands
    expect(copyActions.some(a => a.codeSnippet?.includes('GKE'))).toBe(true)
  })

  it('uses generic snippet for MISSING_CREDENTIALS without context', () => {
    const error: PreflightError = {
      code: 'MISSING_CREDENTIALS',
      message: 'No kubeconfig',
    }
    const actions = getRemediationActions(error)
    const copyActions = actions.filter(a => a.actionType === 'copy')
    expect(copyActions.some(a => a.codeSnippet?.includes('kubectl config view'))).toBe(true)
  })

  it('uses generic snippet for EXPIRED_CREDENTIALS without context', () => {
    const error: PreflightError = {
      code: 'EXPIRED_CREDENTIALS',
      message: 'expired',
    }
    const actions = getRemediationActions(error)
    const copyAction = actions.find(a => a.actionType === 'copy')
    expect(copyAction?.codeSnippet).toContain('cloud provider login command')
  })

  it('handles RBAC_DENIED without details', () => {
    const error: PreflightError = {
      code: 'RBAC_DENIED',
      message: 'forbidden',
    }
    const actions = getRemediationActions(error)
    const infoAction = actions.find(a => a.actionType === 'info')
    expect(infoAction?.description).toContain('additional RBAC permissions')
    // No copy action for RBAC snippet since no verb/resource
    const rbacCopy = actions.find(a => a.codeSnippet?.includes('ClusterRole'))
    expect(rbacCopy).toBeUndefined()
  })

  it('generates namespace-scoped Role for RBAC with namespace', () => {
    const error: PreflightError = {
      code: 'RBAC_DENIED',
      message: 'forbidden',
      details: {
        verb: 'create',
        resource: 'pods',
        apiGroup: '',
        namespace: 'production',
      },
    }
    const actions = getRemediationActions(error)
    const rbacCopy = actions.find(a => a.codeSnippet?.includes('kind: Role'))
    expect(rbacCopy).toBeDefined()
    expect(rbacCopy?.codeSnippet).toContain('namespace: production')
    expect(rbacCopy?.codeSnippet).toContain('RoleBinding')
  })

  it('generates ClusterRole for RBAC without namespace', () => {
    const error: PreflightError = {
      code: 'RBAC_DENIED',
      message: 'forbidden',
      details: {
        verb: 'list',
        resource: 'nodes',
        apiGroup: '',
      },
    }
    const actions = getRemediationActions(error)
    const rbacCopy = actions.find(a => a.codeSnippet?.includes('ClusterRole'))
    expect(rbacCopy).toBeDefined()
    expect(rbacCopy?.codeSnippet).not.toContain('namespace:')
  })

  it('includes apiGroup in RBAC info when it is not core', () => {
    const error: PreflightError = {
      code: 'RBAC_DENIED',
      message: 'forbidden',
      details: {
        verb: 'get',
        resource: 'prometheusrules',
        apiGroup: 'monitoring.coreos.com',
      },
    }
    const actions = getRemediationActions(error)
    const infoAction = actions.find(a => a.actionType === 'info')
    expect(infoAction?.description).toContain('monitoring.coreos.com')
  })

  it('omits apiGroup from RBAC info when it is core', () => {
    const error: PreflightError = {
      code: 'RBAC_DENIED',
      message: 'forbidden',
      details: {
        verb: 'get',
        resource: 'pods',
        apiGroup: 'core',
      },
    }
    const actions = getRemediationActions(error)
    const infoAction = actions.find(a => a.actionType === 'info')
    // 'core' is the apiGroup but the condition checks !== 'core'
    expect(infoAction?.description).not.toContain('API group')
  })

  it('handles CONTEXT_NOT_FOUND without requestedContext', () => {
    const error: PreflightError = {
      code: 'CONTEXT_NOT_FOUND',
      message: 'context not found',
    }
    const actions = getRemediationActions(error)
    const listAction = actions.find(a => a.codeSnippet?.includes('kubectl config get-contexts'))
    expect(listAction).toBeDefined()
    expect(listAction?.description).toContain('not found')
  })

  it('handles MISSING_TOOLS with tool list', () => {
    const error: PreflightError = {
      code: 'MISSING_TOOLS',
      message: 'Required tools not found: helm, kind',
      details: { missingTools: ['helm', 'kind'] },
    }
    const actions = getRemediationActions(error)
    const brewAction = actions.find(a => a.label?.includes('Homebrew'))
    expect(brewAction).toBeDefined()
    expect(brewAction?.codeSnippet).toContain('brew install helm')
    expect(brewAction?.codeSnippet).toContain('brew install kind')

    const wingetAction = actions.find(a => a.label?.includes('winget'))
    expect(wingetAction).toBeDefined()
    // 'kind' has a mapped winget package
    expect(wingetAction?.codeSnippet).toContain('winget install Kubernetes.kind')
  })

  it('handles MISSING_TOOLS with no tool list', () => {
    const error: PreflightError = {
      code: 'MISSING_TOOLS',
      message: 'Missing required tools',
    }
    const actions = getRemediationActions(error)
    // Should still have info + retry but no brew/winget
    expect(actions.some(a => a.actionType === 'info')).toBe(true)
    expect(actions.some(a => a.actionType === 'retry')).toBe(true)
    expect(actions.find(a => a.label?.includes('Homebrew'))).toBeUndefined()
  })

  it('includes context in CLUSTER_UNREACHABLE snippet when provided', () => {
    const error: PreflightError = {
      code: 'CLUSTER_UNREACHABLE',
      message: 'Connection refused',
    }
    const actions = getRemediationActions(error, 'staging-ctx')
    const copyAction = actions.find(a => a.actionType === 'copy')
    expect(copyAction?.codeSnippet).toContain('--context=staging-ctx')
  })

  it('uses generic snippet for CLUSTER_UNREACHABLE without context', () => {
    const error: PreflightError = {
      code: 'CLUSTER_UNREACHABLE',
      message: 'Connection refused',
    }
    const actions = getRemediationActions(error)
    const copyAction = actions.find(a => a.actionType === 'copy')
    expect(copyAction?.codeSnippet).toBe('kubectl cluster-info')
  })
})
