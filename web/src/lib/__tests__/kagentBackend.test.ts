import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock authFetch
vi.mock('../api', () => ({
  authFetch: vi.fn(),
}))

import {
  fetchKagentStatus,
  fetchKagentAgents,
  kagentChat,
  kagentCallTool,
} from '../kagentBackend'
import { authFetch } from '../api'

const mockAuthFetch = vi.mocked(authFetch)

describe('fetchKagentStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns status when endpoint is reachable', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ available: true, url: 'http://kagent:8080' }),
    } as Response)

    const result = await fetchKagentStatus()
    expect(result.available).toBe(true)
    expect(result.url).toBe('http://kagent:8080')
  })

  it('returns unavailable when HTTP error', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    } as Response)

    const result = await fetchKagentStatus()
    expect(result.available).toBe(false)
    expect(result.reason).toBe('HTTP 503')
  })

  it('returns unavailable when network error', async () => {
    mockAuthFetch.mockRejectedValueOnce(new Error('Network error'))

    const result = await fetchKagentStatus()
    expect(result.available).toBe(false)
    expect(result.reason).toBe('unreachable')
  })

  it('rethrows AbortError so callers can cancel polling cleanly', async () => {
    mockAuthFetch.mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'))

    await expect(fetchKagentStatus()).rejects.toThrow('The operation was aborted')
  })
})

describe('fetchKagentAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns agents list', async () => {
    const agents = [
      { name: 'agent-1', namespace: 'default', description: 'Test agent' },
    ]
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ agents }),
    } as Response)

    const result = await fetchKagentAgents()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('agent-1')
  })

  it('returns empty array when HTTP error', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response)

    const result = await fetchKagentAgents()
    expect(result).toEqual([])
  })

  it('returns empty array when network error', async () => {
    mockAuthFetch.mockRejectedValueOnce(new Error('Timeout'))

    const result = await fetchKagentAgents()
    expect(result).toEqual([])
  })

  it('returns empty array when agents field is missing', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response)

    const result = await fetchKagentAgents()
    expect(result).toEqual([])
  })
})

describe('kagentChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('streams chat messages via SSE', async () => {
    const chunks: string[] = []
    let done = false

    // Create a readable stream that emits SSE data
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: Hello\n\n'))
        controller.enqueue(encoder.encode('data: World\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      body: stream,
    } as unknown as Response)

    await kagentChat('agent-1', 'default', 'Hello', {
      onChunk: (text) => { chunks.push(text) },
      onDone: () => { done = true },
      onError: () => {},
    })

    expect(chunks).toEqual(['Hello', 'World'])
    expect(done).toBe(true)
  })

  it('calls onError when HTTP response is not ok', async () => {
    let errorMsg = ''
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    await kagentChat('agent-1', 'default', 'Hello', {
      onChunk: () => {},
      onDone: () => {},
      onError: (error) => { errorMsg = error },
    })

    expect(errorMsg).toContain('HTTP 500')
  })

  it('calls onError when no response stream', async () => {
    let errorMsg = ''
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      body: null,
    } as unknown as Response)

    await kagentChat('agent-1', 'default', 'Hello', {
      onChunk: () => {},
      onDone: () => {},
      onError: (error) => { errorMsg = error },
    })

    expect(errorMsg).toBe('No response stream')
  })

  it('calls onDone when stream ends without [DONE] marker', async () => {
    let done = false
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: Some text\n\n'))
        controller.close()
      },
    })

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      body: stream,
    } as unknown as Response)

    await kagentChat('agent-1', 'default', 'Hello', {
      onChunk: () => {},
      onDone: () => { done = true },
      onError: () => {},
    })

    expect(done).toBe(true)
  })

  it('silently ignores AbortError', async () => {
    let errorCalled = false
    const abortError = new DOMException('Aborted', 'AbortError')
    mockAuthFetch.mockRejectedValueOnce(abortError)

    await kagentChat('agent-1', 'default', 'Hello', {
      onChunk: () => {},
      onDone: () => {},
      onError: () => { errorCalled = true },
    })

    expect(errorCalled).toBe(false)
  })

  it('calls onError for non-abort errors', async () => {
    let errorMsg = ''
    mockAuthFetch.mockRejectedValueOnce(new Error('Network failure'))

    await kagentChat('agent-1', 'default', 'Hello', {
      onChunk: () => {},
      onDone: () => {},
      onError: (error) => { errorMsg = error },
    })

    expect(errorMsg).toBe('Network failure')
  })

  it('sends correct request body', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      body: stream,
    } as unknown as Response)

    await kagentChat('my-agent', 'kube-system', 'Explain pods', {
      contextId: 'ctx-123',
      onChunk: () => {},
      onDone: () => {},
      onError: () => {},
    })

    const callBody = JSON.parse(mockAuthFetch.mock.calls[0][1]?.body as string)
    expect(callBody.agent).toBe('my-agent')
    expect(callBody.namespace).toBe('kube-system')
    expect(callBody.message).toBe('Explain pods')
    expect(callBody.contextId).toBe('ctx-123')
  })
})

describe('kagentCallTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls tool and returns result', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ result: 'tool output' }),
    } as Response)

    const result = await kagentCallTool('agent-1', 'default', 'get_pods', { namespace: 'kube-system' })
    expect(result).toEqual({ result: 'tool output' })
  })

  it('throws on HTTP error', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response)

    await expect(
      kagentCallTool('agent-1', 'default', 'get_pods', {})
    ).rejects.toThrow('HTTP 404')
  })

  it('sends correct request body', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response)

    await kagentCallTool('my-agent', 'ns', 'my_tool', { key: 'value' })

    const callBody = JSON.parse(mockAuthFetch.mock.calls[0][1]?.body as string)
    expect(callBody.agent).toBe('my-agent')
    expect(callBody.namespace).toBe('ns')
    expect(callBody.tool).toBe('my_tool')
    expect(callBody.args).toEqual({ key: 'value' })
  })
})
