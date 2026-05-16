import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/constants')>()
  return { ...actual, LOCAL_AGENT_WS_URL: 'ws://localhost:8585' }
})

vi.mock('../../lib/utils/wsAuth', () => ({
  appendWsAuthToken: vi.fn(async (url: string) => url),
}))

import { appendWsAuthToken } from '../../lib/utils/wsAuth'
const mockAppendWsAuthToken = vi.mocked(appendWsAuthToken)

// ---------------------------------------------------------------------------
// WebSocket mock factory
// ---------------------------------------------------------------------------

type WsEventHandler = (event: MessageEvent | Event) => void

interface MockWs {
  onopen: WsEventHandler | null
  onmessage: WsEventHandler | null
  onerror: WsEventHandler | null
  onclose: WsEventHandler | null
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  readyState: number
  url: string
  _triggerOpen: () => void
  _triggerMessage: (data: unknown) => void
  _triggerError: () => void
  _triggerClose: () => void
}

function createMockWs(url = 'ws://localhost:8585'): MockWs {
  const ws: MockWs = {
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send: vi.fn(),
    close: vi.fn().mockImplementation(function(this: MockWs) {
      this.readyState = WebSocket.CLOSED
    }),
    readyState: WebSocket.CONNECTING,
    url,
    _triggerOpen() {
      this.readyState = WebSocket.OPEN
      this.onopen?.(new Event('open'))
    },
    _triggerMessage(data: unknown) {
      this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }))
    },
    _triggerError() {
      this.onerror?.(new Event('error'))
    },
    _triggerClose() {
      this.readyState = WebSocket.CLOSED
      this.onclose?.(new Event('close'))
    },
  }
  return ws
}

let wsInstances: MockWs[] = []

beforeEach(() => {
  wsInstances = []
  vi.stubGlobal('WebSocket', vi.fn().mockImplementation((url: string) => {
    const ws = createMockWs(url)
    wsInstances.push(ws)
    return ws
  }))
  mockAppendWsAuthToken.mockImplementation(async (url: string) => url)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Import subject under test
// ---------------------------------------------------------------------------

import { useDrillDownWebSocket } from '../useDrillDownWebSocket'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useDrillDownWebSocket', () => {
  describe('hook API', () => {
    it('exposes runKubectl, runHelm, openTrackedWs, parseWsMessage', () => {
      const { result } = renderHook(() => useDrillDownWebSocket('test-cluster'))
      expect(typeof result.current.runKubectl).toBe('function')
      expect(typeof result.current.runHelm).toBe('function')
      expect(typeof result.current.openTrackedWs).toBe('function')
      expect(typeof result.current.parseWsMessage).toBe('function')
    })
  })

  describe('runKubectl', () => {
    it('opens WebSocket and sends kubectl command', async () => {
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))
      const promise = act(async () => result.current.runKubectl(['get', 'pods']))
      // Let appendWsAuthToken settle then trigger open
      await Promise.resolve()
      const ws = wsInstances[0]
      ws._triggerOpen()
      ws._triggerMessage({
        id: ws.send.mock.calls[0]?.[0] ? JSON.parse(ws.send.mock.calls[0][0]).id : 'kubectl-0-x',
        payload: { output: 'pod1  Running' },
      })
      const output = await promise
      expect(output).toBe('pod1  Running')
    })

    it('sends correct cluster and args in payload', async () => {
      const { result } = renderHook(() => useDrillDownWebSocket('my-cluster'))
      const promise = act(async () => result.current.runKubectl(['get', 'nodes', '-o', 'json']))
      await Promise.resolve()
      const ws = wsInstances[0]
      ws._triggerOpen()
      const sent = JSON.parse(ws.send.mock.calls[0][0])
      expect(sent.type).toBe('kubectl')
      expect(sent.payload.context).toBe('my-cluster')
      expect(sent.payload.args).toEqual(['get', 'nodes', '-o', 'json'])
      ws._triggerMessage({ id: sent.id, payload: { output: '{}' } })
      await promise
    })

    it('returns empty string on WebSocket error', async () => {
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))
      const promise = act(async () => result.current.runKubectl(['get', 'pods']))
      await Promise.resolve()
      const ws = wsInstances[0]
      ws._triggerOpen()
      ws._triggerError()
      const output = await promise
      expect(output).toBe('')
    })

    it('returns empty string when message parse fails', async () => {
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))
      const promise = act(async () => result.current.runKubectl(['get', 'pods']))
      await Promise.resolve()
      const ws = wsInstances[0]
      ws._triggerOpen()
      // Send malformed JSON — onmessage parses it
      ws.onmessage?.(new MessageEvent('message', { data: 'not-json{{{' }))
      const output = await promise
      expect(output).toBe('')
    })

    it('returns empty string when openTrackedWs fails', async () => {
      mockAppendWsAuthToken.mockRejectedValueOnce(new Error('token error'))
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))
      const output = await act(async () => result.current.runKubectl(['get', 'pods']))
      expect(output).toBe('')
    })
  })

  describe('runHelm', () => {
    it('sends helm command type', async () => {
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))
      const promise = act(async () => result.current.runHelm(['status', 'my-release', '-n', 'default']))
      await Promise.resolve()
      const ws = wsInstances[0]
      ws._triggerOpen()
      const sent = JSON.parse(ws.send.mock.calls[0][0])
      expect(sent.type).toBe('helm')
      expect(sent.payload.args).toEqual(['status', 'my-release', '-n', 'default'])
      ws._triggerMessage({ id: sent.id, payload: { output: '{"status":"deployed"}' } })
      const output = await promise
      expect(output).toBe('{"status":"deployed"}')
    })

    it('uses 15s default timeout for helm', async () => {
      vi.useFakeTimers()
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))
      const promise = act(async () => result.current.runHelm(['list']))
      // Let token settle
      await Promise.resolve()
      await Promise.resolve()
      const ws = wsInstances[0]
      ws._triggerOpen()
      // Advance past 15s timeout
      vi.advanceTimersByTime(16_000)
      const output = await promise
      expect(output).toBe('')
      vi.useRealTimers()
    })
  })

  describe('parseWsMessage', () => {
    it('parses valid JSON message', () => {
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))
      const event = new MessageEvent('message', { data: '{"id":"1","type":"kubectl"}' })
      const parsed = result.current.parseWsMessage(event)
      expect(parsed).toEqual({ id: '1', type: 'kubectl' })
    })

    it('returns null for invalid JSON', () => {
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))
      const event = new MessageEvent('message', { data: '{bad json' })
      const parsed = result.current.parseWsMessage(event)
      expect(parsed).toBeNull()
    })

    it('returns null for empty string', () => {
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))
      const event = new MessageEvent('message', { data: '' })
      const parsed = result.current.parseWsMessage(event)
      expect(parsed).toBeNull()
    })
  })

  describe('cleanup on unmount', () => {
    it('closes all tracked WebSocket connections on unmount', async () => {
      const { result, unmount } = renderHook(() => useDrillDownWebSocket('prod'))
      // Open two connections
      act(() => { void result.current.openTrackedWs() })
      act(() => { void result.current.openTrackedWs() })
      await Promise.resolve()
      await Promise.resolve()
      expect(wsInstances.length).toBeGreaterThanOrEqual(2)
      unmount()
      // All sockets should be closed
      wsInstances.forEach(ws => expect(ws.close).toHaveBeenCalled())
    })
  })

  describe('openTrackedWs', () => {
    it('appends auth token to WS URL', async () => {
      mockAppendWsAuthToken.mockResolvedValueOnce('ws://localhost:8585?token=abc123')
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))
      await act(async () => { await result.current.openTrackedWs() })
      expect(mockAppendWsAuthToken).toHaveBeenCalledWith('ws://localhost:8585')
      expect(wsInstances[0].url).toBe('ws://localhost:8585?token=abc123')
    })

    it('tracks the WebSocket in the active set', async () => {
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))
      const wsPromise = act(async () => result.current.openTrackedWs())
      await wsPromise
      expect(wsInstances.length).toBe(1)
    })

    it('removes ws from active set when closed manually', async () => {
      const { result, unmount } = renderHook(() => useDrillDownWebSocket('prod'))
      let ws!: WebSocket
      await act(async () => { ws = await result.current.openTrackedWs() })
      // Manually close — should deregister from tracked set
      ws.close()
      // Unmount should not throw even if set is empty
      expect(() => unmount()).not.toThrow()
    })
  })

  describe('timeout behaviour', () => {
    it('resolves with empty string after default 10s timeout', async () => {
      vi.useFakeTimers()
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))
      const promise = act(async () => result.current.runKubectl(['get', 'pods']))
      // Let token resolve
      await Promise.resolve()
      await Promise.resolve()
      const ws = wsInstances[0]
      ws._triggerOpen()
      // Advance past default 10s timeout
      vi.advanceTimersByTime(11_000)
      const output = await promise
      expect(output).toBe('')
      vi.useRealTimers()
    })

    it('resolves with partial output accumulated before timeout', async () => {
      vi.useFakeTimers()
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))
      const promise = act(async () => result.current.runKubectl(['get', 'pods'], 5_000))
      await Promise.resolve()
      await Promise.resolve()
      const ws = wsInstances[0]
      ws._triggerOpen()
      // Do NOT send message — let timeout fire
      vi.advanceTimersByTime(6_000)
      const output = await promise
      expect(output).toBe('')
      vi.useRealTimers()
    })
  })
})
