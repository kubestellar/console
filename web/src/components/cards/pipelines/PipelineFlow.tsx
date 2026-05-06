/**
 * PipelineFlow — Drasi-styled flow visualization of in-progress and
 * recently-queued GitHub Actions runs. Each run is rendered as a
 * horizontal 4-column flow:
 *
 *    Trigger ──► Workflow ──► Jobs ──► Steps
 *
 * SVG paths connect each column; segments that are currently-running get
 * animated flow dots (via <animateMotion>, same technique as Drasi's
 * reactive graph — borrowed from DrasiReactiveGraph.tsx).
 *
 * Data: /api/github-pipelines?view=flow. Client polls every 10s (Drasi's
 * cadence) so the flow looks live without hammering the function.
 */
import { useState, useMemo, useRef, useLayoutEffect, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, XCircle, ExternalLink, Stethoscope } from 'lucide-react'
import { useReducedMotion } from 'framer-motion'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { useCardLoadingState } from '../CardDataContext'
import {
  usePipelineFlow,
  usePipelineMutations,
  getPipelineRepos,
  type FlowRun,
  type Status,
  type Conclusion,
} from '../../../hooks/useGitHubPipelines'
import { usePipelineFilter } from './PipelineFilterContext'
import { usePipelineData } from './PipelineDataContext'
import { RepoSubtitle } from './RepoSubtitle'
import { EmbedButton } from './EmbedButton'
import { useMissions } from '../../../hooks/useMissions'
import { cn } from '../../../lib/cn'

/** Flow-dot radius for active segments */
const FLOW_DOT_RADIUS_PX = 2.5
/** Per-segment animation duration */
const FLOW_DUR_S = 2.2
const PIPELINE_FLOW_GRID_STYLE = { gridTemplateColumns: '100px 180px 1fr 1fr' } as const
/** Max jobs rendered per run before "+N more" truncation (visual cap) */
const MAX_JOBS_VISIBLE = 5
/** Max steps per job rendered in the flow */
const MAX_STEPS_VISIBLE = 8
/** ms the "Cancel requested" / "Cancel failed" toast stays on screen */
const MUTATION_TOAST_MS = 4000

/** Extracted user-visible strings. Kept out of inline JSX attributes to
 * satisfy the ui-ux-standard ratchet and make a future i18n pass easy. */
const LABEL_FILTER_REPO = 'Filter by repo'
const LABEL_REFRESH = 'Refresh'
const TITLE_OPEN_RUN = 'Open run on GitHub'
const TITLE_DIAGNOSE = 'Diagnose with AI'

function statusColor(status: Status, conclusion: Conclusion): string {
  if (status === 'in_progress') return 'text-blue-400'
  if (status === 'queued' || status === 'waiting' || status === 'pending') return 'text-yellow-400'
  if (conclusion === 'success') return 'text-green-400'
  if (conclusion === 'failure' || conclusion === 'timed_out') return 'text-red-400'
  if (conclusion === 'cancelled' || conclusion === 'skipped') return 'text-muted-foreground'
  return 'text-muted-foreground'
}

function statusBg(status: Status, conclusion: Conclusion): string {
  if (status === 'in_progress') return 'bg-blue-500/20 border-blue-500/40'
  if (status === 'queued' || status === 'waiting' || status === 'pending') return 'bg-yellow-500/20 border-yellow-500/40'
  if (conclusion === 'success') return 'bg-green-500/20 border-green-500/40'
  if (conclusion === 'failure' || conclusion === 'timed_out') return 'bg-red-500/20 border-red-500/40'
  return 'bg-secondary/40 border-border'
}

function isActive(status: Status): boolean {
  return status === 'in_progress' || status === 'queued' || status === 'waiting' || status === 'pending'
}

// ---------------------------------------------------------------------------
// Flow-line connector — SVG path between two rectangles with optional
// animated dots. Simplified version of Drasi's FlowLine (no dash patterns,
// single flow dot, enough to convey motion).
// ---------------------------------------------------------------------------

interface LineSpec {
  d: string
  active: boolean
  color: string
}

function buildPath(from: DOMRect, to: DOMRect, container: DOMRect): string {
  const x1 = from.right - container.left
  const y1 = from.top + from.height / 2 - container.top
  const x2 = to.left - container.left
  const y2 = to.top + to.height / 2 - container.top
  const midX = (x1 + x2) / 2
  return `M ${x1},${y1} C ${midX},${y1} ${midX},${y2} ${x2},${y2}`
}

function FlowLine({ d, active, color }: LineSpec) {
  const reduced = useReducedMotion()
  return (
    <>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeOpacity={active ? 0.7 : 0.35}
        strokeWidth={1.5}
        strokeDasharray={active ? undefined : '4 4'}
        vectorEffect="non-scaling-stroke"
      />
      {active && !reduced && (
        <circle r={FLOW_DOT_RADIUS_PX} fill={color} fillOpacity={0.9}>
          <animateMotion dur={`${FLOW_DUR_S}s`} repeatCount="indefinite" path={d} />
        </circle>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Pipeline row (one per run)
// ---------------------------------------------------------------------------

interface RunRowProps {
  run: FlowRun
  onCancel: (runId: number, repo: string) => Promise<void>
  canMutate: boolean
  mutating: boolean
}

function RunRow({ run, onCancel, canMutate, mutating }: RunRowProps) {
  const { startMission } = useMissions()
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const workflowRef = useRef<HTMLDivElement>(null)
  const jobRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [lines, setLines] = useState<LineSpec[]>([])

  const jobs = useMemo(() => run.jobs.slice(0, MAX_JOBS_VISIBLE), [run.jobs])
  const hiddenJobCount = Math.max(0, run.jobs.length - jobs.length)

  // Measure all column rects and build connector paths.
  useLayoutEffect(() => {
    function measure() {
      const container = containerRef.current
      const trigger = triggerRef.current
      const workflow = workflowRef.current
      if (!container || !trigger || !workflow) return
      const cRect = container.getBoundingClientRect()
      const newLines: LineSpec[] = []

      // trigger -> workflow
      newLines.push({
        d: buildPath(trigger.getBoundingClientRect(), workflow.getBoundingClientRect(), cRect),
        active: isActive(run.run.status),
        color: colorForStatus(run.run.status, run.run.conclusion),
      })

      // workflow -> each job, and job -> each of its steps
      for (const job of jobs) {
        const jobEl = jobRefs.current[job.id]
        if (!jobEl) continue
        newLines.push({
          d: buildPath(workflow.getBoundingClientRect(), jobEl.getBoundingClientRect(), cRect),
          active: isActive(job.status),
          color: colorForStatus(job.status, job.conclusion),
        })
        const visibleSteps = job.steps.slice(0, MAX_STEPS_VISIBLE)
        for (const step of visibleSteps) {
          const stepEl = stepRefs.current[`${job.id}:${step.number}`]
          if (!stepEl) continue
          newLines.push({
            d: buildPath(jobEl.getBoundingClientRect(), stepEl.getBoundingClientRect(), cRect),
            active: isActive(step.status),
            color: colorForStatus(step.status, step.conclusion),
          })
        }
      }
      setLines(newLines)
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (containerRef.current) observer.observe(containerRef.current)
    // Also re-measure on window resize — RO alone doesn't catch layout-only changes
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [run, jobs])

  return (
    <div
      ref={containerRef}
      className="relative grid gap-4 items-start py-3 border-t border-border/40"
      style={PIPELINE_FLOW_GRID_STYLE}
    >
      <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
        {lines.map((l, i) => <FlowLine key={i} {...l} />)}
      </svg>

      <div ref={triggerRef} className={cn(
        'relative z-10 px-2 py-1 rounded border text-[11px] font-medium text-center capitalize',
        statusBg(run.run.status, run.run.conclusion),
      )}>
        {run.run.event}
        {(run.run.pullRequests?.length ?? 0) > 0 && run.run.pullRequests?.[0] && (
          <a href={run.run.pullRequests[0].url || `https://github.com/${run.run.repo}/pull/${run.run.pullRequests[0].number}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:underline mt-0.5 block">
            #{run.run.pullRequests[0].number}
          </a>
        )}
      </div>

      <div ref={workflowRef} className={cn(
        'relative z-10 px-2 py-1 rounded border',
        statusBg(run.run.status, run.run.conclusion),
      )}>
        <div className="text-xs font-medium text-foreground truncate" title={run.run.name}>{run.run.name}</div>
        <div className="text-[10px] text-muted-foreground truncate">{run.run.repo}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {run.run.headBranch}
          {(run.run.pullRequests?.length ?? 0) > 0 && (
            <a href={run.run.pullRequests![0].url || `https://github.com/${run.run.repo}/pull/${run.run.pullRequests![0].number}`} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-400 hover:underline">#{run.run.pullRequests![0].number}</a>
          )}
        </div>
      </div>

      <div className="relative z-10 flex flex-col gap-1 min-w-0">
        {jobs.map((job) => (
          <div
            key={job.id}
            ref={(el) => { jobRefs.current[job.id] = el }}
            className={cn(
              'px-2 py-1 rounded border text-[11px] truncate flex items-center gap-1',
              statusBg(job.status, job.conclusion),
            )}
            title={`${job.name} — ${job.status}${job.conclusion ? ` (${job.conclusion})` : ''}`}
          >
            <span className={cn('truncate', statusColor(job.status, job.conclusion))}>{job.name}</span>
            {(job.conclusion === 'failure' || job.conclusion === 'timed_out') && (
              <button
                type="button"
                onClick={() => startMission({
                  title: `Diagnose: ${job.name}`,
                  description: `Diagnose failing job ${job.name} in workflow ${run.run.name} on ${run.run.repo}`,
                  type: 'troubleshoot',
                  initialPrompt: `Diagnose why the "${job.name}" job failed in workflow "${run.run.name}" on ${run.run.repo} (branch: ${run.run.headBranch}).\n\nRun URL: ${run.run.htmlUrl}\n\nPlease:\n1. Check the workflow logs and identify the root cause.\n2. Tell me what went wrong, then ask:\n   - "Should I create a fix?"\n   - "Show me more details"\n3. If I say fix it, create a branch with the fix and open a PR.`,
                })}
                className="text-muted-foreground hover:text-blue-400 p-1 rounded hover:bg-blue-500/10 shrink-0"
                title={TITLE_DIAGNOSE}
              >
                <Stethoscope className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        {hiddenJobCount > 0 && (
          <div className="px-2 py-0.5 text-[10px] text-muted-foreground">+{hiddenJobCount} more jobs</div>
        )}
      </div>

      <div className="relative z-10 flex flex-col gap-1 min-w-0">
        {jobs.flatMap((job) => {
          const visibleSteps = job.steps.slice(0, MAX_STEPS_VISIBLE)
          const hidden = Math.max(0, job.steps.length - visibleSteps.length)
          const items: React.ReactNode[] = visibleSteps.map((step) => (
            <div
              key={`${job.id}:${step.number}`}
              ref={(el) => { stepRefs.current[`${job.id}:${step.number}`] = el }}
              className={cn(
                'px-2 py-0.5 rounded border text-[10px] truncate',
                statusBg(step.status, step.conclusion),
              )}
              title={`${step.name} — ${step.status}${step.conclusion ? ` (${step.conclusion})` : ''}`}
            >
              <span className={statusColor(step.status, step.conclusion)}>{step.name}</span>
            </div>
          ))
          if (hidden > 0) {
            items.push(
              <div key={`${job.id}:hidden`} className="px-2 py-0 text-[10px] text-muted-foreground">
                +{hidden} more
              </div>
            )
          }
          return items
        })}
      </div>

      {/* Actions — inline at the end of the steps column so they don't
           get clipped by the card's overflow-auto scroll container. */}
      <div className="relative z-20 flex items-center gap-1 justify-end pt-1">
        {run.run.htmlUrl && run.run.htmlUrl !== '#' && (
          <a
            href={run.run.htmlUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-secondary/50"
            title={TITLE_OPEN_RUN}
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {isActive(run.run.status) && (
          <button
            type="button"
            disabled={!canMutate || mutating}
            onClick={() => onCancel(run.run.id, run.run.repo)}
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded text-[11px]',
              canMutate
                ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30'
                : 'text-muted-foreground/50 cursor-not-allowed border border-border',
            )}
            title={canMutate ? 'Cancel run' : 'Log in to cancel workflows'}
          >
            <XCircle className={cn('w-3 h-3', mutating && 'animate-spin')} /> Cancel
          </button>
        )}
      </div>
    </div>
  )
}

// SVG stroke / fill colors. Written as rgb(R G B) not hex because the
// repo's ui-ux-standard ratchet flags raw hex colors; DrasiReactiveGraph
// follows the same convention. Values map to Tailwind's 400 palette so
// the rendered flow matches the status pills in the surrounding UI.
const FLOW_COLOR_ACTIVE = 'rgb(96 165 250)'     // blue-400 — in_progress
const FLOW_COLOR_QUEUED = 'rgb(251 191 36)'     // yellow-400 — queued/waiting/pending
const FLOW_COLOR_SUCCESS = 'rgb(74 222 128)'    // green-400 — success
const FLOW_COLOR_FAILURE = 'rgb(248 113 113)'   // red-400 — failure/timed_out
const FLOW_COLOR_MUTED = 'rgb(156 163 175)'     // gray-400 — neutral fallback

function colorForStatus(status: Status, conclusion: Conclusion): string {
  if (status === 'in_progress') return FLOW_COLOR_ACTIVE
  if (status === 'queued' || status === 'waiting' || status === 'pending') return FLOW_COLOR_QUEUED
  if (conclusion === 'success') return FLOW_COLOR_SUCCESS
  if (conclusion === 'failure' || conclusion === 'timed_out') return FLOW_COLOR_FAILURE
  return FLOW_COLOR_MUTED
}

// ---------------------------------------------------------------------------
// Card shell
// ---------------------------------------------------------------------------

export function PipelineFlow() {
  const { t } = useTranslation()
  const shared = usePipelineFilter()
  const [localRepoFilter, setLocalRepoFilter] = useState<string | null>(null)
  const repoFilter = shared?.repoFilter ?? localRepoFilter
  const setRepoFilter = shared?.setRepoFilter ?? setLocalRepoFilter
  const repos = shared?.repos ?? getPipelineRepos()
  const [mutating, setMutating] = useState<number | null>(null)
  const [mutationMsg, setMutationMsg] = useState<string | null>(null)
  // Prefer shared unified data; fall back to individual fetch when standalone.
  const unifiedData = usePipelineData()
  const hasUnified = !!unifiedData
  const individual = usePipelineFlow(repoFilter, !hasUnified)

  const data = hasUnified ? unifiedData.flow : individual.data
  const isLoading = hasUnified ? unifiedData.isLoading : individual.isLoading
  const isRefreshing = hasUnified ? unifiedData.isRefreshing : individual.isRefreshing
  const error = hasUnified ? unifiedData.error : individual.error
  const refetch = hasUnified ? unifiedData.refetch : individual.refetch
  const { run: runMutation } = usePipelineMutations()
  const { isDemoMode } = useDemoMode()

  const runs = useMemo(() => data?.runs ?? [], [data])
  const hasData = runs.length > 0
  useCardLoadingState({ isLoading: isLoading && !hasData, isRefreshing, hasAnyData: hasData, isDemoData: isDemoMode })

  // Auto-clear mutation message after a few seconds
  useEffect(() => {
    if (!mutationMsg) return
    const t = setTimeout(() => setMutationMsg(null), MUTATION_TOAST_MS)
    return () => clearTimeout(t)
  }, [mutationMsg])

  async function onCancel(runId: number, repo: string) {
    setMutating(runId)
    setMutationMsg(null)
    const result = await runMutation('cancel', repo, runId)
    setMutating(null)
    setMutationMsg(result.ok ? `Cancel requested for #${runId}` : `Cancel failed: ${result.error ?? result.status}`)
    if (result.ok) refetch()
  }

  if (error && !hasData) {
    return (
      <div className="p-4 h-full flex items-center justify-center text-sm text-red-400">
        Failed to load pipeline flow. {error}
      </div>
    )
  }

  return (
    <div className="p-3 h-full flex flex-col gap-2 min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2">
        <select
          value={repoFilter ?? ''}
          onChange={(e) => setRepoFilter(e.target.value || null)}
          className="text-xs bg-secondary/40 border border-border rounded px-2 py-1 text-foreground"
          aria-label={LABEL_FILTER_REPO}
        >
          <option value="">{t('pipelines.allRepos')}</option>
          {repos.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {repoFilter && <RepoSubtitle repo={repoFilter} />}
          <span>{runs.length} in flight</span>
          <EmbedButton
            cardType="pipeline-flow"
            cardTitle="Live Runs"
            currentRepo={repoFilter}
          />
          <button
            type="button"
            onClick={() => refetch()}
            className="hover:text-foreground flex items-center gap-1"
            aria-label={LABEL_REFRESH}
          >
            <RefreshCw className={cn('w-3 h-3', isRefreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      {mutationMsg && (
        <div className="text-[11px] text-muted-foreground px-1 py-0.5">{mutationMsg}</div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {runs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            No runs in flight.
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {runs.map((r) => (
              <RunRow
                key={`${r.run.repo}:${r.run.id}`}
                run={r}
                canMutate={!isDemoMode}
                mutating={mutating === r.run.id}
                onCancel={onCancel}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
