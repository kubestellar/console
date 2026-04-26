import { GitMerge, GitPullRequest, Bug, Lightbulb, AlertCircle } from 'lucide-react'
import { createElement } from 'react'
import {
  STATUS_LABELS,
  type RequestType,
  type RequestStatus,
  type TargetRepo,
} from '../../hooks/useFeatureRequests'
import type { FeedbackDraft } from '../../hooks/useFeedbackDrafts'
import { MINUTES_PER_HOUR, HOURS_PER_DAY } from '../../lib/constants/time'
export { MINUTES_PER_HOUR, HOURS_PER_DAY }
/** Days in a week */
export const DAYS_PER_WEEK = 7
/** Delay before showing preview link (Netlify route warmup) */
export const PREVIEW_WARMUP_SECONDS = 30
/** Delay (ms) before clearing success state and switching to Updates tab */
export const SUCCESS_DISPLAY_MS = 5000
/** Minimum draft length to allow saving */
export const MIN_DRAFT_LENGTH = 5
/** Minimum title length (backend-aligned) */
export const MIN_TITLE_LENGTH = 10
/** Minimum description length (backend-aligned) */
export const MIN_DESCRIPTION_LENGTH = 20
/** Minimum word count in description (backend-aligned) */
export const MIN_DESCRIPTION_WORDS = 3
/** Maximum title length extracted from first line */
export const MAX_TITLE_LENGTH = 200

// ── Shared types ──
export type TabType = 'submit' | 'drafts' | 'updates'

export interface FeatureRequestModalProps {
  isOpen: boolean
  onClose: () => void
  initialTab?: TabType
  initialRequestType?: RequestType
  initialContext?: {
    cardType: string
    cardTitle: string
  }
}

export interface SuccessState {
  issueUrl?: string
  screenshotsUploaded?: number
  screenshotsFailed?: number
}

export interface PreviewResult {
  status: string
  preview_url?: string
  ready_at?: string
  message?: string
}

export interface ScreenshotItem {
  file: File
  preview: string
}

// ── Utility functions ──

/** @deprecated Use {@link formatTimeAgo} from lib/formatters instead. */
export { formatTimeAgo as formatRelativeTime } from '../../lib/formatters'

/** Get display info (label, colors) for a request status */
export function getStatusInfo(
  status: RequestStatus,
  closedByUser?: boolean
): { label: string; color: string; bgColor: string } {
  const colors: Record<RequestStatus, { color: string; bgColor: string }> = {
    open: { color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
    needs_triage: { color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
    triage_accepted: { color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' },
    feasibility_study: { color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
    fix_ready: { color: 'text-green-400', bgColor: 'bg-green-500/20' },
    fix_complete: { color: 'text-green-400', bgColor: 'bg-green-500/20' },
    unable_to_fix: { color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
    closed: { color: 'text-muted-foreground', bgColor: 'bg-gray-500/20' },
  }
  let label = STATUS_LABELS[status]
  if (status === 'closed' && closedByUser) {
    label = 'Closed by You'
  }
  return { label, ...colors[status] }
}

/** Icon component for GitHub contribution type */
export function GitHubContributionIcon({ type }: { type: string }) {
  switch (type) {
    case 'pr_merged':
      return createElement(GitMerge, { className: 'w-4 h-4 text-purple-400 shrink-0' })
    case 'pr_opened':
      return createElement(GitPullRequest, { className: 'w-4 h-4 text-green-400 shrink-0' })
    case 'issue_bug':
      return createElement(Bug, { className: 'w-4 h-4 text-red-400 shrink-0' })
    case 'issue_feature':
      return createElement(Lightbulb, { className: 'w-4 h-4 text-yellow-400 shrink-0' })
    default:
      return createElement(AlertCircle, { className: 'w-4 h-4 text-muted-foreground shrink-0' })
  }
}

// Re-export types from hooks for convenience
export type { RequestType, RequestStatus, TargetRepo, FeedbackDraft }
