import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Loader2,
  Minus,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import { useMissions } from '../../../hooks/useMissions'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { BACKEND_DEFAULT_URL, FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'
import { POPUP_HIDE_DELAY_MS } from '../../../lib/constants/network'
import { formatTimeAgo } from '../../../lib/formatters'
import type { NightlyGuideStatus, NightlyRun } from '../../../lib/llmd/nightlyE2EDemoData'
import { sanitizeUrl } from '../../../lib/utils/sanitizeUrl'
import { ApiKeyPromptModal, useApiKeyCheck } from '../console-missions/shared'

export function RunDot({ run, guide, isHighlighted, onMouseEnter, onMouseLeave }: {
  run: NightlyRun
  guide?: NightlyGuideStatus
  isHighlighted?: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  const [showPopup, setShowPopup] = useState(false)
  const [isDiagnosing, setIsDiagnosing] = useState(false)
  const dotRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null)
  const { startMission } = useMissions()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()
  const { isDemoMode } = useDemoMode()
  const isRunning = run.status !== 'completed'
  const isFailed = run.conclusion === 'failure'
  const isGPUFailure = isFailed && run.failureReason === 'gpu_unavailable'
  const color = isRunning
    ? 'bg-blue-400'
    : run.conclusion === 'success'
      ? 'bg-green-400'
      : isGPUFailure
        ? 'bg-yellow-400'
        : isFailed
          ? 'bg-red-400'
          : run.conclusion === 'cancelled'
            ? 'bg-gray-500 dark:bg-gray-400'
            : 'bg-yellow-400'

  const reasonLabel = isGPUFailure ? 'GPU unavailable' : ''
  const title = isRunning
    ? `Running (started ${formatTimeAgo(run.createdAt)})`
    : reasonLabel
      ? `${run.conclusion} (${reasonLabel}) — ${formatTimeAgo(run.createdAt)}`
      : `${run.conclusion} — ${formatTimeAgo(run.createdAt)}`

  const logsUrl = `${run.htmlUrl}#logs`

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const scheduleHide = () => {
    cancelHide()
    hideTimerRef.current = setTimeout(() => setShowPopup(false), POPUP_HIDE_DELAY_MS)
  }

  useEffect(() => () => cancelHide(), [cancelHide])

  // Close popup on Escape key
  useEffect(() => {
    if (!showPopup) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setShowPopup(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showPopup])

  const handleDotEnter = () => {
    cancelHide()
    if (dotRef.current) {
      const rect = dotRef.current.getBoundingClientRect()
      setPopupPos({ top: rect.top, left: rect.left + rect.width / 2 })
    }
    setShowPopup(true)
    onMouseEnter?.()
  }

  const handleDotLeave = () => {
    scheduleHide()
    onMouseLeave?.()
  }

  const handleDiagnose = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!guide) return

    checkKeyAndRun(async () => {
      setIsDiagnosing(true)
      try {
        let logsContent = 'Failed to fetch logs — analyze using the GitHub URL below.'
        
        // In demo mode, show demo message instead of making API call
        if (isDemoMode) {
          logsContent = 'Demo mode: Log fetching is disabled. In live mode, this would fetch actual GitHub Actions logs for diagnosis.'
        } else {
          const API_BASE = import.meta.env.VITE_API_BASE_URL || BACKEND_DEFAULT_URL
          const resp = await fetch(
            `${API_BASE}/api/public/nightly-e2e/run-logs?repo=${encodeURIComponent(guide.repo)}&runId=${run.id}`,
            { signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) }
          )
          if (resp.ok) {
            const data = await resp.json()
            if (data.jobs?.length) {
              logsContent = data.jobs.map((j: { name: string; conclusion: string; log: string }) =>
                `### Job: ${j.name} (${j.conclusion})\n\`\`\`\n${j.log}\n\`\`\``
              ).join('\n\n')
            } else {
              logsContent = 'No failed job logs returned.'
            }
          }
        }

        startMission({
          title: `Diagnose ${guide.acronym} (${guide.platform}) Run #${run.runNumber}`,
          description: `Analyze failed nightly E2E workflow run`,
          type: 'troubleshoot',
          initialPrompt: `Analyze this failed nightly E2E workflow run and diagnose the root cause.

## Run Context
- Guide: ${guide.guide} (${guide.acronym}) on ${guide.platform}
- Repository: ${guide.repo}
- Workflow: ${guide.workflowFile}
- Run #: ${run.runNumber}
- Failure Reason: ${run.failureReason || 'unknown'}
- Model: ${run.model}, GPU: ${run.gpuCount}x ${run.gpuType}
- GitHub URL: ${run.htmlUrl}

## GitHub Actions Logs
${logsContent}

Please provide:
1. Root cause analysis
2. Classification (test flake, infra issue, GPU problem, code regression)
3. Suggested fix
4. Pattern detection (recurring issue?)`,
          context: {
            guide: guide.guide,
            platform: guide.platform,
            repo: guide.repo,
            runNumber: run.runNumber } })
      } finally {
        setIsDiagnosing(false)
      }
    })
  }

  // Prefer per-run images (from workflow artifact) over guide-level fallback
  const llmdImages = run.llmdImages ?? guide?.llmdImages
  const otherImages = run.otherImages ?? guide?.otherImages
  const hasLLMDImages = llmdImages && Object.keys(llmdImages).length > 0
  const hasOtherImages = otherImages && Object.keys(otherImages).length > 0

  return (
    <div
      ref={dotRef}
      className="group relative"
      onMouseEnter={handleDotEnter}
      onMouseLeave={handleDotLeave}
    >
      <a
        href={sanitizeUrl(run.htmlUrl)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Run #${run.runNumber}: ${title}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`w-3 h-3 rounded-full ${color} ${isRunning ? 'animate-pulse' : ''} ${
          isHighlighted ? 'ring-2 ring-white/50 scale-125' : 'group-hover:ring-2 group-hover:ring-white/30'
        } transition-all`} aria-hidden="true" />
      </a>
      {showPopup && popupPos && createPortal(
        <div
          role="tooltip"
          className="fixed z-dropdown"
          style={{ top: popupPos.top, left: popupPos.left, transform: 'translate(-50%, -100%)' }}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        >
          <div className="mb-1.5 bg-secondary border border-border rounded-lg shadow-xl px-2.5 py-1.5 text-2xs">
            {/* Run status line */}
            <div className="text-foreground mb-1 whitespace-nowrap">
              Run #{run.runNumber} &middot;{' '}
              {isRunning
                ? <span className="text-blue-400">running</span>
                : isGPUFailure
                  ? <span className="text-yellow-400">GPU unavailable</span>
                  : isFailed
                    ? <span className="text-red-400">failed</span>
                    : run.conclusion === 'success'
                      ? <span className="text-green-400">passed</span>
                      : <span className="text-muted-foreground">{run.conclusion}</span>
              }
              {' '}&middot; {formatTimeAgo(run.createdAt)}
            </div>

            {/* llm-d component tags */}
            {hasLLMDImages && (
              <div className="mt-1.5 pt-1.5 border-t border-border">
                <div className="text-muted-foreground text-[9px] font-medium mb-0.5">llm-d components</div>
                {Object.entries(llmdImages).map(([name, tag]) => (
                  <div key={name} className="flex items-center gap-1 whitespace-nowrap">
                    <span className="text-muted-foreground">{name}</span>
                    <span className="text-cyan-400 font-mono">:{tag}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Other container tags */}
            {hasOtherImages && (
              <div className="mt-1.5 pt-1.5 border-t border-border">
                <div className="text-muted-foreground text-[9px] font-medium mb-0.5">other images</div>
                {Object.entries(otherImages).map(([name, tag]) => (
                  <div key={name} className="flex items-center gap-1 whitespace-nowrap">
                    <span className="text-muted-foreground">{name}</span>
                    <span className="text-orange-400 font-mono">:{tag}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Action links */}
            <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-border">
              {isFailed && guide && (
                <button
                  onClick={handleDiagnose}
                  disabled={isDiagnosing}
                  className="text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-0.5 disabled:opacity-50"
                >
                  <Stethoscope size={8} />
                  {isDiagnosing ? 'Loading...' : 'AI Diagnose'}
                </button>
              )}
              <a href={sanitizeUrl(logsUrl)} target="_blank" rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-0.5 min-h-11 min-w-11"
                onClick={e => e.stopPropagation()}>
                View Logs <ExternalLink size={8} />
              </a>
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-border" />
          </div>
        </div>,
        document.body
      )}
      <ApiKeyPromptModal isOpen={showKeyPrompt} onDismiss={dismissPrompt} onGoToSettings={goToSettings} />
    </div>
  )
}

export function TrendIndicator({ trend, passRate }: { trend: 'up' | 'down' | 'steady'; passRate: number }) {
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const color = passRate === 100
    ? 'text-green-400'
    : passRate >= 70
      ? 'text-yellow-400'
      : 'text-red-400'

  return (
    <div className={`flex items-center gap-1 ${color}`}>
      <Icon size={12} />
      <span className="text-xs font-mono">{passRate}%</span>
    </div>
  )
}

export function GuideRow({ guide, delay, isSelected, onMouseEnter, onRunHover }: {
  guide: NightlyGuideStatus
  delay: number
  isSelected: boolean
  onMouseEnter: () => void
  onRunHover: (run: NightlyRun | null) => void
}) {
  const workflowUrl = `https://github.com/${guide.repo}/actions/workflows/${guide.workflowFile}`
  const StatusIcon = guide.latestConclusion === 'success'
    ? CheckCircle
    : guide.latestConclusion === 'failure'
      ? XCircle
      : guide.latestConclusion === 'in_progress'
        ? Loader2
        : AlertTriangle

  const iconColor = guide.latestConclusion === 'success'
    ? 'text-green-400'
    : guide.latestConclusion === 'failure'
      ? 'text-red-400'
      : guide.latestConclusion === 'in_progress'
        ? 'text-blue-400 animate-spin'
        : 'text-muted-foreground'

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay }}
      className={`flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors group cursor-pointer ${
        isSelected ? 'bg-secondary/50 ring-1 ring-border/50' : 'hover:bg-secondary/40'
      }`}
      onMouseEnter={onMouseEnter}
    >
      <StatusIcon size={14} className={`shrink-0 ${iconColor}`} />
      <span className="text-xs text-foreground w-48 truncate shrink-0" title={guide.guide}>
        <span className="font-mono font-semibold text-muted-foreground mr-1.5">{guide.acronym}</span>
        {guide.guide}
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        {guide.runs.map((run) => (
          <RunDot key={run.id} run={run} guide={guide}
            onMouseEnter={() => { onMouseEnter(); onRunHover(run) }}
            onMouseLeave={() => onRunHover(null)}
          />
        ))}
        {/* Pad with empty dots if fewer than 7 runs */}
        {Array.from({ length: Math.max(0, 7 - guide.runs.length) }).map((_, i) => (
          <div key={`empty-${i}`} className="w-3 h-3 rounded-full bg-border/50" />
        ))}
      </div>
      <TrendIndicator trend={guide.trend} passRate={guide.passRate} />
      <a
        href={sanitizeUrl(workflowUrl)}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-secondary"
        onClick={e => e.stopPropagation()}
      >
        <ExternalLink size={12} className="text-muted-foreground" />
      </a>
    </motion.div>
  )
}
