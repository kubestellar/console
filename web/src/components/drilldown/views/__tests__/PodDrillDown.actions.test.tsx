import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePodActions } from '../PodDrillDown.actions'

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: vi.fn() })
}))

vi.mock('../../../../hooks/useDrillDown', () => ({
  useDrillDown: () => ({
    drillTo: vi.fn(),
    close: vi.fn()
  })
}))

vi.mock('../../../../hooks/usePermissions', () => ({
  useCanI: () => ({ allowed: true })
}))

vi.mock('../../../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() })
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

const WS_CONNECTING = 0
const WS_OPEN = 1
const WS_CLOSED = 3

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
}

function createMockWs(url = 'ws://localhost:8585'): MockWs {
  const ws: MockWs = {
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send: vi.fn(),
    close: vi.fn().mockImplementation(function(this: MockWs) {
      this.readyState = WS_CLOSED
    }),
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
  }
  return ws
}

let mockWs: MockWs

const mockOpenTrackedWs = vi.fn()
const mockParseWsMessage = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  mockWs = createMockWs()
  mockOpenTrackedWs.mockResolvedValue(mockWs)
  mockParseWsMessage.mockImplementation((event: MessageEvent, _context: string) => {
    try {
      return JSON.parse(event.data)
    } catch {
      return null
    }
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

const defaultProps = {
  cluster: 'test-cluster',
  namespace: 'test-ns',
  podName: 'test-pod',
  status: 'Running',
  restarts: 0,
  issues: [],
  agentConnected: true,
  backendActionUnavailable: false,
  backendUnavailableMessage: '',
  labels: {},
  annotations: {},
  ownerChain: [],
  openTrackedWs: mockOpenTrackedWs,
  parseWsMessage: mockParseWsMessage,
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('PodDrillDown.actions - runKubectl WebSocket race condition fix', () => {
  describe('happy path', () => {
    it('resolves with correct output when matching requestId message arrives', async () => {
      const { result } = renderHook(() => usePodActions(defaultProps))
      
      let fetchPromise: Promise<void> | undefined
      await act(async () => {
        fetchPromise = result.current.fetchRelatedResources(true)
        await flushMicrotasks()
      })

      const sentData = mockWs.send.mock.calls[0]?.[0]
      const sentMessage = sentData ? JSON.parse(sentData) : null
      
      expect(sentMessage).toBeTruthy()
      expect(sentMessage.id).toMatch(/^related-/)
      expect(sentMessage.type).toBe('kubectl')

      const requestId = sentMessage.id

      await act(async () => {
        mockWs._triggerOpen()
        mockWs._triggerMessage({
          id: requestId,
          payload: { output: 'serviceAccountName: my-sa' }
        })
        await flushMicrotasks()
        vi.runAllTimers()
        await fetchPromise
      })

      expect(mockWs.close).toHaveBeenCalled()
    })
  })

  describe('race condition - unrelated message arrives first', () => {
    it('does NOT resolve when message with different id arrives', async () => {
      const { result } = renderHook(() => usePodActions(defaultProps))
      
      let fetchPromise: Promise<void> | undefined
      await act(async () => {
        fetchPromise = result.current.fetchRelatedResources(true)
        await flushMicrotasks()
      })

      const sentData = mockWs.send.mock.calls[0]?.[0]
      const sentMessage = sentData ? JSON.parse(sentData) : null
      const requestId = sentMessage.id

      mockWs.close.mockClear()

      await act(async () => {
        mockWs._triggerOpen()
        mockWs._triggerMessage({
          id: 'unrelated-id-12345',
          payload: { output: 'unrelated output' }
        })
        await flushMicrotasks()
      })

      expect(mockWs.close).not.toHaveBeenCalled()

      await act(async () => {
        mockWs._triggerMessage({
          id: requestId,
          payload: { output: 'correct output' }
        })
        await flushMicrotasks()
        await fetchPromise
      })

      expect(mockWs.close).toHaveBeenCalled()
    })

    it('waits for matching message even after receiving multiple unrelated messages', async () => {
      const { result } = renderHook(() => usePodActions(defaultProps))
      
      let fetchPromise: Promise<void> | undefined
      await act(async () => {
        fetchPromise = result.current.fetchRelatedResources(true)
        await flushMicrotasks()
      })

      const sentData = mockWs.send.mock.calls[0]?.[0]
      const sentMessage = sentData ? JSON.parse(sentData) : null
      const requestId = sentMessage.id

      mockWs.close.mockClear()

      await act(async () => {
        mockWs._triggerOpen()
        mockWs._triggerMessage({
          id: 'unrelated-1',
          payload: { output: 'unrelated 1' }
        })
        mockWs._triggerMessage({
          id: 'unrelated-2',
          payload: { output: 'unrelated 2' }
        })
        mockWs._triggerMessage({
          id: 'unrelated-3',
          payload: { output: 'unrelated 3' }
        })
        await flushMicrotasks()
      })

      expect(mockWs.close).not.toHaveBeenCalled()

      await act(async () => {
        mockWs._triggerMessage({
          id: requestId,
          payload: { output: 'correct output' }
        })
        await flushMicrotasks()
        await fetchPromise
      })

      expect(mockWs.close).toHaveBeenCalled()
    })
  })

  describe('timeout handling', () => {
    it('resolves with empty output when timeout expires before matching message', async () => {
      const { result } = renderHook(() => usePodActions(defaultProps))
      
      let fetchPromise: Promise<void> | undefined
      await act(async () => {
        fetchPromise = result.current.fetchRelatedResources(true)
        await flushMicrotasks()
      })

      await act(async () => {
        mockWs._triggerOpen()
        await flushMicrotasks()
      })

      mockWs.close.mockClear()

      await act(async () => {
        vi.advanceTimersByTime(10_001)
        await flushMicrotasks()
        await fetchPromise
      })

      expect(mockWs.close).toHaveBeenCalled()
    })

    it('clears timeout when matching message arrives before expiration', async () => {
      const { result } = renderHook(() => usePodActions(defaultProps))
      
      let fetchPromise: Promise<void> | undefined
      await act(async () => {
        fetchPromise = result.current.fetchRelatedResources(true)
        await flushMicrotasks()
      })

      const sentData = mockWs.send.mock.calls[0]?.[0]
      const sentMessage = sentData ? JSON.parse(sentData) : null
      const requestId = sentMessage.id

      await act(async () => {
        mockWs._triggerOpen()
        await flushMicrotasks()
      })

      await act(async () => {
        vi.advanceTimersByTime(5_000)
        mockWs._triggerMessage({
          id: requestId,
          payload: { output: 'data arrived in time' }
        })
        await flushMicrotasks()
        await fetchPromise
      })

      const closeCallCount = mockWs.close.mock.calls.length

      await act(async () => {
        vi.advanceTimersByTime(10_000)
        await flushMicrotasks()
      })

      expect(mockWs.close.mock.calls.length).toBe(closeCallCount)
    })
  })

  describe('error handling', () => {
    it('resolves with empty output on WebSocket error', async () => {
      const { result } = renderHook(() => usePodActions(defaultProps))
      
      await act(async () => {
        result.current.fetchRelatedResources(true)
        await flushMicrotasks()
      })

      await act(async () => {
        mockWs._triggerOpen()
        mockWs._triggerError()
        await flushMicrotasks()
      })

      expect(mockWs.close).toHaveBeenCalled()
    })

    it('resolves with empty output when parseWsMessage returns null', async () => {
      mockParseWsMessage.mockReturnValue(null)
      
      const { result } = renderHook(() => usePodActions(defaultProps))
      
      await act(async () => {
        result.current.fetchRelatedResources(true)
        await flushMicrotasks()
      })

      await act(async () => {
        mockWs._triggerOpen()
        mockWs._triggerMessage({ any: 'data' })
        await flushMicrotasks()
      })

      expect(mockWs.close).toHaveBeenCalled()
    })
  })

  describe('message structure validation', () => {
    it('ignores messages without payload.output even if id matches', async () => {
      const { result } = renderHook(() => usePodActions(defaultProps))
      
      await act(async () => {
        result.current.fetchRelatedResources(true)
        await flushMicrotasks()
      })

      const sentData = mockWs.send.mock.calls[0]?.[0]
      const sentMessage = sentData ? JSON.parse(sentData) : null
      const requestId = sentMessage.id

      mockWs.close.mockClear()

      await act(async () => {
        mockWs._triggerOpen()
        mockWs._triggerMessage({
          id: requestId,
          payload: {}
        })
        await flushMicrotasks()
      })

      expect(mockWs.close).not.toHaveBeenCalled()

      await act(async () => {
        mockWs._triggerMessage({
          id: requestId,
          payload: { output: 'now with output' }
        })
        await flushMicrotasks()
      })

      expect(mockWs.close).toHaveBeenCalled()
    })
  })
})
