/**
 * Extended coverage tests for preflightCheck.ts
 *
 * Covers:
 *  - resolveRequiredTools (lines ~416-424)
 *  - runToolPreflightCheck (lines ~433-505)
 *  - generateRBACSnippet namespace path via getRemediationActions (lines 526-542)
 *  - MISSING_TOOLS branch in getRemediationActions (lines ~284-321)
 *  - classifyKubectlError: localhost:8080 refused + credentials_have_expired paths
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  resolveRequiredTools,
  runToolPreflightCheck,
  getRemediationActions,
  classifyKubectlError,
  type PreflightError,
} from '../preflightCheck'

// ============================================================================
// resolveRequiredTools
// ============================================================================

describe('resolveRequiredTools', () => {
  it('returns explicit tools when provided', () => {
    const result = resolveRequiredTools('deploy', ['helm', 'kustomize'])
    expect(result).toEqual(['helm', 'kustomize'])
  })

  it('returns kubectl by default when no type and no explicit tools', () => {
    const result = resolveRequiredTools()
    expect(result).toContain('kubectl')
  })

  it('includes helm for deploy type', () => {
    const result = resolveRequiredTools('deploy')
    expect(result).toContain('kubectl')
    expect(result).toContain('helm')
  })

  it('includes helm for upgrade type', () => {
    const result = resolveRequiredTools('upgrade')
    expect(result).toContain('kubectl')
    expect(result).toContain('helm')
  })

  it('returns only kubectl for repair type', () => {
    const result = resolveRequiredTools('repair')
    expect(result).toContain('kubectl')
    expect(result).not.toContain('helm')
  })

  it('returns only kubectl for troubleshoot type', () => {
    const result = resolveRequiredTools('troubleshoot')
    expect(result).toContain('kubectl')
  })

  it('falls back to default tools for unknown mission type', () => {
    const result = resolveRequiredTools('unknown-type')
    expect(result).toContain('kubectl')
  })

  it('deduplicates kubectl when type also requires kubectl', () => {
    const result = resolveRequiredTools('repair')
    const kubectlCount = result.filter(t => t === 'kubectl').length
    expect(kubectlCount).toBe(1)
  })
})

// ============================================================================
// runToolPreflightCheck
// ============================================================================

describe('runToolPreflightCheck', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns ok:true when all required tools are detected', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { name: 'kubectl', installed: true, path: '/usr/local/bin/kubectl' },
        { name: 'helm', installed: true, version: 'v3.14.0', path: '/usr/local/bin/helm' },
      ],
    } as Response)

    const result = await runToolPreflightCheck('http://localhost:8585', ['kubectl', 'helm'])
    expect(result.ok).toBe(true)
    expect(result.tools.length).toBeGreaterThan(0)
    expect(result.error).toBeUndefined()
  })

  it('returns ok:false with MISSING_TOOLS when a required tool is absent', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response)

    const result = await runToolPreflightCheck('http://localhost:8585', ['kubectl', 'helm'])
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('MISSING_TOOLS')
    expect(result.error?.details?.missingTools).toContain('helm')
  })

  it('requests fresh detection for the required tools on every run', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ name: 'helm', installed: false }],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ name: 'helm', installed: true, path: '/usr/local/bin/helm' }],
      } as Response)

    const first = await runToolPreflightCheck('http://localhost:8585', ['helm'])
    const second = await runToolPreflightCheck('http://localhost:8585', ['helm'])

    expect(first.ok).toBe(false)
    expect(second.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain('tool=helm')
    expect(mockFetch.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store' })
    expect(String(mockFetch.mock.calls[1]?.[0])).toContain('tool=helm')
  })

  it('handles API response wrapped in a tools array', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tools: [
          { name: 'kubectl', installed: true, path: '/usr/local/bin/kubectl' },
          { name: 'helm', installed: true, version: 'v3.14.0', path: '/usr/local/bin/helm' },
        ],
      }),
    } as Response)

    const result = await runToolPreflightCheck('http://localhost:8585', ['kubectl', 'helm'])
    expect(result.ok).toBe(true)
    const helmResult = result.tools.find(t => t.name === 'helm')
    expect(helmResult?.installed).toBe(true)
  })

  it.each([401, 403])('returns auth-specific error for HTTP %s', async (status) => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status,
      json: async () => ({}),
    } as Response)

    const result = await runToolPreflightCheck('http://localhost:8585', ['kubectl'])
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('UNKNOWN_EXECUTION_FAILURE')
    expect(result.error?.message).toBe('Agent authentication failed. Check that KC_AGENT_TOKEN is correctly set and matches between the console and kc-agent.')
  })

  it('returns reachability-specific error for HTTP 503', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response)

    const result = await runToolPreflightCheck('http://localhost:8585', ['kubectl'])
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('UNKNOWN_EXECUTION_FAILURE')
    expect(result.error?.message).toBe('Agent is not reachable. Is kc-agent running on port 8585?')
  })

  it('returns generic HTTP error for other status codes', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response)

    const result = await runToolPreflightCheck('http://localhost:8585', ['kubectl'])
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('UNKNOWN_EXECUTION_FAILURE')
    expect(result.error?.message).toBe('Tool check request failed (HTTP 500).')
  })

  it('returns reachability-specific error on fetch network error', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'))

    const result = await runToolPreflightCheck('http://localhost:8585', ['kubectl'])
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('UNKNOWN_EXECUTION_FAILURE')
    expect(result.error?.message).toBe('Agent is not reachable. Is kc-agent running on port 8585?')
  })

  it('returns reachability-specific error on timeout', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockRejectedValueOnce(new Error('Connection timed out'))

    const result = await runToolPreflightCheck('http://localhost:8585', ['kubectl'])
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('UNKNOWN_EXECUTION_FAILURE')
    expect(result.error?.message).toBe('Agent is not reachable. Is kc-agent running on port 8585?')
  })

  it('returns generic error on unexpected fetch failures', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockRejectedValueOnce(new Error('Unexpected parser failure'))

    const result = await runToolPreflightCheck('http://localhost:8585', ['kubectl'])
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('UNKNOWN_EXECUTION_FAILURE')
    expect(result.error?.message).toBe('Failed to check required tools: Unexpected parser failure')
  })

  it('includes per-tool details matching detected tools', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { name: 'helm', installed: true, version: 'v3.14.0', path: '/usr/local/bin/helm' },
      ],
    } as Response)

    const result = await runToolPreflightCheck('http://localhost:8585', ['helm'])
    expect(result.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'helm', installed: true }),
      ]),
    )
  })

  it('treats unexpected response shapes as missing required tools', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ unexpected: 'shape' }),
    } as Response)

    const result = await runToolPreflightCheck('http://localhost:8585', ['kubectl'])
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('MISSING_TOOLS')
  })
})

// ============================================================================
// getRemediationActions — MISSING_TOOLS branch (lines 284-321)
// ============================================================================

describe('getRemediationActions — MISSING_TOOLS', () => {
  it('includes install commands when missingTools details are provided', () => {
    const error: PreflightError = {
      code: 'MISSING_TOOLS',
      message: 'Required tools not found: helm, kind',
      details: { missingTools: ['helm', 'kind'] },
    }
    const actions = getRemediationActions(error)
    expect(actions.some(a => a.actionType === 'copy' && a.codeSnippet?.includes('brew install'))).toBe(true)
    expect(actions.some(a => a.actionType === 'copy' && a.codeSnippet?.includes('winget'))).toBe(true)
    expect(actions.some(a => a.actionType === 'retry')).toBe(true)
  })

  it('uses winget package map for known tools', () => {
    const error: PreflightError = {
      code: 'MISSING_TOOLS',
      message: 'Required tools not found: kubectl',
      details: { missingTools: ['kubectl'] },
    }
    const actions = getRemediationActions(error)
    const wingetAction = actions.find(a => a.codeSnippet?.includes('winget'))
    expect(wingetAction?.codeSnippet).toContain('Kubernetes.kubectl')
  })

  it('returns info action when no missingTools details provided', () => {
    const error: PreflightError = {
      code: 'MISSING_TOOLS',
      message: 'Some tools are missing',
    }
    const actions = getRemediationActions(error)
    expect(actions.some(a => a.actionType === 'info')).toBe(true)
    expect(actions.some(a => a.actionType === 'retry')).toBe(true)
  })
})

// ============================================================================
// getRemediationActions — RBAC namespace-scoped (generateRBACSnippet namespace path)
// ============================================================================

describe('getRemediationActions — RBAC namespace-scoped snippet', () => {
  it('generates a Role (not ClusterRole) when namespace is in error details', () => {
    const error: PreflightError = {
      code: 'RBAC_DENIED',
      message: 'User cannot create pods',
      details: { verb: 'create', resource: 'pods', apiGroup: '', namespace: 'production' },
    }
    const actions = getRemediationActions(error)
    const snippet = actions.find(a => a.codeSnippet?.includes('Role'))?.codeSnippet ?? ''
    expect(snippet).toContain('kind: Role')
    expect(snippet).toContain('kind: RoleBinding')
    expect(snippet).toContain('namespace: production')
    expect(snippet).not.toContain('ClusterRole')
  })
})

// ============================================================================
// classifyKubectlError — additional edge cases
// ============================================================================

describe('classifyKubectlError — additional paths', () => {
  it('classifies localhost:8080 refused WITHOUT context as MISSING_CREDENTIALS', () => {
    const result = classifyKubectlError(
      'The connection to the server localhost:8080 was refused - did you specify the right host or port?',
      '',
      1,
    )
    expect(result.code).toBe('MISSING_CREDENTIALS')
  })

  it('classifies credentials_have_expired as EXPIRED_CREDENTIALS', () => {
    const result = classifyKubectlError(
      'error: credentials have expired, please re-authenticate',
      '',
      1,
    )
    expect(result.code).toBe('EXPIRED_CREDENTIALS')
  })

  it('classifies "context does not exist" pattern as CONTEXT_NOT_FOUND', () => {
    const result = classifyKubectlError(
      'error: context "prod" does not exist in kubeconfig',
      '',
      1,
    )
    expect(result.code).toBe('CONTEXT_NOT_FOUND')
  })

  it('classifies "no context exists with the name" pattern as CONTEXT_NOT_FOUND', () => {
    const result = classifyKubectlError(
      'error: no context exists with the name: "missing-ctx"',
      '',
      1,
    )
    expect(result.code).toBe('CONTEXT_NOT_FOUND')
  })

  it('classifies context deadline exceeded as CLUSTER_UNREACHABLE', () => {
    const result = classifyKubectlError(
      'error: context deadline exceeded',
      '',
      1,
    )
    expect(result.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('classifies EOF + connect failure as CLUSTER_UNREACHABLE', () => {
    const result = classifyKubectlError(
      'error: EOF during connect',
      '',
      1,
    )
    expect(result.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('uses stdout message in UNKNOWN fallback when stderr is empty', () => {
    const result = classifyKubectlError('', 'some stdout error text', 1)
    expect(result.code).toBe('UNKNOWN_EXECUTION_FAILURE')
    expect(result.message).toContain('some stdout error text')
  })

  it('handles undefined-like inputs gracefully', () => {
    const result = classifyKubectlError('undefined', 'undefined', 1)
    expect(result.code).toBe('UNKNOWN_EXECUTION_FAILURE')
  })

  it('classifies invalid configuration with no configuration as MISSING_CREDENTIALS', () => {
    const result = classifyKubectlError(
      'error: invalid configuration: no configuration has been provided for context "test"',
      '',
      1,
    )
    expect(result.code).toBe('MISSING_CREDENTIALS')
  })
})
