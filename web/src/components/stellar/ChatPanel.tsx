import { useCallback, useEffect, useRef, useState } from 'react'
import { stellarApi } from '../../services/stellar'

interface Msg {
  id: string
  role: 'user' | 'stellar'
  content: string
  ts: Date
  loading?: boolean
  meta?: { model: string; tokens: number; provider: string; durationMs: number }
}

const WELCOME: Msg = {
  id: 'welcome',
  role: 'stellar',
  content: 'Watching your clusters. Ask me anything.',
  ts: new Date(),
}

export function ChatPanel() {
  const [msgs, setMsgs] = useState<Msg[]>([WELCOME])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  const send = useCallback(async () => {
    const prompt = input.trim()
    if (!prompt || busy) return
    setInput('')
    setBusy(true)
    const userMsg: Msg = { id: crypto.randomUUID(), role: 'user', content: prompt, ts: new Date() }
    const loadMsg: Msg = { id: crypto.randomUUID(), role: 'stellar', content: '', ts: new Date(), loading: true }
    setMsgs(prev => [...prev, userMsg, loadMsg])
    try {
      const response = await stellarApi.ask({ prompt })
      setMsgs(prev => prev.map(message => (message.loading ? {
        ...message,
        content: response.answer,
        loading: false,
        meta: {
          model: response.model,
          tokens: response.tokens,
          provider: response.provider,
          durationMs: response.durationMs,
        },
      } : message)))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed'
      setMsgs(prev => prev.map(item => item.loading ? { ...item, content: `Error: ${message}`, loading: false } : item))
    } finally {
      setBusy(false)
      textRef.current?.focus()
    }
  }, [busy, input])

  const handleKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 12px',
        flexShrink: 0,
        borderBottom: '1px solid var(--s-border)',
      }}>
        <span style={{
          fontFamily: 'var(--s-mono)',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--s-text-muted)',
        }}>
          Chat
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setMsgs([WELCOME])}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--s-text-dim)' }}
        >
          clear
        </button>
      </div>

      <div
        className="s-scroll"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px 10px 4px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minHeight: 0,
        }}
      >
        {msgs.map(msg => <MsgBubble key={msg.id} msg={msg} />)}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: '8px 10px', flexShrink: 0, borderTop: '1px solid var(--s-border)' }}>
        <div style={{
          display: 'flex',
          gap: 6,
          alignItems: 'flex-end',
          background: 'var(--s-surface-2)',
          border: '1px solid var(--s-border)',
          borderRadius: 'var(--s-r)',
          padding: '7px 10px',
        }}>
          <textarea
            ref={textRef}
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
              fontSize: 13,
              fontFamily: 'var(--s-sans)',
              resize: 'none',
              lineHeight: 1.4,
              maxHeight: 100,
              overflowY: 'auto',
              opacity: busy ? 0.6 : 1,
            }}
          />
          <button
            onClick={() => { void send() }}
            disabled={!input.trim() || busy}
            style={{
              background: input.trim() && !busy ? 'var(--s-brand)' : 'var(--s-surface)',
              color: input.trim() && !busy ? '#0a0e14' : 'var(--s-text-dim)',
              border: 'none',
              borderRadius: 'var(--s-rs)',
              padding: '4px 10px',
              fontSize: 13,
              fontWeight: 700,
              cursor: input.trim() && !busy ? 'pointer' : 'default',
              flexShrink: 0,
              transition: 'all var(--s-t)',
            }}
          >
            {busy ? '···' : '↑'}
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--s-text-dim)', marginTop: 4, paddingLeft: 2 }}>
          Enter to send · Shift+Enter for newline
        </div>
      </div>
    </div>
  )
}

function MsgBubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{
        fontSize: 10,
        color: 'var(--s-text-dim)',
        fontFamily: 'var(--s-mono)',
        marginBottom: 3,
        letterSpacing: '0.04em',
      }}>
        {isUser ? 'you' : '● stellar'}
      </div>

      <div style={{
        maxWidth: '93%',
        background: isUser ? 'var(--s-surface-2)' : 'transparent',
        border: isUser ? '1px solid var(--s-border-muted)' : 'none',
        borderRadius: isUser ? 'var(--s-r) var(--s-rs) var(--s-r) var(--s-r)' : 'var(--s-rs) var(--s-r) var(--s-r) var(--s-r)',
        padding: isUser ? '8px 10px' : '2px 0',
        fontSize: 13,
        color: 'var(--s-text)',
        lineHeight: 1.6,
      }}>
        {msg.loading ? (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '4px 0' }}>
            {[0, 1, 2].map(i => (
              <div
                key={i}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: 'var(--s-brand)',
                  animation: `s-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
        ) : (
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {msg.content}
          </div>
        )}
      </div>

      {msg.meta && (
        <div style={{
          fontSize: 10,
          color: 'var(--s-text-dim)',
          marginTop: 3,
          fontFamily: 'var(--s-mono)',
        }}>
          {msg.meta.provider} · {msg.meta.model} · {msg.meta.tokens} tok · {msg.meta.durationMs}ms
        </div>
      )}
    </div>
  )
}
