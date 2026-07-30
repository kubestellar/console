import { useCallback, useEffect, useRef, useState } from 'react'
import { stellarApi } from '../../services/stellar'
import { MessageBubble } from './MessageBubble'
import { ProviderSelector } from './ProviderSelector'
import type { ProviderSession, StellarObservation } from '../../types/stellar'
import { TextArea } from '../ui/TextArea'
import { localAgentChat } from '../../lib/localAgentChat'
import { ProactiveNudge } from './ProactiveNudge'
import { CatchUpBanner } from './CatchUpBanner'
import type { CatchUpState } from '../../hooks/useStellar'
import type { PendingAction } from './EventCard'

interface Msg {
  id: string
  role: 'user' | 'stellar'
  content: string
  ts: Date
  loading?: boolean
  watchCreated?: boolean
  watchId?: string
  meta?: { model: string; tokens: number; provider: string; durationMs: number }
  suggestedTask?: string
}

const WELCOME: Msg = {
  id: 'welcome',
  role: 'stellar',
  content: 'Watching your clusters. Ask me anything.',
  ts: new Date(),
}

export function ChatPanel({
  providerSession,
  onProviderChange,
  nudge,
  onDismissNudge,
  catchUp,
  onDismissCatchUp,
  initialInput,
  onInputConsumed,
  pendingAction,
  onActionConsumed,
  createTask,
}: {
  providerSession: ProviderSession | null
  onProviderChange: (session: ProviderSession | null) => void
  nudge: StellarObservation | null
  onDismissNudge: () => void
  catchUp: CatchUpState | null
  onDismissCatchUp: () => void
  initialInput?: string
  onInputConsumed?: () => void
  pendingAction?: PendingAction | null
  onActionConsumed?: () => void
  createTask: (title: string, description?: string, source?: string) => Promise<unknown>
}) {
  const [msgs, setMsgs] = useState<Msg[]>([WELCOME])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [localPendingAction, setLocalPendingAction] = useState<PendingAction | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Consume initialInput (e.g. rollback prompt pre-filled from EventCard)
  useEffect(() => {
    if (initialInput) {
      setInput(initialInput)
      onInputConsumed?.()
      textRef.current?.focus()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInput])

  // Consume pendingAction — store locally until user sends or clears
  useEffect(() => {
    if (pendingAction) {
      setLocalPendingAction(pendingAction)
      onActionConsumed?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction])

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  const send = useCallback(async () => {
    const prompt = input.trim()
    if (!prompt || busy) return
    const actionToExecute = localPendingAction
    setInput('')
    setBusy(true)
    setLocalPendingAction(null)
    const userMsg: Msg = { id: crypto.randomUUID(), role: 'user', content: prompt, ts: new Date() }
    const loadMsg: Msg = { id: crypto.randomUUID(), role: 'stellar', content: '', ts: new Date(), loading: true }
    setMsgs(prev => [...prev, userMsg, loadMsg])
    try {
      if (actionToExecute) {
        const startTime = Date.now()
        const result = await stellarApi.executeAction({
          actionType: actionToExecute.actionType,
          cluster: actionToExecute.cluster,
          namespace: actionToExecute.namespace,
          name: actionToExecute.name,
          description: prompt,
          prompt,
        })
        const durationMs = Date.now() - startTime
        const prefix = result.status === 'failed' ? '⚠ ' : '✓ '
        setMsgs(prev => prev.map(message => (message.loading ? {
          ...message,
          content: prefix + result.outcome,
          loading: false,
          meta: {
            model: result.model || 'action-executor',
            tokens: 0,
            provider: result.provider || 'native',
            durationMs: result.duration || durationMs,
          },
        } : message)))
      } else if (providerSession?.isCli) {
        abortControllerRef.current = new AbortController()
        let accumulated = ''
        const start = Date.now()
        await new Promise<void>((resolve, reject) => {
          void localAgentChat(prompt, {
            agent: providerSession.provider,
            signal: abortControllerRef.current?.signal,
            onChunk: (chunk) => {
              accumulated += chunk
              setMsgs(prev => prev.map(m => m.loading ? { ...m, content: accumulated } : m))
            },
            onDone: () => {
              const durationMs = Date.now() - start
              const suggestedTask = extractSuggestedTask(accumulated)
              setMsgs(prev => prev.map(m => m.loading ? {
                ...m,
                content: accumulated,
                loading: false,
                meta: { model: 'cli', tokens: 0, provider: providerSession.provider, durationMs },
                suggestedTask,
              } : m))
              resolve()
            },
            onError: (err) => reject(new Error(err)),
          })
        })
      } else {
        // Build history from current messages (exclude welcome and loading states)
        const history = msgs
          .filter(m => m.id !== 'welcome' && !m.loading && m.content.trim())
          .slice(-10) // last 10 turns max
          .map(m => ({
            role: m.role === 'user' ? 'user' as const : 'assistant' as const,
            content: m.content,
          }))

        const response = await stellarApi.ask({
          prompt,
          provider: providerSession?.provider || '',
          model: providerSession?.model || '',
          history,
        })
        setMsgs(prev => prev.map(message => (message.loading ? {
          ...message,
          content: response.answer,
          loading: false,
          watchCreated: response.watchCreated,
          watchId: response.watchId,
          suggestedTask: extractSuggestedTask(response.answer),
          meta: {
            model: response.model,
            tokens: response.tokens,
            provider: response.provider,
            durationMs: response.durationMs,
          },
        } : message)))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed'
      setMsgs(prev => prev.map(item => item.loading ? { ...item, content: `Error: ${message}`, loading: false } : item))
    } finally {
      setBusy(false)
      abortControllerRef.current = null
      textRef.current?.focus()
    }
  }, [busy, input, localPendingAction, msgs, providerSession?.model, providerSession?.provider, providerSession?.isCli])

  const handleKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="flex items-center gap-1.5 px-3 py-2" style={{
        flexShrink: 0,
        borderBottom: '1px solid var(--s-border)',
      }}>
        <span
          className="font-mono text-xs"
          style={{
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--s-text-muted)',
          }}
        >
          Chat
        </span>
        <div style={{ flex: 1 }} />
        <ProviderSelector session={providerSession} onSelect={onProviderChange} />
        <button className="text-xs" onClick={() => setMsgs([WELCOME])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s-text-dim)' }}>clear</button>
      </div>

      <div
        className="s-scroll flex min-h-0 flex-1 flex-col gap-3 px-2.5 pb-1 pt-2.5"
        style={{
          overflowY: 'auto',
        }}
      >
        {catchUp && (
          <CatchUpBanner catchUp={catchUp} onDismiss={onDismissCatchUp} />
        )}
        {nudge && (
          <ProactiveNudge
            nudge={nudge}
            onDismiss={onDismissNudge}
            onApplySuggestion={(suggest) => {
              setInput(suggest)
              onDismissNudge()
              textRef.current?.focus()
            }}
          />
        )}
        {msgs.map(msg => (
          <div key={msg.id}>
            <MessageBubble msg={msg} />
            {msg.suggestedTask && (
              <div className="-mt-2 pl-2">
                <button
                  className="mt-1 px-2 py-0.5 text-xs"
                  onClick={() => { void createTask(msg.suggestedTask || '', `From Stellar chat message ${msg.id}`, 'stellar') }}
                  style={{
                    background: 'none',
                    border: '1px solid var(--s-border)',
                    borderRadius: 'var(--s-rs)',
                    color: 'var(--s-text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  + Log as task
                </button>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-2.5 py-2" style={{ flexShrink: 0, borderTop: '1px solid var(--s-border)' }}>
        {localPendingAction && (
          <div
            className="mb-1.5 flex items-center gap-1.5 px-2 py-1 text-xs"
            style={{
              background: 'rgba(227,179,65,0.1)',
              border: '1px solid rgba(227,179,65,0.3)',
              borderRadius: 'var(--s-rs)',
              color: 'var(--s-warning)',
            }}
          >
            <span>⚡ Will execute: {localPendingAction.actionType} on {localPendingAction.namespace}/{localPendingAction.name} ({localPendingAction.cluster})</span>
            <button
              className="text-xs"
              onClick={() => setLocalPendingAction(null)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s-text-dim)' }}
              title="Cancel — send as chat instead"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex items-end gap-1.5 px-2.5 py-2" style={{
          background: 'var(--s-surface-2)',
          border: '1px solid var(--s-border)',
          borderRadius: 'var(--s-r)',
        }}>
          <TextArea
            ref={textRef}
            className="font-sans text-sm"
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask Stellar..."
            rows={1}
            disabled={busy}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--s-text)',
              resize: 'none',
              lineHeight: 1.4,
              maxHeight: 100,
              overflowY: 'auto',
              opacity: busy ? 0.6 : 1,
            }}
          />
          <button
            className="px-2.5 py-1 text-sm"
            onClick={() => { void send() }}
            disabled={!input.trim() || busy}
            style={{
              background: input.trim() && !busy ? 'var(--s-brand)' : 'var(--s-surface)',
              color: input.trim() && !busy ? 'var(--s-brand-foreground)' : 'var(--s-text-dim)',
              border: 'none',
              borderRadius: 'var(--s-rs)',
              fontWeight: 700,
              cursor: input.trim() && !busy ? 'pointer' : 'default',
              flexShrink: 0,
              transition: 'all var(--s-t)',
            }}
          >
            {busy ? '···' : '↑'}
          </button>
        </div>
        <div className="mt-1 pl-0.5 text-xs" style={{ color: 'var(--s-text-dim)' }}>
          Enter to send · Shift+Enter for newline
        </div>
      </div>
    </div>
  )
}

function extractSuggestedTask(answer: string): string | undefined {
  const normalized = (answer || '').trim()
  if (!normalized) {
    return undefined
  }
  const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean)
  const candidate = lines.find(line => /^(I recommend|You should|Consider)\b/i.test(line))
  if (!candidate) {
    return undefined
  }
  return candidate.replace(/^[•*-]\s*/, '').replace(/\.$/, '')
}
