import { describe, it, expect, vi } from 'vitest'
import { FakeWebSocket, createProxy, kubectlProxyTestState } from './kubectlProxy.test-helpers'

describe('KubectlProxy request queue', () => {
  describe('priority requests', () => {
    it('executes immediately bypassing the queue', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'pods'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // Should have sent immediately
      expect(kubectlProxyTestState.sentMessages.length).toBe(1)
      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      expect(msg.payload.args).toEqual(['get', 'pods'])

      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: 'done', exitCode: 0 },
      })
      const result = await execPromise
      expect(result.output).toBe('done')

      proxy.close()
    })
  })

  // =========================================================================
  // Queue concurrency limiting
  // =========================================================================

  describe('request queue and concurrency', () => {
    it('limits concurrent requests to MAX_CONCURRENT_KUBECTL_REQUESTS', async () => {
      const proxy = await createProxy()
      const MAX_CONCURRENT = 4 // matches mock constant
      const TOTAL_REQUESTS = 7

      // Connect first
      const connectExec = proxy.exec(['version'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const connectMsg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: connectMsg.id,
        type: 'result',
        payload: { output: '', exitCode: 0 },
      })
      await connectExec
      kubectlProxyTestState.sentMessages = []

      // Fire off TOTAL_REQUESTS queued requests
      const promises: Promise<{ output: string; exitCode: number }>[] = []
      for (let i = 0; i < TOTAL_REQUESTS; i++) {
        promises.push(proxy.exec(['get', `resource-${i}`]))
      }

      // Let the queue process
      await vi.advanceTimersByTimeAsync(0)

      // Only MAX_CONCURRENT should have been sent
      expect(kubectlProxyTestState.sentMessages.length).toBe(MAX_CONCURRENT)

      // Verify queue stats
      const stats = proxy.getQueueStats()
      expect(stats.active).toBe(MAX_CONCURRENT)
      expect(stats.queued).toBe(TOTAL_REQUESTS - MAX_CONCURRENT)
      expect(stats.maxConcurrent).toBe(MAX_CONCURRENT)

      // Respond to the first batch
      for (let i = 0; i < MAX_CONCURRENT; i++) {
        const msg = JSON.parse(kubectlProxyTestState.sentMessages[i])
        kubectlProxyTestState.activeWs!.simulateMessage({
          id: msg.id,
          type: 'result',
          payload: { output: `result-${i}`, exitCode: 0 },
        })
      }

      // Let queue drain
      await vi.advanceTimersByTimeAsync(0)

      // Remaining requests should now be sent
      const _remaining = TOTAL_REQUESTS - MAX_CONCURRENT
      expect(kubectlProxyTestState.sentMessages.length).toBe(TOTAL_REQUESTS)

      // Respond to the rest
      for (let i = MAX_CONCURRENT; i < TOTAL_REQUESTS; i++) {
        const msg = JSON.parse(kubectlProxyTestState.sentMessages[i])
        kubectlProxyTestState.activeWs!.simulateMessage({
          id: msg.id,
          type: 'result',
          payload: { output: `result-${i}`, exitCode: 0 },
        })
      }

      // All promises should resolve
      const results = await Promise.all(promises)
      expect(results.length).toBe(TOTAL_REQUESTS)
      for (let i = 0; i < TOTAL_REQUESTS; i++) {
        expect(results[i].output).toBe(`result-${i}`)
      }

      proxy.close()
    })

    it('getQueueStats returns correct initial state', async () => {
      const proxy = await createProxy()
      const stats = proxy.getQueueStats()
      expect(stats).toEqual({
        queued: 0,
        active: 0,
        maxConcurrent: 4,
      })
      proxy.close()
    })
  })

  // =========================================================================
  // close()
  // =========================================================================

  describe('close()', () => {
    it('rejects all queued requests with "Connection closed"', async () => {
      const proxy = await createProxy()
      const MAX_CONCURRENT = 4

      // Connect first
      const connectExec = proxy.exec(['version'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const connectMsg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: connectMsg.id,
        type: 'result',
        payload: { output: '', exitCode: 0 },
      })
      await connectExec

      // Queue more requests than the concurrency limit
      const promises: Promise<unknown>[] = []
      for (let i = 0; i < MAX_CONCURRENT + 3; i++) {
        promises.push(
          proxy.exec(['get', `resource-${i}`]).catch((err: Error) => err.message)
        )
      }
      await vi.advanceTimersByTimeAsync(0)

      // Close the proxy — should reject queued ones and close the WS
      proxy.close()
      await vi.advanceTimersByTimeAsync(0)

      const results = await Promise.all(promises)
      // The 3 queued (not yet active) ones should have been rejected with "Connection closed"
      const closedErrors = results.filter(r => r === 'Connection closed')
      expect(closedErrors.length).toBeGreaterThanOrEqual(3)
    })
  })

  // =========================================================================
  // Higher-level methods
  // =========================================================================

})
