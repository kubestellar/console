import { authFetch } from './api'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

// Timeout for kagenti provider status and agent list queries
const KAGENTI_STATUS_TIMEOUT_MS = 5_000
// Timeout for tool invocation through kagenti provider
const KAGENTI_TOOL_CALL_TIMEOUT_MS = 30_000

export interface SSEDecodeState {
  remainder: string
  pendingDataLines: string[]
}

export function createSSEDecodeState(): SSEDecodeState {
  return {
    remainder: '',
    pendingDataLines: [],
  }
}

function normalizeSSEDataLine(line: string): string {
  const raw = line.slice('data:'.length)
  return raw.startsWith(' ') ? raw.slice(1) : raw
}

export function consumeSSEChunk(chunk: string, state: SSEDecodeState): string[] {
  state.remainder += chunk
  const lines = state.remainder.split('\n')
  state.remainder = lines.pop() || ''
  const events: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (line === '') {
      if (state.pendingDataLines.length > 0) {
        events.push(state.pendingDataLines.join('\n'))
        state.pendingDataLines = []
      }
      continue
    }

    if (line.startsWith('data:')) {
      state.pendingDataLines.push(normalizeSSEDataLine(line))
    }
  }

  return events
}

export function flushSSEDecodeState(state: SSEDecodeState): string[] {
  if (state.remainder.startsWith('data:')) {
    state.pendingDataLines.push(normalizeSSEDataLine(state.remainder))
    state.remainder = ''
  }

  if (state.pendingDataLines.length === 0) return []

  const events = [state.pendingDataLines.join('\n')]
  state.pendingDataLines = []
  return events
}

export interface KagentiProviderAgent {
  name: string
  namespace: string
  description?: string
  framework?: string
  tools?: string[]
}

export type KagentiLLMProvider = 'gemini' | 'anthropic' | 'openai'

export interface KagentiProviderStatus {
  available: boolean
  url?: string
  reason?: string
  llm_provider?: KagentiLLMProvider
  api_key_configured?: boolean
  configured_providers?: KagentiLLMProvider[]
  config_supported?: boolean
  config_reason?: string
}

export interface KagentiProviderConfigStatus {
  llm_provider?: KagentiLLMProvider
  api_key_configured?: boolean
  configured_providers?: KagentiLLMProvider[]
}

export interface FetchKagentiProviderAgentsOptions {
  signal?: AbortSignal
  throwOnUnavailable?: boolean
}

export type KagentiProviderAgentDiscoveryResult =
  | { ok: true; agent: KagentiProviderAgent }
  | { ok: false; reason: 'provider_unreachable' | 'no_agents_discovered'; detail?: string }

function getRequestSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
}

export async function fetchKagentiProviderStatus(options: { signal?: AbortSignal } = {}): Promise<KagentiProviderStatus> {
  try {
    const resp = await authFetch(`${API_BASE}/api/kagenti-provider/status`, {
      signal: getRequestSignal(KAGENTI_STATUS_TIMEOUT_MS, options.signal),
    })
    if (!resp.ok) return { available: false, reason: `HTTP ${resp.status}` }
    return resp.json()
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    return { available: false, reason: 'unreachable' }
  }
}

export async function fetchKagentiProviderAgents(options: FetchKagentiProviderAgentsOptions = {}): Promise<KagentiProviderAgent[]> {
  try {
    const resp = await authFetch(`${API_BASE}/api/kagenti-provider/agents`, {
      signal: getRequestSignal(KAGENTI_STATUS_TIMEOUT_MS, options.signal),
    })
    if (!resp.ok) {
      if (options.throwOnUnavailable) {
        throw new Error(`HTTP ${resp.status}`)
      }
      return []
    }
    const data = await resp.json()
    return data.agents || []
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    if (options.throwOnUnavailable) {
      throw error instanceof Error ? error : new Error(String(error))
    }
    return []
  }
}

export async function discoverKagentiProviderAgent(options: { signal?: AbortSignal } = {}): Promise<KagentiProviderAgentDiscoveryResult> {
  const status = await fetchKagentiProviderStatus(options)
  if (!status.available) {
    return {
      ok: false,
      reason: 'provider_unreachable',
      detail: status.reason,
    }
  }

  try {
    const agents = await fetchKagentiProviderAgents({ ...options, throwOnUnavailable: true })
    const discoveredAgent = agents[0]
    if (!discoveredAgent) {
      return {
        ok: false,
        reason: 'no_agents_discovered',
      }
    }

    return {
      ok: true,
      agent: discoveredAgent,
    }
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    return {
      ok: false,
      reason: 'provider_unreachable',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function updateKagentiProviderConfig(payload: {
  llm_provider: KagentiLLMProvider
  api_key?: string
}): Promise<KagentiProviderConfigStatus> {
  const resp = await authFetch(`${API_BASE}/api/kagenti-provider/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(KAGENTI_STATUS_TIMEOUT_MS),
  })

  if (!resp.ok) {
    let message = `HTTP ${resp.status}`
    try {
      const data = await resp.json()
      if (typeof data?.error === 'string' && data.error.length > 0) {
        message = data.error
      }
    } catch {
      // Ignore invalid JSON errors and fall back to the HTTP status.
    }
    throw new Error(message)
  }

  return resp.json()
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
    const decodeState = createSSEDecodeState()

    const handleEvents = (events: string[]): boolean => {
      for (const data of events) {
        if (data === '[DONE]') {
          options.onDone()
          return true
        }
        options.onChunk(data)
      }
      return false
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const events = consumeSSEChunk(decoder.decode(value, { stream: true }), decodeState)
      if (handleEvents(events)) return
    }

    const finalEvents = flushSSEDecodeState(decodeState)
    if (handleEvents(finalEvents)) return

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
