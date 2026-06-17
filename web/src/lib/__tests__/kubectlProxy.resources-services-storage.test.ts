import { describe, it, expect, vi } from 'vitest'
import { FakeWebSocket, createProxy, kubectlProxyTestState } from './kubectlProxy.test-helpers'

describe('KubectlProxy services and storage resources', () => {
  describe('getServices — error branches', () => {
    it('throws on non-zero exitCode', async () => {
      const proxy = await createProxy()
      const promise = proxy.getServices('ctx')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1, error: 'forbidden' },
      })

      await expect(promise).rejects.toThrow('forbidden')
      proxy.close()
    })

    it('throws on non-zero exitCode with no error message (fallback)', async () => {
      const proxy = await createProxy()
      const promise = proxy.getServices('ctx')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1 },
      })

      await expect(promise).rejects.toThrow('Failed to get services')
      proxy.close()
    })

    it('throws on invalid JSON output', async () => {
      const proxy = await createProxy()
      const promise = proxy.getServices('ctx')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '{bad json', exitCode: 0 },
      })

      await expect(promise).rejects.toThrow('Failed to parse kubectl output as JSON')
      proxy.close()
    })

    it('handles service with no ports and no clusterIP', async () => {
      const proxy = await createProxy()
      const promise = proxy.getServices('ctx')
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
              metadata: { name: 'headless', namespace: 'default' },
              spec: { type: 'ClusterIP', clusterIP: '' },
            }],
          }),
          exitCode: 0,
        },
      })

      const svcs = await promise
      expect(svcs[0].ports).toBe('')
      expect(svcs[0].clusterIP).toBe('')
      proxy.close()
    })
  })

  describe('getPVCs — error branches', () => {
    it('throws on non-zero exitCode', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPVCs('ctx')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1, error: 'no access' },
      })

      await expect(promise).rejects.toThrow('no access')
      proxy.close()
    })

    it('throws on non-zero exitCode with fallback message', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPVCs('ctx')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1 },
      })

      await expect(promise).rejects.toThrow('Failed to get PVCs')
      proxy.close()
    })

    it('throws on invalid JSON output', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPVCs('ctx')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: 'not json', exitCode: 0 },
      })

      await expect(promise).rejects.toThrow('Failed to parse kubectl output as JSON')
      proxy.close()
    })

    it('uses -A when no namespace is specified', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPVCs('ctx')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      expect(msg.payload.args).toContain('-A')

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
  // getPodIssues — error and parse branches
  // =========================================================================

})
