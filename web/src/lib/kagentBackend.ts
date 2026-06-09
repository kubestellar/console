import { authFetch } from './api'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
const KAGENT_STATUS_ENDPOINT = '/api/kagent/status'
const KAGENT_STATUS_TIMEOUT_MS = 5_000
const KAGENT_TOOL_CALL_TIMEOUT_MS = 30_000

interface FetchKagentStatusOptions {
  signal?: AbortSignal
  timeoutMs?: number
  throwOnError?: boolean
}

export interface KagentAgent {
  name: string
  namespace: string
  description?: string
  framework?: string
  tools?: string[]
}

export interface KagentStatus {
  available: boolean
  url?: string
  reason?: string
}

interface ChatStreamResponse {
  response: Response
  endpoint: string
}

function getRequestSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
}

async function getErrorReason(resp: Response): Promise<string> {
  try {
    const body = (await resp.text()).trim()
    return body ? `HTTP ${resp.status}: ${body}` : `HTTP ${resp.status}`
  } catch {
    return `HTTP ${resp.status}`
  }
}

export async function fetchKagentStatus(options: FetchKagentStatusOptions = {}): Promise<KagentStatus> {
  const timeoutMs = options.timeoutMs ?? KAGENT_STATUS_TIMEOUT_MS
  try {
    const resp = await authFetch(`${API_BASE}${KAGENT_STATUS_ENDPOINT}`, {
      signal: getRequestSignal(timeoutMs, options.signal),
    })
    if (!resp.ok) {
      const reason = await getErrorReason(resp)
      if (options.throwOnError) {
        throw new Error(reason)
      }
      return { available: false, reason: `HTTP ${resp.status}` }
    }
    try {
      return await resp.json()
    } catch {
      const reason = 'invalid JSON response'
      if (options.throwOnError) {
        throw new Error(reason)
      }
      return { available: false, reason }
    }
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (options.throwOnError) {
        throw new Error(`Request timeout after ${timeoutMs / 1000}s: ${KAGENT_STATUS_ENDPOINT}: ${error instanceof Error ? error.message : String(error)}`)
      }
      throw error
    }
    if (options.throwOnError) {
      throw error instanceof Error ? error : new Error('unreachable')
    }
    return { available: false, reason: 'unreachable' }
  }
}

export async function fetchKagentAgents(options: { signal?: AbortSignal } = {}): Promise<KagentAgent[]> {
  try {
    const resp = await authFetch(`${API_BASE}/api/kagent/agents`, {
      signal: getRequestSignal(KAGENT_STATUS_TIMEOUT_MS, options.signal),
    })
    if (!resp.ok) return []
    try {
      const data = await resp.json()
      return data.agents || []
    } catch {
      return []
    }
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    return []
  }
}

/**
 * Send a chat message to a kagent agent via SSE streaming.
 * Calls onChunk with each text chunk, onDone when complete.
 */
export async function kagentChat(
  agent: string,
  namespace: string,
  message: string,
  options: {
    contextId?: string
    onChunk: (text: string) => void
    onDone: () => void
    onError: (error: string) => void
    signal?: AbortSignal
  }
): Promise<void> {
  try {
    const payload = JSON.stringify({
      agent,
      namespace,
      message,
      contextId: options.contextId,
    })
    const tryChat = async (endpoint: string): Promise<ChatStreamResponse> => {
      const response = await authFetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: options.signal,
      })
      return { response, endpoint }
    }

    let { response: resp, endpoint } = await tryChat('/api/kagent/chat')
    // Fallback to kagenti-provider when kagent is not configured.
    if (resp.status === 503) {
      const fallback = await tryChat('/api/kagenti-provider/chat')
      if (fallback.response.ok) {
        resp = fallback.response
        endpoint = fallback.endpoint
      }
    }

    if (!resp.ok) {
      options.onError(`Chat failed (${endpoint}): HTTP ${resp.status}`)
      return
    }

    const reader = resp.body?.getReader()
    if (!reader) {
      options.onError('No response stream')
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') {
            options.onDone()
            return
          }
          options.onChunk(data)
        }
      }
    }

    // Stream ended without [DONE]
    options.onDone()
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    options.onError(err instanceof Error ? err.message : 'Unknown error')
  }
}

/**
 * Call a tool through a kagent agent.
 */
export async function kagentCallTool(
  agent: string,
  namespace: string,
  tool: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const resp = await authFetch(`${API_BASE}/api/kagent/tools/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent, namespace, tool, args }),
    signal: AbortSignal.timeout(KAGENT_TOOL_CALL_TIMEOUT_MS),
  })
  if (!resp.ok) throw new Error(`Tool call failed: HTTP ${resp.status}`)
  return resp.json()
}
