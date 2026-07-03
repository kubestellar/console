import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as childProcess from 'node:child_process'
import * as fs from 'node:fs'

vi.mock('node:child_process')
vi.mock('node:fs')

const mockedExecFileSync = vi.mocked(childProcess.execFileSync)
const mockedFs = vi.mocked(fs)

describe('liveFixtureManager', () => {
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
    return import('../liveFixtureManager')
  }

  describe('applyLiveFixtures', () => {
    it('returns disabled report when LIVE_CLUSTER_FIXTURES is not true', async () => {
      delete process.env.LIVE_CLUSTER_FIXTURES
      const { applyLiveFixtures } = await loadModule()
      const report = applyLiveFixtures()
      expect(report.enabled).toBe(false)
      expect(report.skipped).toContain('LIVE_CLUSTER_FIXTURES is not true')
      expect(report.namespace).toBe('ks-live-ui-fixtures')
      expect(report.resources).toEqual({
        healthyDeployment: 'ks-live-ui-healthy',
        imagePullPod: 'ks-live-ui-imagepull',
        pendingPod: 'ks-live-ui-pending',
        crashLoopPod: 'ks-live-ui-crashloop',
      })
    })

    it('uses custom namespace from env var', async () => {
      process.env.LIVE_FIXTURE_NAMESPACE = 'custom-ns'
      delete process.env.LIVE_CLUSTER_FIXTURES
      const { applyLiveFixtures } = await loadModule()
      const report = applyLiveFixtures()
      expect(report.namespace).toBe('custom-ns')
    })

    it('applies fixtures when LIVE_CLUSTER_FIXTURES is true', async () => {
      process.env.LIVE_CLUSTER_FIXTURES = 'true'
      process.env.KUBECONFIG_PATH = '/mock/kubeconfig'
      process.env.LIVE_CLUSTER_FIXTURE_CONTEXT = 'test-context'
      mockedExecFileSync.mockReturnValue('')
      const { applyLiveFixtures } = await loadModule()
      const report = applyLiveFixtures()
      expect(report.enabled).toBe(true)
      expect(report.context).toBe('test-context')
      expect(mockedExecFileSync).toHaveBeenCalledWith(
        'kubectl',
        expect.arrayContaining(['--kubeconfig', '/mock/kubeconfig', '--context', 'test-context', 'apply', '-f', '-']),
        expect.objectContaining({ encoding: 'utf8' }),
      )
    })

    it('uses first context from LIVE_CLUSTER_CONTEXTS when no LIVE_CLUSTER_FIXTURE_CONTEXT', async () => {
      process.env.LIVE_CLUSTER_FIXTURES = 'true'
      process.env.KUBECONFIG_PATH = '/mock/kubeconfig'
      delete process.env.LIVE_CLUSTER_FIXTURE_CONTEXT
      process.env.LIVE_CLUSTER_CONTEXTS = 'ctx-a, ctx-b, ctx-c'
      mockedExecFileSync.mockReturnValue('')
      const { applyLiveFixtures } = await loadModule()
      const report = applyLiveFixtures()
      expect(report.context).toBe('ctx-a')
    })
  })

  describe('collectLiveFixtureState', () => {
    it('returns disabled report when LIVE_CLUSTER_FIXTURES is not true', async () => {
      delete process.env.LIVE_CLUSTER_FIXTURES
      const { collectLiveFixtureState } = await loadModule()
      const report = collectLiveFixtureState()
      expect(report.enabled).toBe(false)
      expect(report.skipped).toBeDefined()
    })

    it('collects pod state and deployment availability when enabled', async () => {
      process.env.LIVE_CLUSTER_FIXTURES = 'true'
      process.env.KUBECONFIG_PATH = '/mock/kubeconfig'
      process.env.LIVE_CLUSTER_FIXTURE_CONTEXT = 'test-ctx'
      mockedExecFileSync.mockImplementation((_cmd, args: string[]) => {
        if (args.includes('pods')) {
          return JSON.stringify({
            items: [
              { metadata: { name: 'pod-a' }, status: { phase: 'Running' } },
              { metadata: { name: 'pod-b' }, status: { phase: 'Pending', containerStatuses: [{ state: { waiting: { reason: 'ImagePullBackOff' } } }] } },
            ],
          })
        }
        if (args.includes('deployment')) {
          return JSON.stringify({ status: { availableReplicas: 2, replicas: 2 } })
        }
        return ''
      })
      const { collectLiveFixtureState } = await loadModule()
      const report = collectLiveFixtureState()
      expect(report.enabled).toBe(true)
      expect(report.observed?.pods).toHaveLength(2)
      expect(report.observed?.pods[0]).toEqual({ name: 'pod-a', phase: 'Running', reason: undefined })
      expect(report.observed?.pods[1]).toEqual({ name: 'pod-b', phase: 'Pending', reason: 'ImagePullBackOff' })
      expect(report.observed?.deploymentAvailable).toBe(true)
    })

    it('reports deployment unavailable when replicas are short', async () => {
      process.env.LIVE_CLUSTER_FIXTURES = 'true'
      process.env.KUBECONFIG_PATH = '/mock/kubeconfig'
      process.env.LIVE_CLUSTER_FIXTURE_CONTEXT = 'ctx'
      mockedExecFileSync.mockImplementation((_cmd, args: string[]) => {
        if (args.includes('pods')) return JSON.stringify({ items: [] })
        if (args.includes('deployment')) return JSON.stringify({ status: { availableReplicas: 0, replicas: 2 } })
        return ''
      })
      const { collectLiveFixtureState } = await loadModule()
      const report = collectLiveFixtureState()
      expect(report.observed?.deploymentAvailable).toBe(false)
    })
  })

  describe('cleanupLiveFixtures', () => {
    it('returns disabled report when LIVE_CLUSTER_FIXTURES is not true', async () => {
      delete process.env.LIVE_CLUSTER_FIXTURES
      const { cleanupLiveFixtures } = await loadModule()
      const report = cleanupLiveFixtures()
      expect(report.enabled).toBe(false)
    })

    it('skips cleanup when LIVE_CLUSTER_FIXTURE_CLEANUP is false', async () => {
      process.env.LIVE_CLUSTER_FIXTURES = 'true'
      process.env.LIVE_CLUSTER_FIXTURE_CLEANUP = 'false'
      process.env.KUBECONFIG_PATH = '/mock/kubeconfig'
      process.env.LIVE_CLUSTER_FIXTURE_CONTEXT = 'ctx'
      mockedExecFileSync.mockImplementation((_cmd, args: string[]) => {
        if (args.includes('pods')) return JSON.stringify({ items: [] })
        if (args.includes('deployment')) return JSON.stringify({ status: { availableReplicas: 1, replicas: 1 } })
        return ''
      })
      const { cleanupLiveFixtures } = await loadModule()
      const report = cleanupLiveFixtures()
      expect(report.enabled).toBe(true)
      // Should NOT have called 'delete namespace'
      const deleteCall = mockedExecFileSync.mock.calls.find(call =>
        Array.isArray(call[1]) && call[1].includes('delete'),
      )
      expect(deleteCall).toBeUndefined()
    })

    it('deletes namespace when cleanup is enabled', async () => {
      process.env.LIVE_CLUSTER_FIXTURES = 'true'
      delete process.env.LIVE_CLUSTER_FIXTURE_CLEANUP
      process.env.KUBECONFIG_PATH = '/mock/kubeconfig'
      process.env.LIVE_CLUSTER_FIXTURE_CONTEXT = 'test-ctx'
      mockedExecFileSync.mockReturnValue('')
      const { cleanupLiveFixtures } = await loadModule()
      const report = cleanupLiveFixtures()
      expect(report.enabled).toBe(true)
      const deleteCall = mockedExecFileSync.mock.calls.find(call =>
        Array.isArray(call[1]) && call[1].includes('delete'),
      )
      expect(deleteCall).toBeDefined()
      expect(deleteCall?.[1]).toContain('ks-live-ui-fixtures')
    })

    it('uses KUBECONFIG_B64 to write temp kubeconfig', async () => {
      process.env.LIVE_CLUSTER_FIXTURES = 'true'
      delete process.env.KUBECONFIG_PATH
      delete process.env.LIVE_CLUSTER_FIXTURE_KUBECONFIG_B64
      process.env.KUBECONFIG_B64 = Buffer.from('mock-kubeconfig-content').toString('base64')
      process.env.LIVE_CLUSTER_FIXTURE_CONTEXT = 'ctx'
      mockedExecFileSync.mockReturnValue('')
      const { cleanupLiveFixtures } = await loadModule()
      cleanupLiveFixtures()
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        '/tmp/mock-kubeconfig-dir/config',
        'mock-kubeconfig-content',
        { mode: 0o600 },
      )
    })
  })

  describe('report writing', () => {
    it('writes report to test-results/reports/live-fixtures.json', async () => {
      delete process.env.LIVE_CLUSTER_FIXTURES
      const { applyLiveFixtures } = await loadModule()
      applyLiveFixtures()
      const writeCall = mockedFs.writeFileSync.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('live-fixtures.json'),
      )
      expect(writeCall).toBeDefined()
      const written = JSON.parse(writeCall![1] as string)
      expect(written.enabled).toBe(false)
    })
  })
})
