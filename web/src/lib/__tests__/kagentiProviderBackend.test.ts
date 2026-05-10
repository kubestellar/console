import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock authFetch
vi.mock('../api', () => ({
  authFetch: vi.fn(),
}))

import { authFetch } from '../api'

const mockAuthFetch = vi.mocked(authFetch)

// Import the module under test (need to import after mock setup)
let fetchKagentiProviderStatus: typeof import('../kagentiProviderBackend').fetchKagentiProviderStatus
let fetchKagentiProviderAgents: typeof import('../kagentiProviderBackend').fetchKagentiProviderAgents
let kagentiProviderCallTool: typeof import('../kagentiProviderBackend').kagentiProviderCallTool
let kagentiProviderChat: typeof import('../kagentiProviderBackend').kagentiProviderChat

beforeEach(async () => {
  vi.clearAllMocks()
  const mod = await import('../kagentiProviderBackend')
  fetchKagentiProviderStatus = mod.fetchKagentiProviderStatus
  fetchKagentiProviderAgents = mod.fetchKagentiProviderAgents
  kagentiProviderCallTool = mod.kagentiProviderCallTool
  kagentiProviderChat = mod.kagentiProviderChat
})

describe('fetchKagentiProviderStatus', () => {
  it('returns status when available', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ available: true, url: 'http://provider:8080' }),
    } as Response)

    const result = await fetchKagentiProviderStatus()
    expect(result.available).toBe(true)
    expect(result.url).toBe('http://provider:8080')
  })

  it('returns unavailable on HTTP error', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    const result = await fetchKagentiProviderStatus()
    expect(result.available).toBe(false)
    expect(result.reason).toBe('HTTP 500')
  })

  it('returns unavailable on network error', async () => {
    mockAuthFetch.mockRejectedValueOnce(new Error('Network error'))

    const result = await fetchKagentiProviderStatus()
    expect(result.available).toBe(false)
    expect(result.reason).toBe('unreachable')
  })

  it('rethrows AbortError so callers can cancel polling cleanly', async () => {
    mockAuthFetch.mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'))

    await expect(fetchKagentiProviderStatus()).rejects.toThrow('The operation was aborted')
  })
})

describe('fetchKagentiProviderAgents', () => {
  it('returns agents list', async () => {
    const agents = [
      { name: 'agent-1', namespace: 'default', description: 'Test agent' },
    ]
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ agents }),
    } as Response)

    const result = await fetchKagentiProviderAgents()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('agent-1')
  })

  it('returns empty array on HTTP error', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response)

    const result = await fetchKagentiProviderAgents()
    expect(result).toEqual([])
  })

  it('returns empty array on network error', async () => {
    mockAuthFetch.mockRejectedValueOnce(new Error('Timeout'))

    const result = await fetchKagentiProviderAgents()
    expect(result).toEqual([])
  })

  it('returns empty array when agents field is missing', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response)

    const result = await fetchKagentiProviderAgents()
    expect(result).toEqual([])
  })
})

describe('kagentiProviderCallTool', () => {
  it('calls a tool and returns result', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ result: 'tool output' }),
    } as Response)

    const result = await kagentiProviderCallTool('agent-1', 'default', 'search', { query: 'kubernetes' })
    expect(result).toEqual({ result: 'tool output' })
  })

  it('throws on HTTP error', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    await expect(
      kagentiProviderCallTool('agent-1', 'default', 'search', {})
    ).rejects.toThrow('Tool call failed: HTTP 500')
  })

  it('sends correct request body', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response)

    await kagentiProviderCallTool('myAgent', 'myNs', 'myTool', { key: 'value' })

    const callBody = JSON.parse(mockAuthFetch.mock.calls[0][1]?.body as string)
    expect(callBody.agent).toBe('myAgent')
    expect(callBody.namespace).toBe('myNs')
    expect(callBody.tool).toBe('myTool')
    expect(callBody.args).toEqual({ key: 'value' })
  })
})

describe('kagentiProviderChat', () => {
  it('calls onError when response is not ok', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
    } as Response)

    const onChunk = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()

    await kagentiProviderChat('agent1', 'ns1', 'hello', { onChunk, onDone, onError })
    expect(onError).toHaveBeenCalledWith('Chat failed: HTTP 502')
    expect(onChunk).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('calls onError when no response body stream', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      body: null,
    } as unknown as Response)

    const onChunk = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()

    await kagentiProviderChat('agent1', 'ns1', 'hello', { onChunk, onDone, onError })
    expect(onError).toHaveBeenCalledWith('No response stream')
  })

  it('processes SSE chunks and calls onDone when [DONE] received', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: chunk1\n\ndata: chunk2\n\ndata: [DONE]\n\n'))
        controller.close()
      },
    })

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      body: stream,
    } as unknown as Response)

    const onChunk = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()

    await kagentiProviderChat('agent1', 'ns1', 'hello', { onChunk, onDone, onError })
    expect(onChunk).toHaveBeenCalledWith('chunk1')
    expect(onChunk).toHaveBeenCalledWith('chunk2')
    expect(onDone).toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('calls onDone when stream ends without [DONE]', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: chunk1\n\n'))
        controller.close()
      },
    })

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      body: stream,
    } as unknown as Response)

    const onChunk = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()

    await kagentiProviderChat('agent1', 'ns1', 'hello', { onChunk, onDone, onError })
    expect(onChunk).toHaveBeenCalledWith('chunk1')
    expect(onDone).toHaveBeenCalled()
  })

  it('silently ignores AbortError', async () => {
    mockAuthFetch.mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'))

    const onChunk = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()

    await kagentiProviderChat('agent1', 'ns1', 'hello', { onChunk, onDone, onError })
    expect(onError).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('calls onError with message for non-abort errors', async () => {
    mockAuthFetch.mockRejectedValueOnce(new Error('Connection reset'))

    const onChunk = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()

    await kagentiProviderChat('agent1', 'ns1', 'hello', { onChunk, onDone, onError })
    expect(onError).toHaveBeenCalledWith('Connection reset')
  })

  it('sends contextId when provided', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    } as Response)

    const onChunk = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()

    await kagentiProviderChat('agent1', 'ns1', 'hello', { contextId: 'ctx-123', onChunk, onDone, onError })

    const callBody = JSON.parse(mockAuthFetch.mock.calls[0][1]?.body as string)
    expect(callBody.contextId).toBe('ctx-123')
  })
})
