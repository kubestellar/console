import { describe, it, expect, vi } from 'vitest'
import { FakeWebSocket, createProxy, kubectlProxyTestState } from './kubectlProxy.test-helpers'

describe('KubectlProxy connection lifecycle', () => {
  describe('connection lifecycle', () => {
    it('connects via WebSocket and resolves exec after open', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'pods'])

      // Let the constructor + connection attempt settle
      await vi.advanceTimersByTimeAsync(0)

      // The FakeWebSocket should have been created
      expect(kubectlProxyTestState.activeWs).not.toBeNull()

      // Simulate connection opening
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // A message should have been sent
      expect(kubectlProxyTestState.sentMessages.length).toBe(1)
      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      expect(msg.type).toBe('kubectl')
      expect(msg.payload.args).toEqual(['get', 'pods'])

      // Simulate server response
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: 'pod-1\npod-2', exitCode: 0 },
      })

      const result = await execPromise
      expect(result.output).toBe('pod-1\npod-2')
      expect(result.exitCode).toBe(0)

      proxy.close()
    })

    it('reuses existing open connection without creating a new WebSocket', async () => {
      const proxy = await createProxy()
      let wsCreationCount = 0
      const OrigFakeWS = FakeWebSocket
      vi.stubGlobal('WebSocket', class extends OrigFakeWS {
        constructor(url: string) {
          super(url)
          wsCreationCount++
        }
      })

      // First exec - triggers connection
      const exec1 = proxy.exec(['get', 'pods'])
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg1 = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg1.id,
        type: 'result',
        payload: { output: 'ok', exitCode: 0 },
      })
      await exec1

      // Second exec - should NOT create a new WebSocket
      const exec2 = proxy.exec(['get', 'nodes'])
      await vi.advanceTimersByTimeAsync(0)

      expect(wsCreationCount).toBe(1)

      const msg2 = JSON.parse(kubectlProxyTestState.sentMessages[1])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg2.id,
        type: 'result',
        payload: { output: 'node-1', exitCode: 0 },
      })
      await exec2

      proxy.close()
    })

    it('isConnected() returns true only when WebSocket is OPEN', async () => {
      const proxy = await createProxy()
      expect(proxy.isConnected()).toBe(false)

      // Start exec to trigger connection
      const execPromise = proxy.exec(['version'])
      await vi.advanceTimersByTimeAsync(0)

      // Still connecting
      expect(proxy.isConnected()).toBe(false)

      // Now open
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      expect(proxy.isConnected()).toBe(true)

      // Respond and close
      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 0 },
      })
      await execPromise

      proxy.close()
      expect(proxy.isConnected()).toBe(false)
    })
  })

  // =========================================================================
  // Netlify guard
  // =========================================================================

  describe('Netlify deployment guard', () => {
    it('throws immediately when isNetlifyDeployment is true', async () => {
      kubectlProxyTestState.mockIsNetlify = true
      const proxy = await createProxy()

      await expect(proxy.exec(['get', 'pods'])).rejects.toThrow(
        'Agent unavailable on Netlify deployment'
      )
    })
  })

  // =========================================================================
  // Connection timeout
  // =========================================================================

  describe('connection timeout', () => {
    it('rejects with timeout error after WS_CONNECT_TIMEOUT_MS', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'pods'])
      // Attach rejection handler BEFORE advancing timers to avoid unhandled rejection
      const rejection = expect(execPromise).rejects.toThrow('Connection timeout after 2500ms')
      await vi.advanceTimersByTimeAsync(0)

      // Do NOT open the connection — let it time out
      expect(kubectlProxyTestState.activeWs).not.toBeNull()

      // Advance past the connect timeout (2500ms)
      await vi.advanceTimersByTimeAsync(2500)

      await rejection

      proxy.close()
    })
  })

  // =========================================================================
  // Connection cooldown
  // =========================================================================

  describe('connection cooldown', () => {
    it('fails fast during cooldown window after a connection failure', async () => {
      const proxy = await createProxy()

      // Trigger a failed connection
      const exec1 = proxy.exec(['get', 'pods'])
      // Attach handler before triggering error to avoid unhandled rejection
      const rejection1 = expect(exec1).rejects.toThrow('Failed to connect to local agent')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateError()
      await vi.advanceTimersByTimeAsync(0)
      await rejection1

      // Immediately try again — should fail with cooldown error
      const exec2 = proxy.exec(['get', 'nodes'])
      const rejection2 = expect(exec2).rejects.toThrow('Local agent unavailable (cooldown)')
      await vi.advanceTimersByTimeAsync(0)
      await rejection2

      proxy.close()
    })

    it('allows reconnection after cooldown window expires', async () => {
      const proxy = await createProxy()

      // Trigger a failed connection
      const exec1 = proxy.exec(['get', 'pods'])
      const rejection1 = expect(exec1).rejects.toThrow()
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateError()
      await vi.advanceTimersByTimeAsync(0)
      await rejection1

      // Advance past cooldown (5000ms)
      await vi.advanceTimersByTimeAsync(5000)

      // Now a new connection attempt should be allowed
      const exec2 = proxy.exec(['get', 'nodes'])
      await vi.advanceTimersByTimeAsync(0)

      // A new WebSocket should be created
      expect(kubectlProxyTestState.activeWs).not.toBeNull()
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: 'node-1', exitCode: 0 },
      })

      const result = await exec2
      expect(result.output).toBe('node-1')

      proxy.close()
    })
  })

})
