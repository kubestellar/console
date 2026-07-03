import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as childProcess from 'node:child_process'
import * as fs from 'node:fs'

vi.mock('node:child_process')
vi.mock('node:fs')

const mockedExecFileSync = vi.mocked(childProcess.execFileSync)
const mockedFs = vi.mocked(fs)

describe('collectK8sGroundTruth', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    mockedExecFileSync.mockReset()
    mockedFs.writeFileSync.mockImplementation(() => undefined)
    mockedFs.mkdirSync.mockImplementation(() => '' as unknown as string)
    mockedFs.mkdtempSync.mockReturnValue('/tmp/mock-kubeconfig-dir')
    mockedFs.rmSync.mockImplementation(() => undefined)
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  async function loadModule() {
    return import('../collectK8sGroundTruth')
  }

  describe('early exit conditions', () => {
    it('returns skipped result when LIVE_CLUSTER_TESTS is not true', async () => {
      delete process.env.LIVE_CLUSTER_TESTS
      const { collectK8sGroundTruth } = await loadModule()
      const result = collectK8sGroundTruth('run-123')
      expect(result.runId).toBe('run-123')
      expect(result.skipped).toContain('LIVE_CLUSTER_TESTS is not true')
      expect(result.contexts.configured).toBe(0)
      expect(result.nodes.total).toBe(0)
      expect(result.pods.total).toBe(0)
    })

    it('returns skipped result when kubectl is unavailable', async () => {
      process.env.LIVE_CLUSTER_TESTS = 'true'
      mockedExecFileSync.mockImplementation(() => {
        throw new Error('kubectl not found')
      })
      const { collectK8sGroundTruth } = await loadModule()
      const result = collectK8sGroundTruth('run-456')
      expect(result.skipped).toContain('kubectl is unavailable')
    })

    it('uses GITHUB_RUN_ID as default runId', async () => {
      delete process.env.LIVE_CLUSTER_TESTS
      process.env.GITHUB_RUN_ID = 'gh-run-789'
      const { collectK8sGroundTruth } = await loadModule()
      const result = collectK8sGroundTruth()
      expect(result.runId).toBe('gh-run-789')
    })
  })

  describe('kubeconfig resolution', () => {
    it('uses KUBECONFIG_PATH directly when set', async () => {
      process.env.LIVE_CLUSTER_TESTS = 'true'
      process.env.KUBECONFIG_PATH = '/custom/kubeconfig'
      mockedExecFileSync.mockImplementation((_cmd, args) => {
        if (Array.isArray(args) && args.includes('--client=true')) return 'Client Version: v1.28.0'
        if (Array.isArray(args) && args.includes('get-contexts')) return 'ctx-1\nctx-2'
        if (Array.isArray(args) && args.includes('namespaces') && args.includes('--request-timeout=10s')) return ''
        return JSON.stringify({ items: [] })
      })
      const { collectK8sGroundTruth } = await loadModule()
      collectK8sGroundTruth('test')
      const kubeconfigCalls = mockedExecFileSync.mock.calls.filter(
        call => Array.isArray(call[1]) && call[1].includes('--kubeconfig'),
      )
      for (const call of kubeconfigCalls) {
        expect(call[1]).toContain('/custom/kubeconfig')
      }
    })

    it('writes temp kubeconfig from KUBECONFIG_B64', async () => {
      process.env.LIVE_CLUSTER_TESTS = 'true'
      delete process.env.KUBECONFIG_PATH
      process.env.KUBECONFIG_B64 = Buffer.from('apiVersion: v1\nkind: Config').toString('base64')
      mockedExecFileSync.mockImplementation((_cmd, args) => {
        if (Array.isArray(args) && args.includes('--client=true')) return 'Client Version: v1.28.0'
        if (Array.isArray(args) && args.includes('get-contexts')) return ''
        return JSON.stringify({ items: [] })
      })
      const { collectK8sGroundTruth } = await loadModule()
      collectK8sGroundTruth('test')
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        '/tmp/mock-kubeconfig-dir/config',
        'apiVersion: v1\nkind: Config',
        { mode: 0o600 },
      )
    })
  })

  describe('context filtering', () => {
    it('filters contexts by LIVE_CLUSTER_CONTEXTS env var', async () => {
      process.env.LIVE_CLUSTER_TESTS = 'true'
      process.env.KUBECONFIG_PATH = '/mock/kc'
      process.env.LIVE_CLUSTER_CONTEXTS = 'ctx-a, ctx-c'
      mockedExecFileSync.mockImplementation((_cmd, args) => {
        if (Array.isArray(args) && args.includes('--client=true')) return ''
        if (Array.isArray(args) && args.includes('get-contexts')) return 'ctx-a\nctx-b\nctx-c\nctx-d'
        if (Array.isArray(args) && args.includes('--request-timeout=10s')) return ''
        return JSON.stringify({ items: [] })
      })
      const { collectK8sGroundTruth } = await loadModule()
      const result = collectK8sGroundTruth('test')
      expect(result.contexts.configured).toBe(2)
      expect(result.contexts.names).toContain('ctx-a')
      expect(result.contexts.names).toContain('ctx-c')
      expect(result.contexts.names).not.toContain('ctx-b')
    })

    it('marks unreachable contexts correctly', async () => {
      process.env.LIVE_CLUSTER_TESTS = 'true'
      process.env.KUBECONFIG_PATH = '/mock/kc'
      delete process.env.LIVE_CLUSTER_CONTEXTS
      let callCount = 0
      mockedExecFileSync.mockImplementation((_cmd, args) => {
        if (Array.isArray(args) && args.includes('--client=true')) return ''
        if (Array.isArray(args) && args.includes('get-contexts')) return 'ctx-a\nctx-b'
        if (Array.isArray(args) && args.includes('--request-timeout=10s')) {
          callCount++
          if (callCount === 1) return '' // ctx-a reachable
          throw new Error('connection refused') // ctx-b unreachable
        }
        return JSON.stringify({ items: [] })
      })
      const { collectK8sGroundTruth } = await loadModule()
      const result = collectK8sGroundTruth('test')
      expect(result.contexts.configured).toBe(2)
      expect(result.contexts.reachable).toBe(1)
    })
  })

  describe('K8s resource aggregation', () => {
    it('aggregates nodes, pods, deployments across reachable contexts', async () => {
      process.env.LIVE_CLUSTER_TESTS = 'true'
      process.env.KUBECONFIG_PATH = '/mock/kc'
      process.env.LIVE_CLUSTER_CONTEXTS = 'ctx-1'
      mockedExecFileSync.mockImplementation((_cmd, args) => {
        if (Array.isArray(args) && args.includes('--client=true')) return ''
        if (Array.isArray(args) && args.includes('get-contexts')) return 'ctx-1'
        if (Array.isArray(args) && args.includes('--request-timeout=10s')) return ''
        if (Array.isArray(args) && args.includes('nodes')) {
          return JSON.stringify({
            items: [
              { status: { conditions: [{ type: 'Ready', status: 'True' }] } },
              { status: { conditions: [{ type: 'Ready', status: 'False' }] } },
            ],
          })
        }
        if (Array.isArray(args) && args.includes('pods')) {
          return JSON.stringify({
            items: [
              { status: { phase: 'Running' } },
              { status: { phase: 'Pending' } },
              { status: { phase: 'Failed' } },
              { status: { phase: 'Running', containerStatuses: [{ state: { waiting: { reason: 'CrashLoopBackOff' } } }] } },
            ],
          })
        }
        if (Array.isArray(args) && args.includes('deployments')) {
          return JSON.stringify({
            items: [
              { status: { replicas: 3, availableReplicas: 3 } },
              { status: { replicas: 2, availableReplicas: 1 } },
            ],
          })
        }
        if (Array.isArray(args) && args.includes('namespaces')) {
          return JSON.stringify({ items: [{}, {}, {}] })
        }
        return JSON.stringify({ items: [] })
      })
      const { collectK8sGroundTruth } = await loadModule()
      const result = collectK8sGroundTruth('test')
      expect(result.nodes.total).toBe(2)
      expect(result.nodes.ready).toBe(1)
      expect(result.nodes.notReady).toBe(1)
      expect(result.pods.total).toBe(4)
      expect(result.pods.running).toBe(2)
      expect(result.pods.pending).toBe(1)
      expect(result.pods.failed).toBe(1)
      expect(result.pods.crashLoopBackOff).toBe(1)
      expect(result.deployments.total).toBe(2)
      expect(result.deployments.available).toBe(1)
      expect(result.deployments.unavailable).toBe(1)
      expect(result.namespaces.total).toBe(3)
    })
  })

  describe('output writing', () => {
    it('writes redacted groundtruth to test-results/reports/groundtruth.json', async () => {
      process.env.LIVE_CLUSTER_TESTS = 'true'
      process.env.KUBECONFIG_PATH = '/mock/kc'
      process.env.LIVE_CLUSTER_CONTEXTS = 'my-secret-cluster'
      mockedExecFileSync.mockImplementation((_cmd, args) => {
        if (Array.isArray(args) && args.includes('--client=true')) return ''
        if (Array.isArray(args) && args.includes('get-contexts')) return 'my-secret-cluster'
        if (Array.isArray(args) && args.includes('--request-timeout=10s')) return ''
        return JSON.stringify({ items: [] })
      })
      const { collectK8sGroundTruth } = await loadModule()
      collectK8sGroundTruth('test')
      const writeCall = mockedFs.writeFileSync.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('groundtruth.json'),
      )
      expect(writeCall).toBeDefined()
      const written = JSON.parse(writeCall![1] as string)
      // Context names should be redacted/anonymized
      expect(written.contexts.names[0]).toMatch(/^context-1-/)
      expect(written.contexts.names[0]).not.toContain('my-secret-cluster')
    })

    it('cleans up temp kubeconfig even on error', async () => {
      process.env.LIVE_CLUSTER_TESTS = 'true'
      delete process.env.KUBECONFIG_PATH
      process.env.KUBECONFIG_B64 = Buffer.from('content').toString('base64')
      let callCount = 0
      mockedExecFileSync.mockImplementation((_cmd, args) => {
        if (Array.isArray(args) && args.includes('--client=true')) return ''
        if (Array.isArray(args) && args.includes('get-contexts')) {
          callCount++
          if (callCount > 1) throw new Error('unexpected kubectl failure')
          return 'ctx-1'
        }
        if (Array.isArray(args) && args.includes('--request-timeout=10s')) {
          throw new Error('cluster unreachable')
        }
        return JSON.stringify({ items: [] })
      })
      const { collectK8sGroundTruth } = await loadModule()
      collectK8sGroundTruth('test')
      expect(mockedFs.rmSync).toHaveBeenCalledWith(
        '/tmp/mock-kubeconfig-dir',
        { recursive: true, force: true },
      )
    })
  })
})
