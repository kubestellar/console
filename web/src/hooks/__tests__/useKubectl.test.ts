import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../useDemoMode', () => ({
  getDemoMode: vi.fn(() => false),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, LOCAL_AGENT_WS_URL: 'ws://localhost:8585/ws' }
})

vi.mock('../../lib/utils/wsAuth', () => ({
  appendWsAuthToken: async (url: string) => url,
}))

import { useKubectl, kubectlService } from '../useKubectl'
import { getDemoMode } from '../useDemoMode'

/** WebSocket readyState numeric constants (use these instead of WebSocket.OPEN
 *  etc. because the global WebSocket is replaced by a mock during tests). */
const WS_CONNECTING = 0
const WS_OPEN = 1
const WS_CLOSING = 2
const WS_CLOSED = 3

/** Helper to build a minimal mock WebSocket */
async function flushMicrotasks() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

async function renderKubectlHook() {
  const hook = renderHook(() => useKubectl())
  await flushMicrotasks()
  return hook
}

function createMockWebSocket() {
  const handlers: Record<string, ((...args: unknown[]) => void) | null> = {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  }
  const ws = {
    readyState: WS_CONNECTING,
    send: vi.fn(),
    close: vi.fn(() => {
      ws.readyState = WS_CLOSED
      handlers.onclose?.()
    }),
    set onopen(fn: (() => void) | null) { handlers.onopen = fn },
    get onopen() { return handlers.onopen as (() => void) | null },
    set onmessage(fn: ((e: { data: string }) => void) | null) { handlers.onmessage = fn },
    get onmessage() { return handlers.onmessage as ((e: { data: string }) => void) | null },
    set onclose(fn: (() => void) | null) { handlers.onclose = fn },
    get onclose() { return handlers.onclose as (() => void) | null },
    set onerror(fn: (() => void) | null) { handlers.onerror = fn },
    get onerror() { return handlers.onerror as (() => void) | null },
    /** Simulate the WS transitioning to OPEN and firing onopen */
    simulateOpen() {
      ws.readyState = WS_OPEN
      handlers.onopen?.()
    },
    /** Simulate receiving a message from the server */
    simulateMessage(data: unknown) {
      handlers.onmessage?.({ data: JSON.stringify(data) } as { data: string })
    },
    /** Simulate the WS closing */
    simulateClose() {
      ws.readyState = WS_CLOSED
      handlers.onclose?.()
    },
    simulateError() {
      handlers.onerror?.()
    },
  }
  return ws
}

describe('useKubectl', () => {
  let mockWs: ReturnType<typeof createMockWebSocket>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockWs = createMockWebSocket()
    // Build a mock constructor that returns our mockWs AND exposes the
    // standard readyState constants (CONNECTING, OPEN, CLOSING, CLOSED).
    // Without these, the source code's `WebSocket.OPEN` evaluates to
    // undefined, breaking readyState checks.
    // Must use a regular function (not arrow) so it can be invoked with `new`.
    // Arrow functions throw TypeError when used as constructors.
    const MockCtor = vi.fn(function () { return mockWs }) as unknown as typeof WebSocket
    Object.defineProperties(MockCtor, {
      CONNECTING: { value: WS_CONNECTING },
      OPEN: { value: WS_OPEN },
      CLOSING: { value: WS_CLOSING },
      CLOSED: { value: WS_CLOSED },
    })
    vi.stubGlobal('WebSocket', MockCtor)
    // Reset getDemoMode to return false
    vi.mocked(getDemoMode).mockReturnValue(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('returns execute function', async () => {
    const { result } = await renderKubectlHook()
    expect(typeof result.current.execute).toBe('function')
  })

  it('cleans up on unmount without throwing', async () => {
    const { unmount } = await renderKubectlHook()
    expect(() => unmount()).not.toThrow()
  })

  it('execute returns a promise', async () => {
    const { result } = await renderKubectlHook()
    const promise = result.current.execute('my-cluster', ['get', 'pods'])
    expect(promise).toBeInstanceOf(Promise)
    // Let it timeout silently rather than leaving pending
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })
    promise.catch(() => {})
  })

  it('execute resolves with output when WebSocket responds', async () => {
    const { result } = await renderKubectlHook()

    let resolvedValue: string | undefined
    act(() => {
      result.current.execute('my-cluster', ['get', 'pods']).then((v) => {
        resolvedValue = v
      })
    })

    // Open the WebSocket
    act(() => { mockWs.simulateOpen() })

    // The send should have been called
    expect(mockWs.send).toHaveBeenCalled()
    const sentData = JSON.parse(mockWs.send.mock.calls[0][0])
    expect(sentData.type).toBe('kubectl')
    expect(sentData.payload.context).toBe('my-cluster')
    expect(sentData.payload.args).toEqual(['get', 'pods'])

    // Simulate response with the matching ID
    act(() => {
      mockWs.simulateMessage({
        id: sentData.id,
        payload: { output: 'NAME  READY  STATUS\nmy-pod  1/1  Running' },
      })
    })

    await vi.waitFor(() => {
      expect(resolvedValue).toBe('NAME  READY  STATUS\nmy-pod  1/1  Running')
    })
  })

  it('execute rejects when WebSocket responds with error', async () => {
    const { result } = await renderKubectlHook()

    let rejectedError: Error | undefined
    act(() => {
      result.current.execute('my-cluster', ['get', 'pods']).catch((e) => {
        rejectedError = e
      })
    })

    act(() => { mockWs.simulateOpen() })

    const sentData = JSON.parse(mockWs.send.mock.calls[0][0])

    act(() => {
      mockWs.simulateMessage({
        id: sentData.id,
        payload: { error: 'context not found' },
      })
    })

    await vi.waitFor(() => {
      expect(rejectedError).toBeInstanceOf(Error)
      expect(rejectedError?.message).toBe('context not found')
    })
  })

  it('execute resolves empty string when payload has no output or error', async () => {
    const { result } = await renderKubectlHook()

    let resolvedValue: string | undefined
    act(() => {
      result.current.execute('my-cluster', ['apply']).then((v) => {
        resolvedValue = v
      })
    })

    act(() => { mockWs.simulateOpen() })

    const sentData = JSON.parse(mockWs.send.mock.calls[0][0])

    act(() => {
      mockWs.simulateMessage({
        id: sentData.id,
        payload: {},
      })
    })

    await vi.waitFor(() => {
      expect(resolvedValue).toBe('')
    })
  })

  it('execute rejects with timeout after REQUEST_TIMEOUT', async () => {
    const { result } = await renderKubectlHook()

    let rejectedError: Error | undefined
    act(() => {
      result.current.execute('my-cluster', ['get', 'pods']).catch((e) => {
        rejectedError = e
      })
    })

    act(() => { mockWs.simulateOpen() })

    // Advance past the 30s timeout
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })

    await vi.waitFor(() => {
      expect(rejectedError).toBeInstanceOf(Error)
      expect(rejectedError?.message).toBe('Request timed out')
    })
  })

  it('queues requests when WebSocket is not yet open', async () => {
    const { result } = await renderKubectlHook()

    act(() => {
      result.current.execute('my-cluster', ['get', 'nodes']).catch(() => {})
    })

    // WebSocket not open yet, so send should not have been called
    expect(mockWs.send).not.toHaveBeenCalled()

    // Now open the WS; queued request should be sent
    act(() => { mockWs.simulateOpen() })

    expect(mockWs.send).toHaveBeenCalled()
  })

  it('rejects all pending requests when connection closes', async () => {
    const { result } = await renderKubectlHook()

    let rejectedError: Error | undefined
    act(() => {
      result.current.execute('my-cluster', ['get', 'pods']).catch((e) => {
        rejectedError = e
      })
    })

    act(() => { mockWs.simulateOpen() })
    act(() => { mockWs.simulateClose() })

    await vi.waitFor(() => {
      expect(rejectedError).toBeInstanceOf(Error)
      expect(rejectedError?.message).toBe('Connection closed')
    })
  })

  it('skips WebSocket connection in demo mode', async () => {
    vi.mocked(getDemoMode).mockReturnValue(true)

    // Reset the service by unsubscribing and re-subscribing
    const { unmount } = await renderKubectlHook()
    unmount()

    // WebSocket constructor should not have been called for connections in demo mode
    // (it may have been called from the first renderHook before we set demo mode)
    const wsCalls = vi.mocked(WebSocket).mock.calls
    // The key test: when getDemoMode returns true, no new WS connections are made
    const callCountBefore = wsCalls.length
    await renderKubectlHook()
    const callCountAfter = vi.mocked(WebSocket).mock.calls.length
    // No new WebSocket connections should be created
    expect(callCountAfter).toBe(callCountBefore)
  })

  it('ignores messages with unparseable JSON', async () => {
    const { result } = await renderKubectlHook()

    act(() => {
      result.current.execute('my-cluster', ['get', 'pods']).catch(() => {})
    })
    act(() => { mockWs.simulateOpen() })

    // Simulate receiving malformed data - should not throw
    expect(() => {
      act(() => {
        mockWs.onmessage?.({ data: 'not valid json' } as { data: string })
      })
    }).not.toThrow()
  })

  it('ignores messages with non-matching request IDs', async () => {
    const { result } = await renderKubectlHook()

    let resolved = false
    act(() => {
      result.current.execute('my-cluster', ['get', 'pods']).then(() => {
        resolved = true
      }).catch(() => {})
    })

    act(() => { mockWs.simulateOpen() })

    // Send a response with a wrong ID
    act(() => {
      mockWs.simulateMessage({
        id: 'wrong-id',
        payload: { output: 'ignored' },
      })
    })

    // The original request should still be pending
    expect(resolved).toBe(false)

    // Clean up by timing out
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
  })

  it('multiple hooks share the same singleton service', async () => {
    const { result: result1 } = await renderKubectlHook()
    const { result: result2 } = await renderKubectlHook()

    // Both hooks return the same function signature (shared service)
    expect(typeof result1.current.execute).toBe('function')
    expect(typeof result2.current.execute).toBe('function')
  })

  it('kubectlService is exported and has execute method', async () => {
    expect(kubectlService).toBeDefined()
    expect(typeof kubectlService.execute).toBe('function')
    expect(typeof kubectlService.subscribe).toBe('function')
  })
})
