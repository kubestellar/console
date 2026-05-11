import ReactMarkdown from 'react-markdown'

interface MessageMeta {
  model: string
  tokens: number
  provider: string
  durationMs: number
}

interface Msg {
  id: string
  role: 'user' | 'stellar'
  content: string
  loading?: boolean
  watchCreated?: boolean
  watchId?: string
  meta?: MessageMeta
}

export function MessageBubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{ fontSize: 10, color: 'var(--s-text-dim)', fontFamily: 'var(--s-mono)', marginBottom: 3, letterSpacing: '0.04em' }}>
        {isUser ? 'you' : '● stellar'}
      </div>
      <div style={{ maxWidth: '93%', background: isUser ? 'var(--s-surface-2)' : 'transparent', border: isUser ? '1px solid var(--s-border-muted)' : 'none', borderRadius: 'var(--s-r)', padding: isUser ? '8px 10px' : '2px 0', fontSize: 13, color: 'var(--s-text)', lineHeight: 1.6 }}>
        {msg.loading ? (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '4px 0' }}>
            {[0, 1, 2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--s-brand)', animation: `s-pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}
          </div>
        ) : isUser ? (
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</div>
        ) : (
          <div className="stellar-markdown">
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          </div>
        )}
      </div>
      {msg.watchCreated && (
        <div style={{
          marginTop: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 11,
          color: 'var(--s-info)',
        }}>
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--s-info)',
            boxShadow: '0 0 0 2px rgba(56,139,253,0.2)',
            animation: 's-pulse 2s ease-in-out infinite',
          }} />
          Stellar is watching this. Updates will appear in the sidebar.
        </div>
      )}
      {msg.meta && (
        <div style={{ fontSize: 10, color: 'var(--s-text-dim)', marginTop: 3, fontFamily: 'var(--s-mono)' }}>
          {msg.meta.provider} · {msg.meta.model} · {msg.meta.tokens} tok · {msg.meta.durationMs}ms
        </div>
      )}
    </div>
  )
}
