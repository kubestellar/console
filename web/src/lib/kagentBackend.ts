import { authFetch } from './api'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

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

export async function fetchKagentStatus(): Promise<KagentStatus> {
  try {
    const resp = await authFetch(`${API_BASE}/api/kagent/status`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!resp.ok) return { available: false, reason: `HTTP ${resp.status}` }
    return resp.json()
  } catch {
    return { available: false, reason: 'unreachable' }
  }
}

export async function fetchKagentAgents(): Promise<KagentAgent[]> {
  try {
    const resp = await authFetch(`${API_BASE}/api/kagent/agents`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!resp.ok) return []
    const data = await resp.json()
    return data.agents || []
  } catch {
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
    const resp = await authFetch(`${API_BASE}/api/kagent/chat`, {
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
    signal: AbortSignal.timeout(30000),
  })
  if (!resp.ok) throw new Error(`Tool call failed: HTTP ${resp.status}`)
  return resp.json()
}
