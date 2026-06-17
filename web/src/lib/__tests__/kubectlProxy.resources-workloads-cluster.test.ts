import { describe, it, expect, vi } from 'vitest'
import { FakeWebSocket, createProxy, kubectlProxyTestState } from './kubectlProxy.test-helpers'

describe('KubectlProxy workload and cluster resources', () => {
  describe('getDeployments — error branches', () => {
    it('throws on non-zero exitCode', async () => {
      const proxy = await createProxy()
      const promise = proxy.getDeployments('ctx')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1, error: 'deploy error' },
      })

      await expect(promise).rejects.toThrow('deploy error')
      proxy.close()
    })

    it('throws fallback message when no error field', async () => {
      const proxy = await createProxy()
      const promise = proxy.getDeployments('ctx')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1 },
      })

      await expect(promise).rejects.toThrow('Failed to get deployments')
      proxy.close()
    })

    it('throws on invalid JSON output', async () => {
      const proxy = await createProxy()
      const promise = proxy.getDeployments('ctx')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '<<<invalid>>>', exitCode: 0 },
      })

      await expect(promise).rejects.toThrow('Failed to parse kubectl output as JSON')
      proxy.close()
    })

    it('handles deployment with default replicas (missing spec.replicas)', async () => {
      const proxy = await createProxy()
      const promise = proxy.getDeployments('ctx')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: {
          output: JSON.stringify({
            items: [{
              metadata: { name: 'dep1', namespace: 'default' },
              spec: {}, // no replicas field, defaults to 1
              status: { readyReplicas: 1 },
            }],
          }),
          exitCode: 0,
        },
      })

      const deps = await promise
      expect(deps[0].replicas).toBe(1)
      expect(deps[0].status).toBe('running')
      expect(deps[0].progress).toBe(100)
      proxy.close()
    })

    it('uses -n when namespace is specified', async () => {
      const proxy = await createProxy()
      const promise = proxy.getDeployments('ctx', 'my-ns')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      expect(msg.payload.args).toContain('-n')
      expect(msg.payload.args).toContain('my-ns')

      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify({ items: [] }), exitCode: 0 },
      })
      await promise
      proxy.close()
    })
  })

  // =========================================================================
  // getClusterUsage — exception catch branch (line 458-459)
  // =========================================================================

  describe('getClusterUsage — exception in exec', () => {
    it('returns metricsAvailable=false when exec throws', async () => {
      const proxy = await createProxy()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const usagePromise = proxy.getClusterUsage('ctx')
      const rejection = expect(usagePromise).resolves.toEqual({
        cpuUsageMillicores: 0,
        memoryUsageBytes: 0,
        metricsAvailable: false,
      })
      await vi.advanceTimersByTimeAsync(0)

      // Cause the connection to fail
      kubectlProxyTestState.activeWs!.simulateError()
      await vi.advanceTimersByTimeAsync(0)

      await rejection
      proxy.close()
    })
  })

  // =========================================================================
  // getClusterHealth — usage metrics timeout branch (line 480+)
  // =========================================================================

  describe('getClusterHealth — usage metrics timeout', () => {
    it('continues with metricsAvailable=false when usage times out', async () => {
      const proxy = await createProxy()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const healthPromise = proxy.getClusterHealth('ctx')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // Respond to getNodes and getPodMetrics (sent in parallel)
      const allMsgs = kubectlProxyTestState.sentMessages.map(s => JSON.parse(s))
      const nodesMsg = allMsgs.find(m => m.payload.args.includes('nodes'))!
      const podsMsg = allMsgs.find(m => m.payload.args.includes('pods'))!

      kubectlProxyTestState.activeWs!.simulateMessage({
        id: nodesMsg.id,
        type: 'result',
        payload: {
          output: JSON.stringify({
            items: [{
              metadata: { name: 'n1', labels: {} },
              status: {
                conditions: [{ type: 'Ready', status: 'True' }],
                allocatable: { cpu: '4', memory: '8Gi', 'ephemeral-storage': '50Gi' },
              },
            }],
          }),
          exitCode: 0,
        },
      })

      kubectlProxyTestState.activeWs!.simulateMessage({
        id: podsMsg.id,
        type: 'result',
        payload: {
          output: JSON.stringify({ items: [{ spec: { containers: [] } }] }),
          exitCode: 0,
        },
      })

      await vi.advanceTimersByTimeAsync(0)

      // The "top nodes" message for getClusterUsage should be sent
      await vi.advanceTimersByTimeAsync(100)

      // DO NOT respond to the top nodes request — let the METRICS_SERVER_TIMEOUT_MS
      // (5000ms in mock) expire so the usage metrics timeout branch fires
      await vi.advanceTimersByTimeAsync(5000)

      // Also advance past the per-request timeout for the kubectl top command
      await vi.advanceTimersByTimeAsync(10_000)

      const health = await healthPromise

      // Health should still be available, just without usage metrics
      expect(health.healthy).toBe(true)
      expect(health.reachable).toBe(true)
      expect(health.nodeCount).toBe(1)
      // Usage metrics should be zero/unavailable
      expect(health.metricsAvailable).toBe(false)

      proxy.close()
    })
  })

})
