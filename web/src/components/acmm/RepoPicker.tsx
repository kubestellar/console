/**
 * RepoPicker
 *
 * Sticky header input for the /acmm dashboard. Lets the user enter any
 * owner/repo slug; validates format; offers a recent-repos dropdown and
 * a "Load Console example" button.
 */

import { useMemo, useRef, useState } from 'react'
import { RefreshCw, X, ExternalLink, AlertCircle } from 'lucide-react'
import { Button } from '../ui/Button'
import { useACMM, DEFAULT_REPO } from './ACMMProvider'
import { ALL_CRITERIA } from '../../lib/acmm/sources'

const REPO_RE = /^[\w.-]+\/[\w.-]+$/

export function RepoPicker() {
  const { repo, setRepo, recentRepos, scan } = useACMM()
  const [input, setInput] = useState(repo)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function submit(next: string) {
    const trimmed = next.trim()
    if (!trimmed) {
      setError('Enter a repo in owner/name format')
      return
    }
    if (!REPO_RE.test(trimmed)) {
      setError('Invalid format — use owner/name')
      return
    }
    setError(null)
    setRepo(trimmed)
  }

  const detected = scan.data.detectedIds?.length ?? 0
  const totalCriteria = useMemo(() => ALL_CRITERIA.length, [])
  const scannedLabel = scan.data.scannedAt
    ? new Date(scan.data.scannedAt).toLocaleTimeString()
    : '—'

  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="max-w-screen-2xl mx-auto px-6 py-3 flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit(input)
          }}
          className="flex items-center gap-2 flex-1 min-w-[300px]"
        >
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="owner/repo"
              className="w-full px-3 py-2 pr-8 rounded-md bg-secondary/50 border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
              list="acmm-recent-repos"
              aria-label="GitHub repository"
            />
            {input && (
              <button
                type="button"
                onClick={() => {
                  setInput('')
                  setError(null)
                  inputRef.current?.focus()
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <datalist id="acmm-recent-repos">
              {recentRepos.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          <Button type="submit" variant="primary" size="sm">
            Scan
          </Button>
        </form>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setInput(DEFAULT_REPO)
              submit(DEFAULT_REPO)
            }}
            title="Load the paper's case study"
          >
            <ExternalLink className="w-3.5 h-3.5 mr-1" />
            Load Console example
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => scan.refetch()}
            disabled={scan.isLoading || scan.isRefreshing}
            title="Re-scan current repo"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${scan.isRefreshing ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 pb-2 text-xs text-muted-foreground">
        {error ? (
          <div className="flex items-center gap-1.5 text-red-400">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{error}</span>
          </div>
        ) : scan.error ? (
          <div className="flex items-center gap-1.5 text-yellow-400">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{scan.error}</span>
          </div>
        ) : (
          <div>
            Scanned {scannedLabel} · {detected}/{totalCriteria} criteria detected · L{scan.level.level} ({scan.level.levelName})
          </div>
        )}
      </div>
    </div>
  )
}
