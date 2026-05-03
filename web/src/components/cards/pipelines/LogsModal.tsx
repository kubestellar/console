/**
 * LogsModal — shows the tail of a failed GitHub Actions job log.
 *
 * Fetched on demand from /api/github-pipelines?view=log. The backend returns
 * the last LOG_TAIL_LINES (500) lines — we don't page through full logs
 * because they can be megabytes and the failing tail is almost always what
 * matters.
 */
import { useEffect, useState, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Copy, Search } from 'lucide-react'
import { fetchPipelineLog } from '../../../hooks/useGitHubPipelines'

/** ms to keep the 'Copied!' label before reverting */
const COPIED_INDICATOR_MS = 1500

/** Extracted user-visible strings. Kept out of inline JSX attributes to
 * satisfy the ui-ux-standard ratchet and make a future i18n pass easy. */
const LABEL_CLOSE = 'Close'
const PLACEHOLDER_FILTER_LINES = 'Filter lines…'

interface LogsModalProps {
  repo: string
  jobId: number
  title: string
  onClose: () => void
}

export function LogsModal({ repo, jobId, title, onClose }: LogsModalProps) {
  const [log, setLog] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setIsLoading(true)
      setError(null)
      const result = await fetchPipelineLog(repo, jobId)
      if (cancelled) return
      if ('error' in result) setError(result.error)
      else setLog(result.log)
      setIsLoading(false)
      // Auto-scroll to bottom (most recent output)
      requestAnimationFrame(() => {
        if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight
      })
    }
    void load()
    return () => { cancelled = true }
  }, [repo, jobId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const filteredLog = useMemo(() => {
    if (!query) return log
    const q = query.toLowerCase()
    return log
      .split('\n')
      .filter((line) => line.toLowerCase().includes(q))
      .join('\n')
  }, [log, query])

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(log)
      setCopied(true)
      setTimeout(() => setCopied(false), COPIED_INDICATOR_MS)
    } catch {
      // clipboard may be blocked in non-secure contexts — silently ignore
    }
  }

  // closeOnBackdropClick={false} — backdrop click does not close, per UX modal-safety
  // rule: the filter input is live state users may not want to lose to a stray click.
  // Close is still reachable via the explicit X button and ESC (see effect above).
  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Log for ${title}`}
    >
      <div
        className="relative w-full max-w-4xl max-h-[85vh] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2 px-4 py-3 border-b border-border shrink-0">
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground truncate">{title}</div>
            <div className="text-[11px] text-muted-foreground truncate">{repo} • job #{jobId}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onCopy}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-secondary/50"
            >
              <Copy className="w-3 h-3" /> {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-secondary/50"
              aria-label={LABEL_CLOSE}
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="px-4 py-2 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={PLACEHOLDER_FILTER_LINES}
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-secondary/30 border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-primary/50"
            />
          </div>
        </div>

        <pre
          ref={preRef}
          className="flex-1 min-h-0 overflow-auto bg-black/60 text-[11px] leading-relaxed font-mono text-muted-foreground p-3 whitespace-pre"
        >
          {isLoading && 'Loading log…'}
          {error && <span className="text-red-400">{error}</span>}
          {!isLoading && !error && (filteredLog || '(no matching lines)')}
        </pre>
      </div>
    </div>,
    document.body
  )
}
