import { useState, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  Stethoscope,
  ClipboardCheck,
} from 'lucide-react'
import type { MatrixWorkflow, Conclusion } from '../../../hooks/useGitHubPipelines'
import { sanitizeUrl } from '../../../lib/utils/sanitizeUrl'
import { useMissions } from '../../../hooks/useMissions'
import { cn } from '../../../lib/cn'
import { Input } from '../../ui/Input'
import type { DotInfo } from './pulse-utils'
import {
  MAX_DOTS,
  POPUP_HIDE_DELAY_MS,
  WORKFLOW_URL_BASE,
  TITLE_DIAGNOSE,
  TITLE_AUDIT,
  PLACEHOLDER_REPO,
  LABEL_SET_REPO,
  dotColor,
  dotTextColor,
  computeTrend,
} from './NightlyReleasePulse.constants'

// ---------------------------------------------------------------------------
// RunDot — colored dot with hover popup
// ---------------------------------------------------------------------------

export function RunDot({ dot }: { dot: DotInfo }) {
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
          <a href={sanitizeUrl(dot.htmlUrl)} target="_blank" rel="noopener noreferrer">
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
              <a href={sanitizeUrl(dot.htmlUrl)} target="_blank" rel="noopener noreferrer"
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

export function TrendIndicator({ passRate, trend }: { passRate: number; trend: 'up' | 'down' | 'steady' }) {
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

export function WorkflowRow({ wf }: { wf: MatrixWorkflow }) {
  const { startMission } = useMissions()
  const dots: DotInfo[] = useMemo(() =>
    [...wf.cells].reverse().slice(0, MAX_DOTS).map((c) => ({
      conclusion: c.conclusion as Conclusion, htmlUrl: c.htmlUrl, date: c.date,
    })), [wf.cells])

  const { passRate, trend } = useMemo(() => computeTrend(dots), [dots])
  const latest = dots[0]?.conclusion
  const latestFailed = latest === 'failure' || latest === 'timed_out' || latest === 'startup_failure'
  const isInactive = latest === 'skipped' || latest === 'cancelled' || latest === null
  const StatusIcon = !latest ? AlertTriangle
    : latest === 'success' ? CheckCircle
    : latest === 'failure' || latest === 'timed_out' || latest === 'startup_failure' ? XCircle
    : AlertTriangle
  const iconColor = !latest ? 'text-muted-foreground'
    : latest === 'success' ? 'text-green-400'
    : latest === 'failure' || latest === 'timed_out' || latest === 'startup_failure' ? 'text-red-400'
    : 'text-yellow-400'
  const shortRepo = wf.repo.split('/')[1] ?? wf.repo

  return (
    <div className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-secondary/30 transition-colors group">
      <StatusIcon size={14} className={cn('shrink-0', iconColor)} />
      <div className="w-36 shrink-0 min-w-0">
        <div className="text-xs text-foreground font-medium truncate" title={wf.name}>{wf.name}</div>
        <div className="text-xs text-muted-foreground truncate">{shortRepo}</div>
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

export function StandaloneRepoInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="px-4 py-3 border-b border-border/50">
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={PLACEHOLDER_REPO}
        aria-label={LABEL_SET_REPO}
        leadingIcon={<Search size={12} />}
        inputSize="sm"
        className="bg-transparent"
      />
    </div>
  )
}
