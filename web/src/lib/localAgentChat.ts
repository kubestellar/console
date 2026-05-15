import { LOCAL_AGENT_WS_URL } from './constants'
import { appendWsAuthToken } from './utils/wsAuth'

export interface LocalAgentChatOptions {
  agent?: string
  sessionId?: string
  signal?: AbortSignal
  onChunk: (text: string) => void
  onDone: () => void
  onError: (error: string) => void
}

export async function localAgentChat(prompt: string, options: LocalAgentChatOptions): Promise<void> {
  const requestId = `stellar-chat-${crypto.randomUUID()}`
  const sessionId = options.sessionId || `stellar-${crypto.randomUUID()}`
  let settled = false
  let opened = false
  let hasStreamedContent = false
  let ws: WebSocket | null = null

  const settle = (handler: () => void) => {
    if (settled) return
    settled = true
    handler()
  }

  const handleAbort = () => {
    settle(() => {
      ws?.close()
    })
  }

  try {
    ws = new WebSocket(await appendWsAuthToken(LOCAL_AGENT_WS_URL))
  } catch {
    options.onError('Could not connect to local agent.')
    return
  }

  if (options.signal) {
    if (options.signal.aborted) {
      handleAbort()
      return
    }
    options.signal.addEventListener('abort', handleAbort, { once: true })
  }

  ws.onopen = () => {
    opened = true
    ws?.send(JSON.stringify({
      id: requestId,
      type: 'chat',
      payload: {
        prompt,
        sessionId,
        agent: options.agent || undefined,
      },
    }))
  }

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data) as { type?: string; payload?: Record<string, unknown> }
      const payload = (message.payload || {}) as { content?: string; output?: string; done?: boolean; message?: string }

      if (message.type === 'stream') {
        if (typeof payload.content === 'string' && payload.content.length > 0) {
          hasStreamedContent = true
          options.onChunk(payload.content)
        }
        if (payload.done === true) {
          settle(() => {
            ws?.close()
            options.onDone()
          })
        }
        return
      }

      if (message.type === 'result') {
        const finalContent =
          typeof payload.content === 'string' ? payload.content
            : typeof payload.output === 'string' ? payload.output
              : ''
        if (!hasStreamedContent && finalContent.length > 0) {
          options.onChunk(finalContent)
        }
        settle(() => {
          ws?.close()
          options.onDone()
        })
        return
      }

      if (message.type === 'error') {
        const errorMessage = typeof payload.message === 'string' && payload.message.length > 0
          ? payload.message
          : 'Local agent request failed.'
        settle(() => {
          ws?.close()
          options.onError(errorMessage)
        })
      }
    } catch {
      // Ignore malformed frames and continue listening.
    }
  }

  ws.onerror = () => {
    settle(() => {
      ws?.close()
      if (opened) {
        options.onError('Lost connection to local agent.')
      } else {
        options.onError('Could not connect to local agent.')
      }
    })
  }

  ws.onclose = () => {
    settle(() => {
      if (opened) {
        options.onError('Local agent stream closed before completion.')
      } else {
        options.onError('Could not connect to local agent.')
      }
    })
  }
}
