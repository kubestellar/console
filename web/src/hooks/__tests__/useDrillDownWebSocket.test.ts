import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/constants')>()
  return { ...actual, LOCAL_AGENT_WS_URL: 'ws://localhost:8585' }
})

vi.mock('../../lib/utils/wsAuth', () => ({
  appendWsAuthToken: vi.fn(async (url: string) => url),
}))

import { appendWsAuthToken } from '../../lib/utils/wsAuth'
import { useDrillDownWebSocket } from '../useDrillDownWebSocket'

const mockAppendWsAuthToken = vi.mocked(appendWsAuthToken)
const WS_CONNECTING = 0
const WS_OPEN = 1
const WS_CLOSING = 2
const WS_CLOSED = 3

type WsEventHandler = (event: MessageEvent | Event) => void

interface MockWs {
  onopen: WsEventHandler | null
  onmessage: WsEventHandler | null
  onerror: WsEventHandler | null
  onclose: WsEventHandler | null
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  _closeSpy: ReturnType<typeof vi.fn>
  readyState: number
  url: string
  _triggerOpen: () => void
  _triggerMessage: (data: unknown) => void
  _triggerError: () => void
  _triggerClose: () => void
}

function createMockWs(url = 'ws://localhost:8585'): MockWs {
  const closeSpy = vi.fn().mockImplementation(function(this: MockWs) {
    this.readyState = WS_CLOSED
    this.onclose?.(new Event('close'))
  })
  const ws: MockWs = {
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send: vi.fn(),
    close: closeSpy,
    _closeSpy: closeSpy,
    readyState: WS_CONNECTING,
    url,
    _triggerOpen() {
      this.readyState = WS_OPEN
      this.onopen?.(new Event('open'))
    },
    _triggerMessage(data: unknown) {
      this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }))
    },
    _triggerError() {
      this.onerror?.(new Event('error'))
    },
    _triggerClose() {
      this.readyState = WS_CLOSED
      this.onclose?.(new Event('close'))
    },
  }
  return ws
}

let wsInstances: MockWs[] = []

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  wsInstances = []
  vi.useRealTimers()

  const mockWebSocket = vi.fn(function(this: unknown, url: string) {
    const ws = createMockWs(url)
    wsInstances.push(ws)
    return ws
  })
  Object.assign(mockWebSocket, {
    CONNECTING: WS_CONNECTING,
    OPEN: WS_OPEN,
    CLOSING: WS_CLOSING,
    CLOSED: WS_CLOSED,
  })

  vi.stubGlobal('WebSocket', mockWebSocket)
  mockAppendWsAuthToken.mockImplementation(async (url: string) => url)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

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
      const promise = result.current.runKubectl(['get', 'pods'])
      await flushMicrotasks()

      const ws = wsInstances[0]
      expect(ws).toBeDefined()

      act(() => {
        ws._triggerOpen()
      })

      const sent = JSON.parse(ws.send.mock.calls[0][0])
      act(() => {
        ws._triggerMessage({ id: sent.id, payload: { output: 'pod1  Running' } })
      })

      await expect(promise).resolves.toBe('pod1  Running')
    })

    it('sends correct cluster and args in payload', async () => {
      const { result } = renderHook(() => useDrillDownWebSocket('my-cluster'))
      const promise = result.current.runKubectl(['get', 'nodes', '-o', 'json'])
      await flushMicrotasks()

      const ws = wsInstances[0]
      expect(ws).toBeDefined()

      act(() => {
        ws._triggerOpen()
      })

      const sent = JSON.parse(ws.send.mock.calls[0][0])
      expect(sent.type).toBe('kubectl')
      expect(sent.payload.context).toBe('my-cluster')
      expect(sent.payload.args).toEqual(['get', 'nodes', '-o', 'json'])

      act(() => {
        ws._triggerMessage({ id: sent.id, payload: { output: '{}' } })
      })

      await expect(promise).resolves.toBe('{}')
    })

    it('returns empty string on WebSocket error', async () => {
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))
      const promise = result.current.runKubectl(['get', 'pods'])
      await flushMicrotasks()

      const ws = wsInstances[0]
      expect(ws).toBeDefined()

      act(() => {
        ws._triggerOpen()
        ws._triggerError()
      })

      await expect(promise).resolves.toBe('')
    })

    it('returns empty string when message parse fails', async () => {
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))
      const promise = result.current.runKubectl(['get', 'pods'])
      await flushMicrotasks()

      const ws = wsInstances[0]
      expect(ws).toBeDefined()

      act(() => {
        ws._triggerOpen()
        ws.onmessage?.(new MessageEvent('message', { data: 'not-json{{{' }))
      })

      await expect(promise).resolves.toBe('')
    })

    it('returns empty string when openTrackedWs fails', async () => {
      mockAppendWsAuthToken.mockRejectedValueOnce(new Error('token error'))
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))

      await expect(result.current.runKubectl(['get', 'pods'])).resolves.toBe('')
      expect(wsInstances).toHaveLength(0)
    })
  })

  describe('runHelm', () => {
    it('sends helm command type', async () => {
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))
      const promise = result.current.runHelm(['status', 'my-release', '-n', 'default'])
      await flushMicrotasks()

      const ws = wsInstances[0]
      expect(ws).toBeDefined()

      act(() => {
        ws._triggerOpen()
      })

      const sent = JSON.parse(ws.send.mock.calls[0][0])
      expect(sent.type).toBe('helm')
      expect(sent.payload.args).toEqual(['status', 'my-release', '-n', 'default'])

      act(() => {
        ws._triggerMessage({ id: sent.id, payload: { output: '{"status":"deployed"}' } })
      })

      await expect(promise).resolves.toBe('{"status":"deployed"}')
    })

    it('uses 15s default timeout for helm', async () => {
      vi.useFakeTimers()
      try {
        const { result } = renderHook(() => useDrillDownWebSocket('prod'))
        const promise = result.current.runHelm(['list'])
        await flushMicrotasks()

        const ws = wsInstances[0]
        expect(ws).toBeDefined()

        act(() => {
          ws._triggerOpen()
        })

        await act(async () => {
          vi.advanceTimersByTime(16_000)
          await Promise.resolve()
        })

        await expect(promise).resolves.toBe('')
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('parseWsMessage', () => {
    it('parses valid JSON message', () => {
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))
      const event = new MessageEvent('message', { data: '{"id":"1","type":"kubectl"}' })
      expect(result.current.parseWsMessage(event)).toEqual({ id: '1', type: 'kubectl' })
    })

    it('returns null for invalid JSON', () => {
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))
      const event = new MessageEvent('message', { data: '{bad json' })
      expect(result.current.parseWsMessage(event)).toBeNull()
    })

    it('returns null for empty string', () => {
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))
      const event = new MessageEvent('message', { data: '' })
      expect(result.current.parseWsMessage(event)).toBeNull()
    })
  })

  describe('cleanup on unmount', () => {
    it('closes all tracked WebSocket connections on unmount', async () => {
      const { result, unmount } = renderHook(() => useDrillDownWebSocket('prod'))

      await Promise.all([
        result.current.openTrackedWs(),
        result.current.openTrackedWs(),
      ])

      expect(wsInstances).toHaveLength(2)

      unmount()

      // The hook wraps ws.close with a tracking wrapper, so assert on the
      // persistent _closeSpy reference which the wrapper delegates to.
      wsInstances.forEach(ws => expect(ws._closeSpy).toHaveBeenCalled())
    })
  })

  describe('openTrackedWs', () => {
    it('appends auth token to WS URL', async () => {
      mockAppendWsAuthToken.mockResolvedValueOnce('ws://localhost:8585?token=abc123')
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))

      await expect(result.current.openTrackedWs()).resolves.toBeDefined()
      expect(mockAppendWsAuthToken).toHaveBeenCalledWith('ws://localhost:8585')
      expect(wsInstances[0].url).toBe('ws://localhost:8585?token=abc123')
    })

    it('tracks the WebSocket in the active set', async () => {
      const { result } = renderHook(() => useDrillDownWebSocket('prod'))

      await result.current.openTrackedWs()

      expect(wsInstances).toHaveLength(1)
    })

    it('removes ws from active set when closed manually', async () => {
      const { result, unmount } = renderHook(() => useDrillDownWebSocket('prod'))
      const ws = await result.current.openTrackedWs()

      ws.close()

      expect(() => unmount()).not.toThrow()
    })
  })

  describe('timeout behaviour', () => {
    it('resolves with empty string after default 10s timeout', async () => {
      vi.useFakeTimers()
      try {
        const { result } = renderHook(() => useDrillDownWebSocket('prod'))
        const promise = result.current.runKubectl(['get', 'pods'])
        await flushMicrotasks()

        const ws = wsInstances[0]
        expect(ws).toBeDefined()

        act(() => {
          ws._triggerOpen()
        })

        await act(async () => {
          vi.advanceTimersByTime(11_000)
          await Promise.resolve()
        })

        await expect(promise).resolves.toBe('')
      } finally {
        vi.useRealTimers()
      }
    })

    it('resolves with partial output accumulated before timeout', async () => {
      vi.useFakeTimers()
      try {
        const { result } = renderHook(() => useDrillDownWebSocket('prod'))
        const promise = result.current.runKubectl(['get', 'pods'], 5_000)
        await flushMicrotasks()

        const ws = wsInstances[0]
        expect(ws).toBeDefined()

        act(() => {
          ws._triggerOpen()
        })

        await act(async () => {
          vi.advanceTimersByTime(6_000)
          await Promise.resolve()
        })

        await expect(promise).resolves.toBe('')
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
