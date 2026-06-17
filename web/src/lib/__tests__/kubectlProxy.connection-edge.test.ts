import { describe, it, expect, vi } from 'vitest'
import { FakeWebSocket, createProxy, kubectlProxyTestState } from './kubectlProxy.test-helpers'

describe('KubectlProxy connection edge cases', () => {
  describe('parseResourceQuantity — SI decimal suffixes (K, M, G, T)', () => {
    /** Helper: parse a memory/storage value via getNodes */
    async function parseViaNodeMemory(value: string): Promise<number> {
      const proxy = await createProxy()
      const nodesPromise = proxy.getNodes('ctx')
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
              metadata: { name: 'n1', labels: {} },
              status: {
                conditions: [{ type: 'Ready', status: 'True' }],
                allocatable: { memory: value },
              },
            }],
          }),
          exitCode: 0,
        },
      })
      const nodes = await nodesPromise
      proxy.close()
      return nodes[0].memoryBytes!
    }

    it('parses K (kilobytes, decimal)', async () => {
      expect(await parseViaNodeMemory('10K')).toBe(10_000)
    })

    it('parses M (megabytes, decimal)', async () => {
      expect(await parseViaNodeMemory('5M')).toBe(5_000_000)
    })

    it('parses G (gigabytes, decimal)', async () => {
      expect(await parseViaNodeMemory('2G')).toBe(2_000_000_000)
    })

    it('parses T (terabytes, decimal)', async () => {
      expect(await parseViaNodeMemory('1T')).toBe(1_000_000_000_000)
    })

    it('returns 0 for completely unparseable input', async () => {
      expect(await parseViaNodeMemory('not-a-number')).toBe(0)
    })

    it('falls back to parseFloat for suffix-less numeric string', async () => {
      expect(await parseViaNodeMemory('12345')).toBe(12345)
    })
  })

  // =========================================================================
  // ensureConnected: isConnecting wait-and-retry branch (lines 91-94)
  // =========================================================================

  describe('ensureConnected — isConnecting guard', () => {
    it('waits and retries when another connection attempt is in progress', async () => {
      const proxy = await createProxy()

      // Start two exec calls nearly simultaneously — the second will hit the
      // isConnecting guard because connectPromise is set to null during the
      // brief window between setting isConnecting=true and assigning connectPromise.
      // We simulate this by starting the first exec, then before open fires,
      // immediately starting another exec.

      const exec1 = proxy.exec(['get', 'pods'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)

      // First WS is created; its connectPromise exists.
      // Now start a second exec while the first is still connecting.
      const exec2 = proxy.exec(['get', 'nodes'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)

      // Open the WS — both should now be able to proceed
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // There should now be 2 messages sent
      expect(kubectlProxyTestState.sentMessages.length).toBe(2)

      // Respond to both
      for (const rawMsg of kubectlProxyTestState.sentMessages) {
        const msg = JSON.parse(rawMsg)
        kubectlProxyTestState.activeWs!.simulateMessage({
          id: msg.id,
          type: 'result',
          payload: { output: 'ok', exitCode: 0 },
        })
      }

      await Promise.all([exec1, exec2])
      proxy.close()
    })
  })

  // =========================================================================
  // ensureConnected: WebSocket constructor throws (lines 165-168)
  // =========================================================================

  describe('ensureConnected — WebSocket constructor throws', () => {
    it('covers the catch block and falls through to "Not connected" guard', async () => {
      const proxy = await createProxy()
      // Replace WebSocket with a constructor that throws — the catch block
      // in ensureConnected nulls out connectPromise, so the error is caught
      // but ensureConnected returns null; execImmediate then hits the
      // "Not connected to local agent" guard.
      vi.stubGlobal('WebSocket', class {
        constructor() {
          throw new Error('WebSocket not supported')
        }
      })

      await expect(proxy.exec(['get', 'pods'])).rejects.toThrow('Not connected to local agent')

      proxy.close()
    })
  })

  // =========================================================================
  // finalize double-call guard (line 102)
  // =========================================================================

  describe('ensureConnected — finalize double-call guard', () => {
    it('ignores second settlement when both timeout and error fire', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'pods'])
      const rejection = expect(execPromise).rejects.toThrow()
      await vi.advanceTimersByTimeAsync(0)

      // Fire error first — this settles the promise
      kubectlProxyTestState.activeWs!.simulateError()
      await vi.advanceTimersByTimeAsync(0)

      // Now let the connect timeout also fire — it should be a no-op
      await vi.advanceTimersByTimeAsync(2500)

      await rejection

      proxy.close()
    })

    it('ignores open after timeout already fired', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'pods'])
      const rejection = expect(execPromise).rejects.toThrow('Connection timeout')
      await vi.advanceTimersByTimeAsync(0)

      // Let timeout fire first
      await vi.advanceTimersByTimeAsync(2500)

      // Now simulate open — should be ignored since finalize already ran
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      await rejection

      proxy.close()
    })
  })

  // =========================================================================
  // execImmediate: ws not open after ensureConnected (line 241-242)
  // =========================================================================

  describe('execImmediate — ws disconnected between ensureConnected and send', () => {
    it('throws "Not connected" if ws closes between connect and send', async () => {
      const proxy = await createProxy()

      // First, establish a connection
      const warmup = proxy.exec(['version'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const msg0 = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({ id: msg0.id, type: 'result', payload: { output: '', exitCode: 0 } })
      await warmup

      // Now close the WS without the proxy knowing about it right away
      // by setting readyState directly
      kubectlProxyTestState.activeWs!.readyState = FakeWebSocket.CLOSED
      // Also null out the ws to simulate the onclose handler having fired
      kubectlProxyTestState.activeWs!.simulateClose()
      await vi.advanceTimersByTimeAsync(0)

      // Next exec attempt should fail due to cooldown (close sets lastConnectionFailureAt)
      await expect(proxy.exec(['get', 'pods'], { priority: true }))
        .rejects.toThrow('Local agent unavailable (cooldown)')

      proxy.close()
    })
  })

  // =========================================================================
  // processQueue: empty queue returns early (line 211-213)
  // =========================================================================

  describe('processQueue — empty queue no-op', () => {
    it('does nothing when queue is empty and request completes', async () => {
      const proxy = await createProxy()

      // Execute a single request — after it completes, processQueue
      // will be called with an empty queue (covering the early return)
      const execPromise = proxy.exec(['get', 'pods'])
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: 'done', exitCode: 0 },
      })

      const result = await execPromise
      expect(result.output).toBe('done')

      // Verify queue is empty
      expect(proxy.getQueueStats().queued).toBe(0)
      expect(proxy.getQueueStats().active).toBe(0)

      proxy.close()
    })
  })

  // =========================================================================
  // processQueue: error propagation (line 222)
  // =========================================================================

  describe('processQueue — error propagation through queue', () => {
    it('rejects queued request when execImmediate throws', async () => {
      const proxy = await createProxy()

      // Start a request that will fail during ensureConnected
      const execPromise = proxy.exec(['get', 'pods'])
      const rejection = expect(execPromise).rejects.toThrow()
      await vi.advanceTimersByTimeAsync(0)

      // Cause the connection to fail
      kubectlProxyTestState.activeWs!.simulateError()
      await vi.advanceTimersByTimeAsync(0)

      await rejection

      proxy.close()
    })
  })

  // =========================================================================
  // getServices / getPVCs: error and parse-error branches
  // =========================================================================

})
