/**
 * NightlyReleasePulse — mirrors the NightlyE2EStatus card UX:
 * colored run dots with hover popups, trend indicator, clickable
 * GitHub links, newest run leftmost. Drop-in for CI/CD dashboard.
 *
 * Data: /api/github-pipelines?view=pulse
 */
import { useState, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckCircle, XCircle, AlertTriangle, Clock, ExternalLink,
  TrendingUp, TrendingDown, Minus, Loader2,
} from 'lucide-react'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { useCardLoadingState } from '../CardDataContext'
import { usePipelinePulse } from '../../../hooks/useGitHubPipelines'
import { cn } from '../../../lib/cn'

/** Max dots to render per row (matches NightlyE2EStatus's 7, but we have room for 14) */
const MAX_DOTS = 14
/** ms before hiding the hover popup after mouse leaves */
const POPUP_HIDE_DELAY_MS = 200
/** Minimum pass-rate delta between halves to flag a trend (avoids noise on flat data) */
const TREND_THRESHOLD = 0.1

// Nightly release workflow link — used when the user hasn't selected a specific run
const WORKFLOW_URL = 'https://github.com/kubestellar/console/actions/workflows/release.yml'

function formatCron(cron: string): string {
  const parts = cron.trim().split(/\s+/)
  if (parts.length === 5 && parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
    const minute = parseInt(parts[0], 10)
    const hourUtc = parseInt(parts[1], 10)
    if (!isNaN(minute) && !isNaN(hourUtc)) {
      const now = new Date()
      const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, minute))
      return `${utc.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} daily`
    }
  }
  return cron
}

function formatTimeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ---------------------------------------------------------------------------
// RunDot — colored dot with hover popup (mirrors NightlyE2EStatus.RunDot)
// ---------------------------------------------------------------------------

interface RunInfo {
  conclusion: string | null
  createdAt: string
  htmlUrl: string
}

function conclusionColor(c: string | null): string {
  if (!c || c === 'in_progress') return 'bg-blue-400'
  if (c === 'success') return 'bg-green-400'
  if (c === 'failure' || c === 'timed_out') return 'bg-red-400'
  if (c === 'cancelled') return 'bg-gray-500 dark:bg-gray-400'
  return 'bg-yellow-400'
}

function conclusionTextColor(c: string | null): string {
  if (!c || c === 'in_progress') return 'text-blue-400'
  if (c === 'success') return 'text-green-400'
  if (c === 'failure' || c === 'timed_out') return 'text-red-400'
  return 'text-muted-foreground'
}

function conclusionLabel(c: string | null): string {
  if (!c || c === 'in_progress') return 'running'
  if (c === 'success') return 'passed'
  return c
}

function RunDot({ run }: { run: RunInfo }) {
  const [showPopup, setShowPopup] = useState(false)
  const dotRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null)

  const isRunning = !run.conclusion || run.conclusion === 'in_progress'

  function handleEnter() {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    if (dotRef.current) {
      const rect = dotRef.current.getBoundingClientRect()
      setPopupPos({ top: rect.top - 4, left: rect.left + rect.width / 2 })
    }
    setShowPopup(true)
  }

  function handleLeave() {
    hideTimer.current = setTimeout(() => setShowPopup(false), POPUP_HIDE_DELAY_MS)
  }

  return (
    <div
      ref={dotRef}
      className="group relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <a
        href={run.htmlUrl !== '#' ? run.htmlUrl : undefined}
        target="_blank"
        rel="noopener noreferrer"
      >
        <div className={cn(
          'w-3 h-3 rounded-full transition-all',
          conclusionColor(run.conclusion),
          isRunning && 'animate-pulse',
          'group-hover:ring-2 group-hover:ring-white/30',
        )} />
      </a>
      {showPopup && popupPos && createPortal(
        <div
          className="fixed z-dropdown"
          style={{ top: popupPos.top, left: popupPos.left, transform: 'translate(-50%, -100%)' }}
          onMouseEnter={() => { if (hideTimer.current) clearTimeout(hideTimer.current) }}
          onMouseLeave={handleLeave}
        >
          <div className="mb-1.5 bg-secondary border border-border rounded-lg shadow-xl px-2.5 py-1.5 text-2xs whitespace-nowrap">
            <div className="text-foreground">
              <span className={conclusionTextColor(run.conclusion)}>{conclusionLabel(run.conclusion)}</span>
              {' '}&middot; {formatTimeAgo(run.createdAt)}
              {' '}&middot; {run.createdAt.slice(0, 10)}
            </div>
            {run.htmlUrl !== '#' && (
              <a
                href={run.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 flex items-center gap-0.5 mt-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                View on GitHub <ExternalLink size={8} />
              </a>
            )}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-border" />
        </div>,
        document.body
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TrendIndicator (same as NightlyE2EStatus)
// ---------------------------------------------------------------------------

function TrendIndicator({ passRate, trend }: { passRate: number; trend: 'up' | 'down' | 'steady' }) {
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const color = passRate === 100
    ? 'text-green-400'
    : passRate >= 70
      ? 'text-yellow-400'
      : 'text-red-400'
  return (
    <div className={cn('flex items-center gap-1', color)}>
      <Icon size={12} />
      <span className="text-xs font-mono">{passRate}%</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export function NightlyReleasePulse() {
  const { data, isLoading, error, refetch } = usePipelinePulse()
  const { isDemoMode } = useDemoMode()
  const hasData = !!data?.lastRun
  useCardLoadingState({ isLoading: isLoading && !hasData, hasAnyData: hasData, isDemoData: isDemoMode })

  const { passRate, trend } = useMemo(() => {
    if (!data?.recent?.length) return { passRate: 0, trend: 'steady' as const }
    const total = data.recent.length
    const successes = data.recent.filter((r) => r.conclusion === 'success').length
    const rate = Math.round((successes / total) * 100)
    const mid = Math.floor(total / 2)
    const first = data.recent.slice(0, mid)
    const second = data.recent.slice(mid)
    const firstRate = first.length ? first.filter((r) => r.conclusion === 'success').length / first.length : 0
    const secondRate = second.length ? second.filter((r) => r.conclusion === 'success').length / second.length : 0
    const t: 'up' | 'down' | 'steady' =
      secondRate > firstRate + TREND_THRESHOLD ? 'down' // second half is older = trend worsening
        : secondRate < firstRate - TREND_THRESHOLD ? 'up' // first half (newest) is better
        : 'steady'
    return { passRate: rate, trend: t }
  }, [data])

  if (error && !hasData) {
    return (
      <div className="p-4 h-full flex items-center justify-center text-sm text-red-400">
        Failed to load release pulse. {error}
      </div>
    )
  }

  const { lastRun, recent, nextCron, streak, streakKind } = data

  const StatusIcon = !lastRun ? AlertTriangle
    : lastRun.conclusion === 'success' ? CheckCircle
    : lastRun.conclusion === 'failure' || lastRun.conclusion === 'timed_out' ? XCircle
    : lastRun.conclusion === null ? Loader2
    : AlertTriangle
  const iconColor = !lastRun ? 'text-muted-foreground'
    : lastRun.conclusion === 'success' ? 'text-green-400'
    : lastRun.conclusion === 'failure' || lastRun.conclusion === 'timed_out' ? 'text-red-400'
    : lastRun.conclusion === null ? 'text-blue-400 animate-spin'
    : 'text-yellow-400'

  return (
    <div className="p-4 h-full flex flex-col gap-3">
      {/* Header: release tag + link */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusIcon size={18} className={cn('shrink-0', iconColor)} />
            <span className="text-base font-semibold text-foreground truncate">
              {lastRun?.releaseTag ?? 'No release yet'}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
            {lastRun && (
              <>
                <span>{formatTimeAgo(lastRun.createdAt)}</span>
                <span>&middot;</span>
                <span className="capitalize">{lastRun.conclusion ?? 'running'}</span>
                <span>&middot;</span>
                <span>run #{lastRun.runNumber}</span>
              </>
            )}
          </div>
        </div>
        <a
          href={WORKFLOW_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0"
        >
          <ExternalLink size={12} />
        </a>
      </div>

      {/* Stats row: streak, next, pass rate */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-secondary/30 px-3 py-2">
          <div className="text-[11px] text-muted-foreground">Streak</div>
          <div className={cn(
            'text-sm font-medium mt-0.5',
            streakKind === 'success' && 'text-green-400',
            streakKind === 'failure' && 'text-red-400',
          )}>
            {streak === 0 ? '—' : `${streak}${streakKind === 'success' ? ' pass' : ' fail'}`}
          </div>
        </div>
        <div className="rounded-lg bg-secondary/30 px-3 py-2">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Clock size={10} /> Next
          </div>
          <div className="text-sm font-medium mt-0.5 text-foreground">{formatCron(nextCron)}</div>
        </div>
        <div className="rounded-lg bg-secondary/30 px-3 py-2">
          <div className="text-[11px] text-muted-foreground">Pass rate</div>
          <div className="mt-0.5">
            <TrendIndicator passRate={passRate} trend={trend} />
          </div>
        </div>
      </div>

      {/* Run dots row — mirrors NightlyE2EStatus GuideRow layout */}
      <div className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-secondary/30 transition-colors group">
        <StatusIcon size={14} className={cn('shrink-0', iconColor)} />
        <span className="text-xs text-foreground w-14 shrink-0 font-medium">Release</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {(recent || []).slice(0, MAX_DOTS).map((r, i) => (
            <RunDot key={`${r.createdAt}-${i}`} run={r} />
          ))}
          {Array.from({ length: Math.max(0, MAX_DOTS - (recent || []).length) }).map((_, i) => (
            <div key={`empty-${i}`} className="w-3 h-3 rounded-full bg-border/50" />
          ))}
        </div>
        <TrendIndicator passRate={passRate} trend={trend} />
        <a
          href={WORKFLOW_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-secondary"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={12} className="text-muted-foreground" />
        </a>
      </div>

      <button
        type="button"
        onClick={() => refetch()}
        className="mt-auto self-end text-[11px] text-muted-foreground hover:text-foreground"
      >
        Refresh
      </button>
    </div>
  )
}
