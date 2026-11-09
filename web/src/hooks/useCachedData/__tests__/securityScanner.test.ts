/**
 * Tests for useCachedData/securityScanner.ts — kubectl-based security scanner
 * used by `useCachedSecurityIssues`.
 *
 * We mock kubectlProxy, isAgentUnavailable, getAgentClusters, and
 * settledWithConcurrency so each misconfiguration-detection branch can be
 * exercised deterministically.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsAgentUnavailable,
  mockGetAgentClusters,
  mockExec,
} = vi.hoisted(() => ({
  mockIsAgentUnavailable: vi.fn(() => false),
  mockGetAgentClusters: vi.fn(() => [] as Array<{ name: string; context?: string }>),
  mockExec: vi.fn(),
}))

vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: (...args: unknown[]) => mockExec(...args) },
}))

vi.mock('../../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
}))

vi.mock('../agentFetchers', () => ({
  getAgentClusters: () => mockGetAgentClusters(),
}))

// Run settledWithConcurrency tasks sequentially, same as the real impl.
vi.mock('../../../lib/utils/concurrency', () => ({
  settledWithConcurrency: async (
    tasks: Array<() => Promise<unknown>>,
    _concurrency: number | undefined,
    onSettled: (result: PromiseSettledResult<unknown>) => void,
  ) => {
    for (const task of tasks) {
      try {
        const value = await task()
        onSettled({ status: 'fulfilled', value })
      } catch (reason: unknown) {
        onSettled({ status: 'rejected', reason })
      }
    }
  },
}))

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { fetchSecurityIssuesViaKubectl } from '../securityScanner'

function podJson(items: unknown[]): string {
  return JSON.stringify({ items })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsAgentUnavailable.mockReturnValue(false)
  mockGetAgentClusters.mockReturnValue([{ name: 'prod', context: 'prod-ctx' }])
})

describe('fetchSecurityIssuesViaKubectl', () => {
  it('returns empty array when agent is unavailable', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    const result = await fetchSecurityIssuesViaKubectl()
    expect(result).toEqual([])
    expect(mockExec).not.toHaveBeenCalled()
  })

  it('returns empty array when no clusters available', async () => {
    mockGetAgentClusters.mockReturnValue([])
    const result = await fetchSecurityIssuesViaKubectl()
    expect(result).toEqual([])
  })

  it('filters clusters by the requested cluster name', async () => {
    mockGetAgentClusters.mockReturnValue([
      { name: 'prod', context: 'prod-ctx' },
      { name: 'staging', context: 'staging-ctx' },
    ])
    mockExec.mockResolvedValue({ exitCode: 0, output: podJson([]) })

    await fetchSecurityIssuesViaKubectl('staging')
    expect(mockExec).toHaveBeenCalledTimes(1)
    expect(mockExec).toHaveBeenCalledWith(
      expect.arrayContaining(['get', 'pods']),
      expect.objectContaining({ context: 'staging-ctx' }),
    )
  })

  it('uses -n <namespace> flag when a namespace is provided', async () => {
    mockExec.mockResolvedValue({ exitCode: 0, output: podJson([]) })
    await fetchSecurityIssuesViaKubectl(undefined, 'kube-system')
    expect(mockExec).toHaveBeenCalledWith(
      expect.arrayContaining(['-n', 'kube-system']),
      expect.anything(),
    )
  })

  it('uses -A flag when no namespace is provided', async () => {
    mockExec.mockResolvedValue({ exitCode: 0, output: podJson([]) })
    await fetchSecurityIssuesViaKubectl()
    expect(mockExec).toHaveBeenCalledWith(
      expect.arrayContaining(['-A']),
      expect.anything(),
    )
  })

  it('returns empty array when kubectl exits non-zero', async () => {
    mockExec.mockResolvedValue({ exitCode: 1, output: '' })
    const result = await fetchSecurityIssuesViaKubectl()
    expect(result).toEqual([])
  })

  it('returns empty array when kubectl output is not valid JSON', async () => {
    mockExec.mockResolvedValue({ exitCode: 0, output: 'not json' })
    const result = await fetchSecurityIssuesViaKubectl()
    expect(result).toEqual([])
  })

  it('handles missing items gracefully', async () => {
    mockExec.mockResolvedValue({ exitCode: 0, output: JSON.stringify({}) })
    const result = await fetchSecurityIssuesViaKubectl()
    expect(result).toEqual([])
  })

  it('detects a privileged container', async () => {
    mockExec.mockResolvedValue({
      exitCode: 0,
      output: podJson([{
        metadata: { name: 'pod-a', namespace: 'default' },
        spec: { containers: [{ securityContext: { privileged: true } }] },
      }]),
    })
    const result = await fetchSecurityIssuesViaKubectl()
    expect(result).toContainEqual(expect.objectContaining({
      name: 'pod-a', issue: 'Privileged container', severity: 'high',
    }))
  })

  it('detects a container running as root via runAsUser: 0', async () => {
    mockExec.mockResolvedValue({
      exitCode: 0,
      output: podJson([{
        metadata: { name: 'pod-root' },
        spec: { containers: [{ securityContext: { runAsUser: 0 } }] },
      }]),
    })
    const result = await fetchSecurityIssuesViaKubectl()
    expect(result).toContainEqual(expect.objectContaining({
      name: 'pod-root', issue: 'Running as root', severity: 'high',
    }))
  })

  it('detects a container running as root via pod-level runAsUser: 0', async () => {
    mockExec.mockResolvedValue({
      exitCode: 0,
      output: podJson([{
        metadata: { name: 'pod-root-pod-level' },
        spec: {
          containers: [{ securityContext: {} }],
          securityContext: { runAsUser: 0 },
        },
      }]),
    })
    const result = await fetchSecurityIssuesViaKubectl()
    expect(result).toContainEqual(expect.objectContaining({
      name: 'pod-root-pod-level', issue: 'Running as root',
    }))
  })

  it('does not flag root when runAsNonRoot is true', async () => {
    mockExec.mockResolvedValue({
      exitCode: 0,
      output: podJson([{
        metadata: { name: 'pod-safe' },
        spec: { containers: [{ securityContext: { runAsNonRoot: true } }] },
      }]),
    })
    const result = await fetchSecurityIssuesViaKubectl()
    expect(result.find(i => i.issue === 'Running as root')).toBeUndefined()
  })

  it('detects a missing security context', async () => {
    mockExec.mockResolvedValue({
      exitCode: 0,
      output: podJson([{
        metadata: { name: 'pod-nosc' },
        spec: { containers: [{ securityContext: {} }] },
      }]),
    })
    const result = await fetchSecurityIssuesViaKubectl()
    expect(result).toContainEqual(expect.objectContaining({
      name: 'pod-nosc', issue: 'Missing security context', severity: 'low',
    }))
  })

  it('detects capabilities not dropped when add capabilities are present', async () => {
    mockExec.mockResolvedValue({
      exitCode: 0,
      output: podJson([{
        metadata: { name: 'pod-caps' },
        spec: {
          containers: [{ securityContext: { capabilities: { add: ['NET_ADMIN'] } } }],
        },
      }]),
    })
    const result = await fetchSecurityIssuesViaKubectl()
    expect(result).toContainEqual(expect.objectContaining({
      name: 'pod-caps', issue: 'Capabilities not dropped', severity: 'medium',
    }))
  })

  it('does not flag capabilities when drop list is non-empty', async () => {
    mockExec.mockResolvedValue({
      exitCode: 0,
      output: podJson([{
        metadata: { name: 'pod-dropped' },
        spec: {
          containers: [{ securityContext: { capabilities: { drop: ['ALL'], add: ['NET_ADMIN'] } } }],
        },
      }]),
    })
    const result = await fetchSecurityIssuesViaKubectl()
    expect(result.find(i => i.issue === 'Capabilities not dropped')).toBeUndefined()
  })

  it('detects host network, host PID, and host IPC', async () => {
    mockExec.mockResolvedValue({
      exitCode: 0,
      output: podJson([{
        metadata: { name: 'pod-host' },
        spec: { hostNetwork: true, hostPID: true, hostIPC: true, containers: [] },
      }]),
    })
    const result = await fetchSecurityIssuesViaKubectl()
    expect(result).toContainEqual(expect.objectContaining({ issue: 'Host network enabled', severity: 'medium' }))
    expect(result).toContainEqual(expect.objectContaining({ issue: 'Host PID enabled', severity: 'high' }))
    expect(result).toContainEqual(expect.objectContaining({ issue: 'Host IPC enabled', severity: 'medium' }))
  })

  it('sorts results by severity (critical/high before medium/low)', async () => {
    mockExec.mockResolvedValue({
      exitCode: 0,
      output: podJson([{
        metadata: { name: 'pod-mixed' },
        spec: {
          hostNetwork: true,
          containers: [{ securityContext: { privileged: true } }],
        },
      }]),
    })
    const result = await fetchSecurityIssuesViaKubectl()
    expect(result[0].severity).toBe('high')
    // verify monotonic non-decreasing severity rank
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
    for (let i = 1; i < result.length; i++) {
      expect(order[result[i].severity]).toBeGreaterThanOrEqual(order[result[i - 1].severity])
    }
  })

  it('aggregates issues across multiple clusters', async () => {
    mockGetAgentClusters.mockReturnValue([
      { name: 'a', context: 'a-ctx' },
      { name: 'b', context: 'b-ctx' },
    ])
    mockExec.mockImplementation(async (_cmd: string[], opts: { context: string }) => {
      if (opts.context === 'a-ctx') {
        return { exitCode: 0, output: podJson([{ metadata: { name: 'pa' }, spec: { hostPID: true, containers: [] } }]) }
      }
      return { exitCode: 0, output: podJson([{ metadata: { name: 'pb' }, spec: { hostIPC: true, containers: [] } }]) }
    })
    const result = await fetchSecurityIssuesViaKubectl()
    expect(result.map(i => i.cluster).sort()).toEqual(['a', 'b'])
  })

  it('calls onProgress with accumulated, sorted results as clusters settle', async () => {
    mockGetAgentClusters.mockReturnValue([{ name: 'prod', context: 'prod-ctx' }])
    mockExec.mockResolvedValue({
      exitCode: 0,
      output: podJson([{ metadata: { name: 'p1' }, spec: { hostPID: true, containers: [] } }]),
    })
    const onProgress = vi.fn()
    const result = await fetchSecurityIssuesViaKubectl(undefined, undefined, onProgress)
    expect(onProgress).toHaveBeenCalled()
    expect(result).toHaveLength(1)
  })

  it('silently excludes clusters whose kubectl call rejects', async () => {
    mockGetAgentClusters.mockReturnValue([
      { name: 'ok', context: 'ok-ctx' },
      { name: 'bad', context: 'bad-ctx' },
    ])
    mockExec.mockImplementation(async (_cmd: string[], opts: { context: string }) => {
      if (opts.context === 'bad-ctx') throw new Error('connection refused')
      return { exitCode: 0, output: podJson([{ metadata: { name: 'ok-pod' }, spec: { hostPID: true, containers: [] } }]) }
    })
    const result = await fetchSecurityIssuesViaKubectl()
    expect(result).toHaveLength(1)
    expect(result[0].cluster).toBe('ok')
  })

  it('returns empty array when a pod has no issues', async () => {
    mockExec.mockResolvedValue({
      exitCode: 0,
      output: podJson([{
        metadata: { name: 'pod-clean' },
        spec: {
          containers: [{ securityContext: {
            runAsNonRoot: true, readOnlyRootFilesystem: true, allowPrivilegeEscalation: false, capabilities: { drop: ['ALL'] },
          } }],
        },
      }]),
    })
    const result = await fetchSecurityIssuesViaKubectl()
    expect(result).toEqual([])
  })
})
