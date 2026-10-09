import type { Status, Conclusion } from '../../../hooks/useGitHubPipelines'

export function statusColor(status: Status, conclusion: Conclusion): string {
  if (status === 'in_progress') return 'text-blue-400'
  if (status === 'queued' || status === 'waiting' || status === 'pending') return 'text-yellow-400'
  if (conclusion === 'success') return 'text-green-400'
  if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'startup_failure') return 'text-red-400'
  if (conclusion === 'cancelled' || conclusion === 'skipped') return 'text-muted-foreground'
  return 'text-muted-foreground'
}

export function statusBg(status: Status, conclusion: Conclusion): string {
  if (status === 'in_progress') return 'bg-blue-500/20 border-blue-500/40'
  if (status === 'queued' || status === 'waiting' || status === 'pending') return 'bg-yellow-500/20 border-yellow-500/40'
  if (conclusion === 'success') return 'bg-green-500/20 border-green-500/40'
  if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'startup_failure') return 'bg-red-500/20 border-red-500/40'
  return 'bg-secondary/40 border-border'
}

export function isActive(status: Status): boolean {
  return status === 'in_progress' || status === 'queued' || status === 'waiting' || status === 'pending'
}

// SVG stroke / fill colors. Written as rgb(R G B) not hex because the
// repo's ui-ux-standard ratchet flags raw hex colors; DrasiReactiveGraph
// follows the same convention. Values map to Tailwind's 400 palette so
// the rendered flow matches the status pills in the surrounding UI.
export const FLOW_COLOR_ACTIVE = 'rgb(96 165 250)'     // blue-400 — in_progress
export const FLOW_COLOR_QUEUED = 'rgb(251 191 36)'     // yellow-400 — queued/waiting/pending
export const FLOW_COLOR_SUCCESS = 'rgb(74 222 128)'    // green-400 — success
export const FLOW_COLOR_FAILURE = 'rgb(248 113 113)'   // red-400 — failure/timed_out/startup_failure
export const FLOW_COLOR_MUTED = 'rgb(156 163 175)'     // gray-400 — neutral fallback

export function colorForStatus(status: Status, conclusion: Conclusion): string {
  if (status === 'in_progress') return FLOW_COLOR_ACTIVE
  if (status === 'queued' || status === 'waiting' || status === 'pending') return FLOW_COLOR_QUEUED
  if (conclusion === 'success') return FLOW_COLOR_SUCCESS
  if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'startup_failure') return FLOW_COLOR_FAILURE
  return FLOW_COLOR_MUTED
}
