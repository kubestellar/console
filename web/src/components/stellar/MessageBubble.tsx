import { lazy, Suspense } from 'react'

const ReactMarkdown = lazy(() => import('react-markdown'))

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
      <div className="mb-1 text-[10px]" style={{ color: 'var(--s-text-dim)', fontFamily: 'var(--s-mono)', letterSpacing: '0.04em' }}>
        {isUser ? 'you' : '● stellar'}
      </div>
      <div className={isUser ? 'px-2.5 py-2' : 'py-0.5'} style={{ maxWidth: '93%', background: isUser ? 'var(--s-surface-2)' : 'transparent', border: isUser ? '1px solid var(--s-border-muted)' : 'none', borderRadius: 'var(--s-r)', fontSize: 13, color: 'var(--s-text)', lineHeight: 1.6 }}>
        {msg.loading ? (
          <div className="flex items-center gap-1 py-1">
            {[0, 1, 2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--s-brand)', animation: `s-pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}
          </div>
        ) : isUser ? (
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</div>
        ) : (
          <div className="stellar-markdown">
            <Suspense fallback={<div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</div>}>
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </Suspense>
          </div>
        )}
      </div>
      {msg.watchCreated && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--s-info)' }}>
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
        <div className="mt-1 text-[10px]" style={{ color: 'var(--s-text-dim)', fontFamily: 'var(--s-mono)' }}>
          {msg.meta.provider} · {msg.meta.model} · {msg.meta.tokens} tok · {msg.meta.durationMs}ms
        </div>
      )}
    </div>
  )
}
