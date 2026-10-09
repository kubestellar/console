import { useState, useMemo, useRef, useLayoutEffect } from 'react'
import { XCircle, ExternalLink, Stethoscope } from 'lucide-react'
import { useReducedMotion } from 'framer-motion'
import type { FlowRun } from '../../../hooks/useGitHubPipelines'
import { sanitizeUrl } from '../../../lib/utils/sanitizeUrl'
import { useMissions } from '../../../hooks/useMissions'
import { cn } from '../../../lib/cn'
import { statusColor, statusBg, isActive, colorForStatus } from './PipelineFlow.utils'

/** Flow-dot radius for active segments */
const FLOW_DOT_RADIUS_PX = 2.5
/** Per-segment animation duration */
const FLOW_DUR_S = 2.2
const PIPELINE_FLOW_GRID_STYLE = { gridTemplateColumns: '100px 180px 1fr 1fr' } as const
/** Max jobs rendered per run before "+N more" truncation (visual cap) */
const MAX_JOBS_VISIBLE = 5
/** Max steps per job rendered in the flow */
const MAX_STEPS_VISIBLE = 8

const TITLE_OPEN_RUN = 'Open run on GitHub'
const TITLE_DIAGNOSE = 'Diagnose with AI'

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

export function RunRow({ run, onCancel, canMutate, mutating }: RunRowProps) {
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
        'relative z-10 px-2 py-1 rounded border text-xs font-medium text-center capitalize',
        statusBg(run.run.status, run.run.conclusion),
      )}>
        {run.run.event}
        {(run.run.pullRequests?.length ?? 0) > 0 && run.run.pullRequests?.[0] && (
          <a href={sanitizeUrl(run.run.pullRequests[0].url || `https://github.com/${run.run.repo}/pull/${run.run.pullRequests[0].number}`)} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline mt-0.5 block">
            #{run.run.pullRequests[0].number}
          </a>
        )}
      </div>

      <div ref={workflowRef} className={cn(
        'relative z-10 px-2 py-1 rounded border',
        statusBg(run.run.status, run.run.conclusion),
      )}>
        <div className="text-xs font-medium text-foreground truncate" title={run.run.name}>{run.run.name}</div>
        <div className="text-xs text-muted-foreground truncate">{run.run.repo}</div>
        <div className="text-xs text-muted-foreground truncate">
          {run.run.headBranch}
          {(run.run.pullRequests?.length ?? 0) > 0 && (
            <a href={sanitizeUrl(run.run.pullRequests![0].url || `https://github.com/${run.run.repo}/pull/${run.run.pullRequests![0].number}`)} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-400 hover:underline">#{run.run.pullRequests![0].number}</a>
          )}
        </div>
      </div>

      <div className="relative z-10 flex flex-col gap-1 min-w-0">
        {jobs.map((job) => (
          <div
            key={job.id}
            ref={(el) => { jobRefs.current[job.id] = el }}
            className={cn(
              'px-2 py-1 rounded border text-xs truncate flex items-center gap-1',
              statusBg(job.status, job.conclusion),
            )}
            title={`${job.name} — ${job.status}${job.conclusion ? ` (${job.conclusion})` : ''}`}
          >
            <span className={cn('truncate', statusColor(job.status, job.conclusion))}>{job.name}</span>
            {(job.conclusion === 'failure' || job.conclusion === 'timed_out' || job.conclusion === 'startup_failure') && (
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
          <div className="px-2 py-0.5 text-xs text-muted-foreground">+{hiddenJobCount} more jobs</div>
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
                'px-2 py-0.5 rounded border text-xs truncate',
                statusBg(step.status, step.conclusion),
              )}
              title={`${step.name} — ${step.status}${step.conclusion ? ` (${step.conclusion})` : ''}`}
            >
              <span className={statusColor(step.status, step.conclusion)}>{step.name}</span>
            </div>
          ))
          if (hidden > 0) {
            items.push(
              <div key={`${job.id}:hidden`} className="px-2 py-0 text-xs text-muted-foreground">
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
            href={sanitizeUrl(run.run.htmlUrl)}
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
              'flex items-center gap-1 px-2 py-0.5 rounded text-xs',
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
