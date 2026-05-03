import { authFetch } from './api'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

// Timeout for kagenti provider status and agent list queries
const KAGENTI_STATUS_TIMEOUT_MS = 5_000
// Timeout for tool invocation through kagenti provider
const KAGENTI_TOOL_CALL_TIMEOUT_MS = 30_000

export interface KagentiProviderAgent {
  name: string
  namespace: string
  description?: string
  framework?: string
  tools?: string[]
}

export interface KagentiProviderStatus {
  available: boolean
  url?: string
  reason?: string
}

export async function fetchKagentiProviderStatus(): Promise<KagentiProviderStatus> {
  try {
    const resp = await authFetch(`${API_BASE}/api/kagenti-provider/status`, {
      signal: AbortSignal.timeout(KAGENTI_STATUS_TIMEOUT_MS),
    })
    if (!resp.ok) return { available: false, reason: `HTTP ${resp.status}` }
    return resp.json()
  } catch {
    return { available: false, reason: 'unreachable' }
  }
}

export async function fetchKagentiProviderAgents(): Promise<KagentiProviderAgent[]> {
  try {
    const resp = await authFetch(`${API_BASE}/api/kagenti-provider/agents`, {
      signal: AbortSignal.timeout(KAGENTI_STATUS_TIMEOUT_MS),
    })
    if (!resp.ok) return []
    const data = await resp.json()
    return data.agents || []
  } catch {
    return []
  }
}

/**
 * Send a chat message to a kagenti agent via SSE streaming.
 * Calls onChunk with each text chunk, onDone when complete.
 */
export async function kagentiProviderChat(
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
    const resp = await authFetch(`${API_BASE}/api/kagenti-provider/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent,
        namespace,
        message,
        contextId: options.contextId,
      }),
      signal: options.signal,
    })

    if (!resp.ok) {
      options.onError(`Chat failed: HTTP ${resp.status}`)
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
 * Call a tool through a kagenti agent.
 */
export async function kagentiProviderCallTool(
  agent: string,
  namespace: string,
  tool: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const resp = await authFetch(`${API_BASE}/api/kagenti-provider/tools/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent, namespace, tool, args }),
    signal: AbortSignal.timeout(KAGENTI_TOOL_CALL_TIMEOUT_MS),
  })
  if (!resp.ok) throw new Error(`Tool call failed: HTTP ${resp.status}`)
  return resp.json()
}
