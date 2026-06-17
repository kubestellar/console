import { describe, it, expect, vi } from 'vitest'
import { FakeWebSocket, createProxy, kubectlProxyTestState } from './kubectlProxy.test-helpers'

describe('KubectlProxy metrics and node resources', () => {
  describe('getNodes — fallback error message', () => {
    it('uses fallback when exitCode non-zero but no error message', async () => {
      const proxy = await createProxy()
      const promise = proxy.getNodes('ctx')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1 }, // no .error
      })

      await expect(promise).rejects.toThrow('Failed to get nodes')
      proxy.close()
    })
  })

  // =========================================================================
  // getPodMetrics — parse error and fallback branches
  // =========================================================================

  describe('getPodMetrics — error branches', () => {
    it('throws on invalid JSON', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPodMetrics('ctx')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: 'broken', exitCode: 0 },
      })

      await expect(promise).rejects.toThrow('Failed to parse kubectl output as JSON')
      proxy.close()
    })

    it('uses fallback error message when none provided', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPodMetrics('ctx')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1 },
      })

      await expect(promise).rejects.toThrow('Failed to get pods')
      proxy.close()
    })

    it('handles pods with no containers array', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPodMetrics('ctx')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: {
          output: JSON.stringify({
            items: [{ spec: {} }], // no containers
          }),
          exitCode: 0,
        },
      })

      const result = await promise
      expect(result.count).toBe(1)
      expect(result.cpuRequestsMillicores).toBe(0)
      expect(result.memoryRequestsBytes).toBe(0)
      proxy.close()
    })
  })

  // =========================================================================
  // getBulkClusterHealth (entirely uncovered — lines 725-775)
  // =========================================================================

})
