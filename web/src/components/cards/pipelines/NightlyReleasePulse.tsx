/**
 * NightlyReleasePulse — NightlyE2E-style card showing per-workflow
 * run dots with hover popups, trend indicators, and clickable links.
 *
 * Multi-repo aware:
 * - On /ci-cd (inside PipelineFilterProvider): reads shared selection,
 *   shows one row per workflow per selected repo.
 * - On other dashboards (no provider): shows an input to type owner/repo.
 *
 * Uses the matrix view for per-workflow dot rows (already has per-repo
 * per-workflow history) and the pulse view for the hero header.
 */
import { useState, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckCircle, XCircle, AlertTriangle, Clock, ExternalLink,
  TrendingUp, TrendingDown, Minus, Loader2, Search, Stethoscope,
  ClipboardCheck,
} from 'lucide-react'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { useCardLoadingState } from '../CardDataContext'
import {
  usePipelinePulse,
  usePipelineMatrix,
  type MatrixWorkflow,
  type Conclusion,
} from '../../../hooks/useGitHubPipelines'
import { usePipelineFilter } from './PipelineFilterContext'
import { formatTimeAgo } from '../../../lib/formatters'
import { usePipelineData } from './PipelineDataContext'
import { RepoSubtitle } from './RepoSubtitle'
import { EmbedButton } from './EmbedButton'
import { useMissions } from '../../../hooks/useMissions'
import { cn } from '../../../lib/cn'

/** Max dots per row */
const MAX_DOTS = 14
/** ms before hiding hover popup */
const POPUP_HIDE_DELAY_MS = 200
/** Minimum pass-rate delta to flag a trend */
const TREND_THRESHOLD = 0.1
/** Matrix days for dot rows */
const MATRIX_DAYS = 14

const WORKFLOW_URL_BASE = 'https://github.com'
const TITLE_DIAGNOSE = 'Diagnose with AI'
const TITLE_AUDIT = 'Audit workflow'

/** Extracted strings for ui-ux ratchet */
const PLACEHOLDER_REPO = 'owner/repo'
const LABEL_SET_REPO = 'Set repo to monitor'
const STANDARD_CRON_FIELD_COUNT = 5

function formatCron(cron: string | undefined | null): string {
  if (!cron || typeof cron !== 'string') return '—'
  const parts = cron.trim().split(/\s+/)
  if (parts.length === STANDARD_CRON_FIELD_COUNT && parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
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


// ---------------------------------------------------------------------------
// RunDot — colored dot with hover popup
// ---------------------------------------------------------------------------

interface DotInfo {
  conclusion: Conclusion
  htmlUrl: string
  date: string
}

function dotColor(c: Conclusion): string {
  if (!c) return 'bg-border/50'
  if (c === 'success') return 'bg-green-400'
  if (c === 'failure' || c === 'timed_out') return 'bg-red-400'
  if (c === 'cancelled') return 'bg-gray-500 dark:bg-gray-400'
  if (c === 'action_required') return 'bg-yellow-400'
  return 'bg-yellow-400'
}

function dotTextColor(c: Conclusion): string {
  if (!c) return 'text-muted-foreground'
  if (c === 'success') return 'text-green-400'
  if (c === 'failure' || c === 'timed_out') return 'text-red-400'
  return 'text-muted-foreground'
}

function RunDot({ dot }: { dot: DotInfo }) {
  const [showPopup, setShowPopup] = useState(false)
  const dotRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null)
  const isEmpty = dot.conclusion === null

  function handleEnter() {
    if (isEmpty) return
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
    <>
      <div ref={dotRef} className="group relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        {dot.htmlUrl && dot.htmlUrl !== '#' && !isEmpty ? (
          <a href={dot.htmlUrl} target="_blank" rel="noopener noreferrer">
            <div className={cn('w-3 h-3 rounded-full transition-all', dotColor(dot.conclusion),
              'group-hover:ring-2 group-hover:ring-white/30')} />
          </a>
        ) : (
          <div className={cn('w-3 h-3 rounded-full', dotColor(dot.conclusion))} />
        )}
      </div>
      {showPopup && popupPos && createPortal(
        <div className="fixed z-dropdown" style={{ top: popupPos.top, left: popupPos.left, transform: 'translate(-50%, -100%)' }}
          onMouseEnter={() => { if (hideTimer.current) clearTimeout(hideTimer.current) }} onMouseLeave={handleLeave}>
          <div className="mb-1.5 bg-secondary border border-border rounded-lg shadow-xl px-2.5 py-1.5 text-2xs whitespace-nowrap">
            <div className="text-foreground">
              <span className={dotTextColor(dot.conclusion)}>{dot.conclusion ?? 'no run'}</span>
              {' '}&middot; {dot.date}
            </div>
            {dot.htmlUrl && dot.htmlUrl !== '#' && (
              <a href={dot.htmlUrl} target="_blank" rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 flex items-center gap-0.5 mt-0.5"
                onClick={(e) => e.stopPropagation()}>
                View on GitHub <ExternalLink size={8} />
              </a>
            )}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-border" />
        </div>,
        document.body
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// TrendIndicator + compute
// ---------------------------------------------------------------------------

function computeTrend(cells: DotInfo[]): { passRate: number; trend: 'up' | 'down' | 'steady' } {
  const with_ = cells.filter((c) => c.conclusion !== null)
  if (with_.length === 0) return { passRate: 0, trend: 'steady' }
  const successes = with_.filter((c) => c.conclusion === 'success').length
  const rate = Math.round((successes / with_.length) * 100)
  const mid = Math.floor(with_.length / 2)
  const first = with_.slice(0, mid)
  const second = with_.slice(mid)
  const fr = first.length ? first.filter((c) => c.conclusion === 'success').length / first.length : 0
  const sr = second.length ? second.filter((c) => c.conclusion === 'success').length / second.length : 0
  const t: 'up' | 'down' | 'steady' =
    fr > sr + TREND_THRESHOLD ? 'up' : fr < sr - TREND_THRESHOLD ? 'down' : 'steady'
  return { passRate: rate, trend: t }
}

function TrendIndicator({ passRate, trend }: { passRate: number; trend: 'up' | 'down' | 'steady' }) {
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const color = passRate === 100 ? 'text-green-400' : passRate >= 70 ? 'text-yellow-400' : 'text-red-400'
  return (
    <div className={cn('flex items-center gap-1', color)}>
      <Icon size={12} />
      <span className="text-xs font-mono">{passRate}%</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// WorkflowRow — one per workflow, newest-first dots
// ---------------------------------------------------------------------------

function WorkflowRow({ wf }: { wf: MatrixWorkflow }) {
  const { startMission } = useMissions()
  const dots: DotInfo[] = useMemo(() =>
    [...wf.cells].reverse().slice(0, MAX_DOTS).map((c) => ({
      conclusion: c.conclusion as Conclusion, htmlUrl: c.htmlUrl, date: c.date,
    })), [wf.cells])

  const { passRate, trend } = useMemo(() => computeTrend(dots), [dots])
  const latest = dots[0]?.conclusion
  const latestFailed = latest === 'failure' || latest === 'timed_out'
  const isInactive = latest === 'skipped' || latest === 'cancelled' || latest === null
  const StatusIcon = !latest ? AlertTriangle
    : latest === 'success' ? CheckCircle
    : latest === 'failure' || latest === 'timed_out' ? XCircle
    : AlertTriangle
  const iconColor = !latest ? 'text-muted-foreground'
    : latest === 'success' ? 'text-green-400'
    : latest === 'failure' || latest === 'timed_out' ? 'text-red-400'
    : 'text-yellow-400'
  const shortRepo = wf.repo.split('/')[1] ?? wf.repo

  return (
    <div className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-secondary/30 transition-colors group">
      <StatusIcon size={14} className={cn('shrink-0', iconColor)} />
      <div className="w-36 shrink-0 min-w-0">
        <div className="text-xs text-foreground font-medium truncate" title={wf.name}>{wf.name}</div>
        <div className="text-[10px] text-muted-foreground truncate">{shortRepo}</div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {dots.map((d, i) => <RunDot key={`${d.date}-${i}`} dot={d} />)}
        {Array.from({ length: Math.max(0, MAX_DOTS - dots.length) }).map((_, i) => (
          <div key={`empty-${i}`} className="w-3 h-3 rounded-full bg-border/50" />
        ))}
      </div>
      <TrendIndicator passRate={passRate} trend={trend} />
      {latestFailed && (
        <button
          type="button"
          onClick={() => startMission({
            title: `Diagnose: ${wf.name}`,
            description: `Diagnose failing workflow ${wf.name} on ${wf.repo}`,
            type: 'troubleshoot',
            initialPrompt: `Diagnose why the "${wf.name}" workflow failed on ${wf.repo}.\n\nRun URL: ${dots[0]?.htmlUrl ?? `${WORKFLOW_URL_BASE}/${wf.repo}/actions`}\n\nPlease:\n1. Check the workflow logs and identify the root cause.\n2. Tell me what went wrong, then ask:\n   - "Should I create a fix?"\n   - "Show me more details"\n3. If I say fix it, create a branch with the fix and open a PR.`,
          })}
          className="text-muted-foreground hover:text-blue-400 p-1 rounded hover:bg-blue-500/10"
          title={TITLE_DIAGNOSE}
        >
          <Stethoscope className="w-3 h-3" />
        </button>
      )}
      {isInactive && (
        <button
          type="button"
          onClick={() => startMission({
            title: `Audit: ${wf.name}`,
            description: `Audit inactive workflow ${wf.name} on ${wf.repo}`,
            type: 'analyze',
            initialPrompt: `Audit the "${wf.name}" workflow in ${wf.repo}.\n\nThis workflow is showing as ${latest || 'inactive'} in the CI/CD dashboard.\n\nPlease:\n1. Read the workflow YAML file (.github/workflows/) and check why it's ${latest || 'not running'}.\n2. Categorize it as one of:\n   - **Intentional**: deliberately disabled (if: false, workflow_dispatch only, etc.)\n   - **Broken**: has errors preventing it from running\n   - **Obsolete**: references removed features or old tooling\n   - **Misconfigured**: should run but conditions aren't met\n3. Tell me your finding, then ask:\n   - "Should I fix this workflow?"\n   - "Should I archive/delete it?"\n   - "Leave it as-is"`,
          })}
          className="text-muted-foreground hover:text-yellow-400 p-1 rounded hover:bg-yellow-500/10"
          title={TITLE_AUDIT}
        >
          <ClipboardCheck className="w-3 h-3" />
        </button>
      )}
      <a href={`${WORKFLOW_URL_BASE}/${wf.repo}/actions`} target="_blank" rel="noopener noreferrer"
        className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-secondary"
        onClick={(e) => e.stopPropagation()}>
        <ExternalLink size={12} className="text-muted-foreground" />
      </a>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Standalone repo input (when outside /ci-cd dashboard)
// ---------------------------------------------------------------------------

function StandaloneRepoInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
      <Search size={12} className="text-muted-foreground" />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={PLACEHOLDER_REPO}
        className="flex-1 text-xs bg-transparent text-foreground placeholder:text-muted-foreground/50 focus:outline-hidden"
        aria-label={LABEL_SET_REPO} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export function NightlyReleasePulse() {
  const { startMission } = useMissions()
  const shared = usePipelineFilter()
  const [standaloneRepo, setStandaloneRepo] = useState('')
  const effectiveRepoFilter = shared
    ? shared.repoFilter
    : standaloneRepo.includes('/') ? standaloneRepo.trim() : null

  // Prefer shared unified data from PipelineDataProvider (one fetch for all cards).
  // Fall back to individual fetches when rendered outside the CI/CD dashboard.
  const unifiedData = usePipelineData()
  const hasUnified = !!unifiedData
  const individualPulse = usePipelinePulse(effectiveRepoFilter, !hasUnified)
  const individualMatrix = usePipelineMatrix(effectiveRepoFilter, MATRIX_DAYS, !hasUnified)

  const pulseData = hasUnified ? unifiedData.pulse : individualPulse.data
  const pulseLoading = hasUnified ? unifiedData.isLoading : individualPulse.isLoading
  const pulseError = hasUnified ? unifiedData.error : individualPulse.error
  const refetch = hasUnified ? unifiedData.refetch : individualPulse.refetch
  const matrixData = hasUnified ? unifiedData.matrix : individualMatrix.data
  const matrixLoading = hasUnified ? unifiedData.isLoading : individualMatrix.isLoading
  const { isDemoMode } = useDemoMode()

  const hasData = !!pulseData?.lastRun || (matrixData?.workflows?.length ?? 0) > 0
  useCardLoadingState({ isLoading: (pulseLoading || matrixLoading) && !hasData, hasAnyData: hasData, isDemoData: isDemoMode })

  const workflows = useMemo(() => {
    const wfs = matrixData?.workflows ?? []
    if (!shared || shared.selectedRepos.size === 0) return wfs
    return wfs.filter((wf) => shared.selectedRepos.has(wf.repo))
  }, [matrixData, shared])

  const allDots: DotInfo[] = useMemo(() =>
    workflows.flatMap((wf) =>
      [...wf.cells].reverse().slice(0, MAX_DOTS).map((c) => ({
        conclusion: c.conclusion as Conclusion, htmlUrl: c.htmlUrl, date: c.date,
      }))), [workflows])
  const { passRate: overallPassRate, trend: overallTrend } = useMemo(() => computeTrend(allDots), [allDots])

  /** Workflows whose latest conclusion is not "success" — candidates for bulk audit */
  const inactiveWorkflows = useMemo(() =>
    workflows.filter((wf) => {
      const cells = [...wf.cells].reverse()
      const latestConclusion = cells[0]?.conclusion ?? null
      return latestConclusion !== 'success'
    }), [workflows])

  if (pulseError && !hasData) {
    return <div className="p-4 h-full flex items-center justify-center text-sm text-red-400">
      Failed to load release pulse. {pulseError}
    </div>
  }

  const { lastRun, nextCron, streak, streakKind } = pulseData
  const StatusIcon = !lastRun ? AlertTriangle
    : lastRun.conclusion === 'success' ? CheckCircle
    : lastRun.conclusion === 'failure' || lastRun.conclusion === 'timed_out' ? XCircle
    : lastRun.conclusion === null ? Loader2 : AlertTriangle
  const iconColor = !lastRun ? 'text-muted-foreground'
    : lastRun.conclusion === 'success' ? 'text-green-400'
    : lastRun.conclusion === 'failure' || lastRun.conclusion === 'timed_out' ? 'text-red-400'
    : lastRun.conclusion === null ? 'text-blue-400 animate-spin' : 'text-yellow-400'

  return (
    <div className="h-full flex flex-col">
      {!shared && <StandaloneRepoInput value={standaloneRepo} onChange={setStandaloneRepo} />}

      <div className="p-4 flex-1 flex flex-col gap-3 min-h-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusIcon size={18} className={cn('shrink-0', iconColor)} />
              <span className="text-base font-semibold text-foreground truncate">
                {lastRun?.releaseTag ?? 'No release yet'}
              </span>
              {lastRun?.releaseTag && (
                <span className="text-2xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 shrink-0">nightly</span>
              )}
            </div>
            {lastRun?.weeklyTag && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                <span className="text-2xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">stable</span>
                <span>{lastRun.weeklyTag}</span>
              </div>
            )}
            <div className="mt-0.5">
              <RepoSubtitle repo={effectiveRepoFilter || 'all repos'} />
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
              {lastRun && <>
                <span>{formatTimeAgo(lastRun.createdAt)}</span>
                <span>&middot;</span>
                <span className="capitalize">{lastRun.conclusion ?? 'running'}</span>
                <span>&middot;</span>
                <span>run #{lastRun.runNumber}</span>
              </>}
            </div>
          </div>
          {lastRun?.htmlUrl && lastRun.htmlUrl !== '#' && (
            <a href={lastRun.htmlUrl} target="_blank" rel="noreferrer noopener"
              className="text-xs text-muted-foreground hover:text-foreground shrink-0">
              <ExternalLink size={12} />
            </a>
          )}
        </div>

        <div className="grid grid-cols-2 @md:grid-cols-3 gap-2">
          <div className="rounded-lg bg-secondary/30 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Streak</div>
            <div className={cn('text-sm font-medium mt-0.5',
              streakKind === 'success' && 'text-green-400', streakKind === 'failure' && 'text-red-400')}>
              {streak === 0 ? '—' : `${streak}${streakKind === 'success' ? ' pass' : ' fail'}`}
            </div>
          </div>
          <div className="rounded-lg bg-secondary/30 px-3 py-2">
            <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock size={10} /> Next</div>
            <div className="text-sm font-medium mt-0.5 text-foreground">{formatCron(nextCron)}</div>
          </div>
          <div className="rounded-lg bg-secondary/30 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Overall</div>
            <div className="mt-0.5"><TrendIndicator passRate={overallPassRate} trend={overallTrend} /></div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {workflows.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              {!shared && !standaloneRepo.includes('/')
                ? 'Enter an owner/repo above to see workflow runs'
                : 'No workflow activity in this range'}
            </div>
          ) : (
            <div className="flex flex-col">
              {workflows.map((wf) => <WorkflowRow key={`${wf.repo}:${wf.name}`} wf={wf} />)}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <EmbedButton
            cardType="nightly-release-pulse"
            cardTitle="Nightly Release Pulse"
            currentRepo={effectiveRepoFilter}
          />
          {inactiveWorkflows.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const repoLabel = effectiveRepoFilter || 'all repos'
                const inactiveList = inactiveWorkflows
                  .map((wf) => {
                    const cells = [...wf.cells].reverse()
                    const status = cells[0]?.conclusion ?? 'inactive'
                    return `- ${wf.name} (${wf.repo}): ${status}`
                  })
                  .join('\n')
                startMission({
                  title: `Audit inactive workflows: ${repoLabel}`,
                  description: `Audit all inactive or skipped workflows in ${repoLabel}`,
                  type: 'analyze',
                  initialPrompt: `Audit all inactive or skipped workflows in ${repoLabel}.\n\nThe following workflows have not run successfully recently or are being skipped:\n${inactiveList}\n\nFor each workflow:\n1. Read the YAML file and determine why it's inactive\n2. Categorize: intentional / broken / obsolete / misconfigured\n3. After reviewing all of them, present a summary table and ask:\n   - "Should I create a PR to clean up the obsolete ones?"\n   - "Should I fix the broken ones?"\n   - "No changes needed"`,
                })
              }}
              className="text-[11px] text-muted-foreground hover:text-yellow-400 flex items-center gap-1"
            >
              <ClipboardCheck className="w-3 h-3" />
              Audit inactive
            </button>
          )}
          <button type="button" onClick={() => refetch()}
            className="text-[11px] text-muted-foreground hover:text-foreground">
            Refresh
          </button>
        </div>
      </div>
    </div>
  )
}
