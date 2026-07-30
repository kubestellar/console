import { lazy, Suspense } from 'react'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

const ReactMarkdown = lazy(() => import('react-markdown'))

const MESSAGE_BUBBLE_CONTAINER_FLEX_STYLE = { display: 'flex', flexDirection: 'column' as const }
const MESSAGE_BUBBLE_LABEL_STYLE = { color: 'var(--s-text-dim)', fontFamily: 'var(--s-mono)', letterSpacing: '0.04em' }
const MESSAGE_BUBBLE_USER_STYLE = { maxWidth: '93%', background: 'var(--s-surface-2)', border: '1px solid var(--s-border-muted)', borderRadius: 'var(--s-r)', fontSize: 13, color: 'var(--s-text)', lineHeight: 1.6 }
const MESSAGE_BUBBLE_STELLAR_STYLE = { maxWidth: '93%', background: 'transparent', border: 'none', fontSize: 13, color: 'var(--s-text)', lineHeight: 1.6 }
const MESSAGE_BUBBLE_LOADING_DOT_STYLE = { width: 5, height: 5, borderRadius: '50%', background: 'var(--s-brand)' }
const MESSAGE_BUBBLE_TEXT_STYLE = { whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const }
const MESSAGE_BUBBLE_WATCH_INFO_STYLE = { color: 'var(--s-info)' }
const MESSAGE_BUBBLE_WATCH_INDICATOR_STYLE = { width: 6, height: 6, borderRadius: '50%', background: 'var(--s-info)', boxShadow: '0 0 0 2px rgba(56,139,253,0.2)', animation: 's-pulse 2s ease-in-out infinite' }
const MESSAGE_BUBBLE_META_STYLE = { color: 'var(--s-text-dim)', fontFamily: 'var(--s-mono)' }

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
    <div style={{ ...MESSAGE_BUBBLE_CONTAINER_FLEX_STYLE, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
      <div className="mb-1 text-[10px]" style={MESSAGE_BUBBLE_LABEL_STYLE}>
        {isUser ? 'you' : '● stellar'}
      </div>
      <div className={isUser ? 'px-2.5 py-2' : 'py-0.5'} style={isUser ? MESSAGE_BUBBLE_USER_STYLE : MESSAGE_BUBBLE_STELLAR_STYLE}>
        {msg.loading ? (
          <div className="flex items-center gap-1 py-1">
            {[0, 1, 2].map(i => <div key={i} style={{ ...MESSAGE_BUBBLE_LOADING_DOT_STYLE, animation: `s-pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}
          </div>
        ) : isUser ? (
          <div style={MESSAGE_BUBBLE_TEXT_STYLE}>{msg.content}</div>
        ) : (
          <div className="stellar-markdown">
            <Suspense fallback={<div style={MESSAGE_BUBBLE_TEXT_STYLE}>{msg.content}</div>}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSanitize]}
              >
                {msg.content}
              </ReactMarkdown>
            </Suspense>
          </div>
        )}
      </div>
      {msg.watchCreated && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px]" style={MESSAGE_BUBBLE_WATCH_INFO_STYLE}>
          <div style={MESSAGE_BUBBLE_WATCH_INDICATOR_STYLE} />
          Stellar is watching this. Updates will appear in the sidebar.
        </div>
      )}
      {msg.meta && (
        <div className="mt-1 text-[10px]" style={MESSAGE_BUBBLE_META_STYLE}>
          {msg.meta.provider} · {msg.meta.model} · {msg.meta.tokens} tok · {msg.meta.durationMs}ms
        </div>
      )}
    </div>
  )
}
