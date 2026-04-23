/**
 * RepoPicker
 *
 * Sticky header input for the /acmm dashboard. Lets the user enter any
 * owner/repo slug; validates format; offers a recent-repos dropdown and
 * a "Load Console example" button.
 */

import { useMemo, useRef, useState } from 'react'
import { RefreshCw, X, ExternalLink, AlertCircle, Award, Copy, Check, Share2, Info } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { cn } from '../../lib/cn'
import { useACMM, DEFAULT_REPO, normalizeRepoInput } from './ACMMProvider'
import { ALL_CRITERIA } from '../../lib/acmm/sources'
import { useToast } from '../ui/Toast'

/** ACMM-source criteria only — used for the badge preview to match the
 *  shields.io badge endpoint which counts only ACMM criteria, not criteria
 *  from other sources (fullsend, agentic-engineering-framework, etc.). */
const ACMM_CRITERIA = ALL_CRITERIA.filter((c) => c.source === 'acmm')
const ACMM_CRITERIA_IDS = new Set(ACMM_CRITERIA.map((c) => c.id))

const REPO_RE = /^[\w.-]+\/[\w.-]+$/
const BADGE_SITE = 'https://console.kubestellar.io'
const COPIED_FEEDBACK_MS = 1500

/** Max width for the repo-input form on wide viewports. A GitHub slug
 *  like `owner/repo` is typically 20-40 chars; capping here keeps the
 *  sticky header from stretching into a messy unplanned-looking bar
 *  on 1536px+ displays (issue #8857). */
const REPO_FORM_MAX_WIDTH_PX = 560
/** Minimum width for the repo-input form so the input + Scan button
 *  don't collapse below usability on narrow viewports. */
const REPO_FORM_MIN_WIDTH_PX = 300

/** Hex equivalents of the shields.io named colors used in acmm-badge.mts
 *  LEVEL_COLORS (lightgrey, yellow, yellowgreen, brightgreen, blueviolet).
 *  Hex values are needed here because the inline badge SVG preview renders
 *  via CSS backgroundColor, not the shields.io color resolver. */
const BADGE_COLORS: Record<number, string> = {
  1: '#9e9e9e',   // lightgrey  // ai-quality-ignore
  2: '#dfb317',   // yellow     // ai-quality-ignore
  3: '#97ca00',   // yellowgreen // ai-quality-ignore
  4: '#44cc11',   // brightgreen // ai-quality-ignore
  5: '#7b64ff',   // blueviolet  // ai-quality-ignore
}

/** Locally-rendered badge preview — mirrors the shields.io two-tone pill
 *  so the preview is instant and doesn't depend on an external service. */
function BadgePreview({ level, levelName, detected, total }: {
  level: number
  levelName: string
  detected: number
  total: number
}) {
  const rightColor = BADGE_COLORS[level] ?? BADGE_COLORS[1]
  return (
    <span className="inline-flex items-stretch text-[11px] font-medium leading-none rounded overflow-hidden shadow-xs h-5">
      <span className="px-1.5 flex items-center bg-neutral-600 text-white">ACMM</span>
      <span
        className="px-1.5 flex items-center text-white"
        style={{ backgroundColor: rightColor }}
      >
        L{level} · {levelName} · {detected}/{total}
      </span>
    </span>
  )
}

export function RepoPicker() {
  const { repo, setRepo, recentRepos, scan, openIntro } = useACMM()
  const { showToast } = useToast()
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
    // Accept either bare owner/name or any common GitHub URL — normalize
    // first, then validate. Reflects the cleaned slug back into the input
    // so the user sees what got sent.
    const normalized = normalizeRepoInput(next)
    if (!normalized) {
      setError('Enter a repo as owner/name or a github.com URL')
      return
    }
    if (!REPO_RE.test(normalized)) {
      setError('Invalid format — use owner/name or a github.com URL')
      return
    }
    setError(null)
    if (normalized !== next) setInput(normalized)
    setRepo(normalized)
    showToast(`Scanning ${normalized}`, 'success')
  }

  const detected = scan.data.detectedIds?.length ?? 0
  const totalCriteria = useMemo(() => ALL_CRITERIA.length, [])

  /** ACMM-only counts for the badge preview — the shields.io endpoint only
   *  counts ACMM criteria (per ACMM_IDS_BY_LEVEL), not other sources. */
  const acmmDetected = useMemo(
    () => (scan.data.detectedIds ?? []).filter((id) => ACMM_CRITERIA_IDS.has(id)).length,
    [scan.data.detectedIds],
  )
  const acmmTotal = useMemo(() => ACMM_CRITERIA.length, [])
  const scannedLabel = scan.data.scannedAt
    ? new Date(scan.data.scannedAt).toLocaleTimeString()
    : '—'

  return (
    // Issue 8857 — the `border-b` used to live on this outer sticky wrapper,
    // which stretched the divider edge-to-edge across the viewport while the
    // inner content was capped at `max-w-(--breakpoint-2xl) mx-auto px-6`. On wide
    // screens that produced a full-width bar that didn't align with anything
    // else on the page ("messy and unplanned"). The divider now sits on the
    // last inner container so it aligns with the page content width.
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xs">
      <div className="max-w-(--breakpoint-2xl) mx-auto px-6 pt-2 pb-0">
        <button
          type="button"
          onClick={openIntro}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          title="Re-open the ACMM intro"
        >
          <Info className="w-3 h-3" />
          What is ACMM?
        </button>
      </div>
      <div className="max-w-(--breakpoint-2xl) mx-auto px-6 py-3 flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit(input)
          }}
          className="flex items-center gap-2 flex-1"
          style={{
            minWidth: `${REPO_FORM_MIN_WIDTH_PX}px`,
            maxWidth: `${REPO_FORM_MAX_WIDTH_PX}px`,
          }}
        >
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="owner/repo or https://github.com/owner/repo"
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
            onClick={() => copy(`${BADGE_SITE}/acmm?repo=${encodeURIComponent(repo)}`, 'share')}
            title={`Copy a shareable link to this scan: ${BADGE_SITE}/acmm?repo=${repo}`}
          >
            {copied === 'share' ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1 text-green-400" />
                Copied
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 mr-1" />
                Share
              </>
            )}
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
        <div className="max-w-(--breakpoint-2xl) mx-auto px-6 pb-3 space-y-2 text-xs">
          <div className="flex items-center gap-3 pt-1">
            <BadgePreview
              level={scan.level.level}
              levelName={scan.level.levelName}
              detected={acmmDetected}
              total={acmmTotal}
            />
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

      {/* Info bar (issue #8977): removed the bottom border that bled through
          as an underline beneath the inline text (e.g. "request timed out").
          The sticky wrapper's backdrop-blur-sm + bg-background/95 already give
          enough visual separation from the scrollable page content. */}
      <div className="max-w-(--breakpoint-2xl) mx-auto px-6 pb-2 text-xs text-muted-foreground">
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
