/**
 * RepoPicker
 *
 * Sticky header input for the /acmm dashboard. Lets the user enter any
 * owner/repo slug; validates format; offers a recent-repos dropdown and
 * a "Load Console example" button.
 */

import { useMemo, useRef, useState } from 'react'
import { RefreshCw, X, ExternalLink, AlertCircle, Award, Copy, Check } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { cn } from '../../lib/cn'
import { useACMM, DEFAULT_REPO } from './ACMMProvider'
import { ALL_CRITERIA } from '../../lib/acmm/sources'

const REPO_RE = /^[\w.-]+\/[\w.-]+$/
const BADGE_SITE = 'https://console.kubestellar.io'
const COPIED_FEEDBACK_MS = 1500

export function RepoPicker() {
  const { repo, setRepo, recentRepos, scan } = useACMM()
  const [input, setInput] = useState(repo)
  const [error, setError] = useState<string | null>(null)
  const [showBadge, setShowBadge] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const badgeEndpoint = `${BADGE_SITE}/api/acmm/badge?repo=${encodeURIComponent(repo)}`
  const badgeImg = `https://img.shields.io/endpoint?url=${encodeURIComponent(badgeEndpoint)}`
  const badgeHref = `${BADGE_SITE}/acmm?repo=${encodeURIComponent(repo)}`
  const badgeMarkdown = `[![ACMM](${badgeImg})](${badgeHref})`
  const badgeHtml = `<a href="${badgeHref}"><img src="${badgeImg}" alt="ACMM" /></a>`

  function copy(text: string, tag: string) {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(tag)
        setTimeout(() => setCopied(null), COPIED_FEEDBACK_MS)
      },
      () => {
        // ignore clipboard failures
      },
    )
  }

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
            <Input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="owner/repo"
              inputSize="md"
              className={cn('font-mono', input && 'pr-8')}
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
            onClick={() => setShowBadge((v) => !v)}
            title="Get a README badge for this repo's ACMM level"
          >
            <Award className="w-3.5 h-3.5 mr-1" />
            Get badge
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => scan.forceRefetch()}
            disabled={scan.isLoading || scan.isRefreshing}
            title="Re-scan current repo (bypasses server cache)"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${scan.isRefreshing ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>
      </div>

      {showBadge && (
        <div className="max-w-screen-2xl mx-auto px-6 pb-3 space-y-2 text-xs">
          <div className="flex items-center gap-3 pt-1">
            <img src={badgeImg} alt="ACMM badge preview" className="h-5" />
            <span className="text-muted-foreground">
              Preview for <code className="font-mono">{repo}</code>
            </span>
            <button
              type="button"
              onClick={() => setShowBadge(false)}
              className="ml-auto text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-muted-foreground">Markdown</span>
              <button
                type="button"
                onClick={() => copy(badgeMarkdown, 'md')}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/30 hover:bg-muted/50"
              >
                {copied === 'md' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                {copied === 'md' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <code className="block font-mono bg-background/60 px-2 py-1 rounded text-[10px] break-all">
              {badgeMarkdown}
            </code>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-muted-foreground">HTML</span>
              <button
                type="button"
                onClick={() => copy(badgeHtml, 'html')}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/30 hover:bg-muted/50"
              >
                {copied === 'html' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                {copied === 'html' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <code className="block font-mono bg-background/60 px-2 py-1 rounded text-[10px] break-all">
              {badgeHtml}
            </code>
          </div>
          <div className="text-muted-foreground text-[10px]">
            Links back to the ACMM dashboard loaded with <code className="font-mono">{repo}</code>. Shields.io caches for ~5 minutes; use the refresh icon to force an in-dashboard re-scan.
          </div>
        </div>
      )}

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
