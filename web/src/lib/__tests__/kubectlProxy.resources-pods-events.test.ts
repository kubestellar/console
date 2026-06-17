import { describe, it, expect, vi } from 'vitest'
import { FakeWebSocket, createProxy, kubectlProxyTestState } from './kubectlProxy.test-helpers'

describe('KubectlProxy pod and event resources', () => {
  describe('getPodIssues — error branches', () => {
    it('throws on non-zero exitCode', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPodIssues('ctx')
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

    it('throws on invalid JSON output', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPodIssues('ctx')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '{nope', exitCode: 0 },
      })

      await expect(promise).rejects.toThrow('Failed to parse kubectl output as JSON')
      proxy.close()
    })

    it('detects ErrImagePull and CreateContainerError', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPodIssues('ctx')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: {
          output: JSON.stringify({
            items: [
              {
                metadata: { name: 'err-pull-pod', namespace: 'ns1' },
                status: {
                  phase: 'Pending',
                  containerStatuses: [{
                    restartCount: 0,
                    state: { waiting: { reason: 'ErrImagePull' } },
                  }],
                },
              },
              {
                metadata: { name: 'create-err-pod', namespace: 'ns1' },
                status: {
                  phase: 'Pending',
                  containerStatuses: [{
                    restartCount: 0,
                    state: { waiting: { reason: 'CreateContainerError' } },
                  }],
                },
              },
            ],
          }),
          exitCode: 0,
        },
      })

      const issues = await promise
      expect(issues).toHaveLength(2)
      expect(issues[0].issues).toContain('ErrImagePull')
      expect(issues[1].issues).toContain('CreateContainerError')
      proxy.close()
    })

    it('handles pod with Failed phase and no explicit reason', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPodIssues('ctx')
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
              metadata: { name: 'generic-fail', namespace: 'default' },
              status: { phase: 'Failed', containerStatuses: [] },
            }],
          }),
          exitCode: 0,
        },
      })

      const issues = await promise
      expect(issues).toHaveLength(1)
      expect(issues[0].status).toBe('Failed')
      proxy.close()
    })

    it('handles Pending with Unschedulable but no reason string', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPodIssues('ctx')
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
              metadata: { name: 'pend-pod', namespace: 'default' },
              status: {
                phase: 'Pending',
                containerStatuses: [],
                conditions: [
                  { type: 'PodScheduled', status: 'False' }, // no reason field
                ],
              },
            }],
          }),
          exitCode: 0,
        },
      })

      const issues = await promise
      expect(issues).toHaveLength(1)
      expect(issues[0].issues).toContain('Unschedulable')
      expect(issues[0].status).toBe('Unschedulable')
      proxy.close()
    })
  })

  // =========================================================================
  // getEvents — error branches
  // =========================================================================

  describe('getEvents — error branches', () => {
    it('throws on non-zero exitCode', async () => {
      const proxy = await createProxy()
      const promise = proxy.getEvents('ctx')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1, error: 'event error' },
      })

      await expect(promise).rejects.toThrow('event error')
      proxy.close()
    })

    it('throws fallback message on non-zero exitCode without error', async () => {
      const proxy = await createProxy()
      const promise = proxy.getEvents('ctx')
      await vi.advanceTimersByTimeAsync(0)
      kubectlProxyTestState.activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(kubectlProxyTestState.sentMessages[0])
      kubectlProxyTestState.activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1 },
      })

      await expect(promise).rejects.toThrow('Failed to get events')
      proxy.close()
    })

    it('handles events with missing count (defaults to 1)', async () => {
      const proxy = await createProxy()
      const promise = proxy.getEvents('ctx')
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
              type: 'Normal',
              reason: 'Pulled',
              message: 'image pulled',
              involvedObject: { kind: 'Pod', name: 'p1' },
              metadata: { namespace: 'default' },
              // no count field
            }],
          }),
          exitCode: 0,
        },
      })

      const events = await promise
      expect(events[0].count).toBe(1)
      proxy.close()
    })

    it('uses -A when no namespace specified', async () => {
      const proxy = await createProxy()
      const promise = proxy.getEvents('ctx')
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
  // getDeployments — error and parse branches
  // =========================================================================

})
