import { describe, it, expect, vi } from 'vitest'
import { FakeWebSocket, createProxy, kubectlProxyTestState } from './kubectlProxy.test-helpers'

describe('KubectlProxy exec and timeouts', () => {
  describe('connection error handling', () => {
    it('rejects exec when WebSocket emits an error before opening', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'pods'])
      const rejection = expect(execPromise).rejects.toThrow('Failed to connect to local agent')
      await vi.advanceTimersByTimeAsync(0)

      kubectlProxyTestState.activeWs!.simulateError()
      await vi.advanceTimersByTimeAsync(0)

      await rejection

      proxy.close()
    })

    it('rejects all pending requests when connection closes unexpectedly', async () => {
      const proxy = await createProxy()

      // Connect successfully
      const exec1 = proxy.exec(['get', 'pods'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // Send another request (don't respond to it)
      const exec2 = proxy.exec(['get', 'nodes'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)

      // Attach rejection handlers BEFORE triggering close
      const rejection1 = expect(exec1).rejects.toThrow('Connection closed')
      const rejection2 = expect(exec2).rejects.toThrow('Connection closed')

      // Now simulate unexpected close
      kubectlProxyTestState.activeWs!.simulateClose()
      await vi.advanceTimersByTimeAsync(0)

      await rejection1
      await rejection2

      proxy.close()
    })
  })

  // =========================================================================
  // Request execution
  // =========================================================================

  describe('exec', () => {
    it('sends context and namespace in the payload', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'pods'], {
        context: 'prod-cluster',
        namespace: 'kube-system',
      })
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      expect(msg.payload.context).toBe('prod-cluster')
      expect(msg.payload.namespace).toBe('kube-system')
      expect(msg.payload.args).toEqual(['get', 'pods'])

      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 0 },
      })
      await execPromise
      proxy.close()
    })

    it('resolves with KubectlResponse on success', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'pods', '-o', 'json'])
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '{"items":[]}', exitCode: 0 },
      })

      const result = await execPromise
      expect(result.output).toBe('{"items":[]}')
      expect(result.exitCode).toBe(0)

      proxy.close()
    })

    it('rejects with error message when server returns error type', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'nonexistent'])
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'error',
        payload: { code: 'NOT_FOUND', message: 'resource not found' },
      })

      await expect(execPromise).rejects.toThrow('resource not found')

      proxy.close()
    })

    it('rejects with "Unknown error" when error payload has no message', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'something'])
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'error',
        payload: { code: 'UNKNOWN' },
      })

      await expect(execPromise).rejects.toThrow('Unknown error')

      proxy.close()
    })

    it('ignores messages with unknown IDs (no crash)', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'pods'])
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // Send a message with a bogus ID — should be silently ignored
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: 'unknown-id-999',
        type: 'result',
        payload: { output: 'should be ignored', exitCode: 0 },
      })

      // The original request should still be pending — now respond to it
      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: 'correct', exitCode: 0 },
      })

      const result = await execPromise
      expect(result.output).toBe('correct')

      proxy.close()
    })

    it('handles malformed JSON from server gracefully', async () => {
      const proxy = await createProxy()
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const execPromise = proxy.exec(['get', 'pods'])
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // Send invalid JSON directly through onmessage
      if (kubectlProxyTestState.activeWs!.onmessage) {
        kubectlProxyTestState.activeWs!.onmessage(new MessageEvent('message', { data: 'not-json{{{' }))
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        '[KubectlProxy] Failed to parse message:',
        expect.any(Error)
      )

      // Original request should still be pending; respond properly
      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: 'ok', exitCode: 0 },
      })
      await execPromise

      proxy.close()
      consoleSpy.mockRestore()
    })
  })

  // =========================================================================
  // Per-request timeout
  // =========================================================================

  describe('request timeout', () => {
    it('rejects with timeout error when server does not respond in time', async () => {
      const proxy = await createProxy()
      const CUSTOM_TIMEOUT_MS = 3000

      const execPromise = proxy.exec(['get', 'pods'], { timeout: CUSTOM_TIMEOUT_MS })
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // Attach rejection handler before advancing past timeout
      const rejection = expect(execPromise).rejects.toThrow(
        `Kubectl command timed out after ${CUSTOM_TIMEOUT_MS}ms`
      )

      // Don't respond — advance past the timeout
      await vi.advanceTimersByTimeAsync(CUSTOM_TIMEOUT_MS)

      await rejection

      proxy.close()
    })

    it('uses KUBECTL_DEFAULT_TIMEOUT_MS when no timeout is specified', async () => {
      const proxy = await createProxy()
      const DEFAULT_TIMEOUT_MS = 10_000

      const execPromise = proxy.exec(['get', 'pods'])
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // Attach rejection handler before advancing timers
      const rejection = expect(execPromise).rejects.toThrow(
        `Kubectl command timed out after ${DEFAULT_TIMEOUT_MS}ms`
      )

      // Advance just under the default timeout — should still be pending
      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS - 1)

      // Now push past it
      await vi.advanceTimersByTimeAsync(2)

      await rejection

      proxy.close()
    })
  })

})
