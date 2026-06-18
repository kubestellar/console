import { MS_PER_DAY, MS_PER_HOUR } from '../../lib/constants/time'

/** User-facing error for feedback attachments that exceed the request body limit. */
export const FEEDBACK_ATTACHMENT_LIMIT_ERROR = 'Attachments are too large to submit. Keep each video at or below 10 MB and retry with fewer or smaller files.'

export type RequestType = 'bug' | 'feature'
export type RequestStatus = 'open' | 'needs_triage' | 'triage_accepted' | 'feasibility_study' | 'fix_ready' | 'fix_complete' | 'unable_to_fix' | 'closed'
export type FeedbackType = 'positive' | 'negative'
export type NotificationType = 'issue_created' | 'triage_accepted' | 'feasibility_study' | 'fix_ready' | 'fix_complete' | 'unable_to_fix' | 'closed' | 'feedback_received' | 'pr_created' | 'preview_ready' | 'pr_merged' | 'pr_closed'
export type TargetRepo = 'console' | 'docs'

export interface FeatureRequest {
  id: string
  user_id: string
  github_login?: string
  title: string
  description: string
  request_type: RequestType
  target_repo?: TargetRepo
  github_issue_number?: number
  github_issue_url?: string
  status: RequestStatus
  pr_number?: number
  pr_url?: string
  copilot_session_url?: string
  netlify_preview_url?: string
  latest_comment?: string
  closed_by_user?: boolean
  created_at: string
  updated_at?: string
  screenshots_uploaded?: number
  screenshots_failed?: number
  warning?: string
}

/** Check if a request has been triaged (accepted for review) */
export function isTriaged(status: RequestStatus): boolean {
  return status !== 'open' && status !== 'needs_triage'
}

export interface PRFeedback {
  id: string
  feature_request_id: string
  user_id: string
  feedback_type: FeedbackType
  comment?: string
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  feature_request_id?: string
  notification_type: NotificationType
  title: string
  message: string
  read: boolean
  created_at: string
  action_url?: string
}

export interface ConsoleError {
  timestamp: string
  level: 'error' | 'warn'
  message: string
  source?: string
}

export interface FailedApiCall {
  timestamp: string
  status: number | string
  endpoint: string
  detail?: string
}

export interface DiagnosticInfo {
  agent_version?: string
  commit_sha?: string
  build_time?: string
  go_version?: string
  agent_os?: string
  agent_arch?: string
  install_method?: string
  clusters?: number
  cluster_context?: string
  console_deploy_mode?: string
  active_agent_backend?: string
  backend_ws_status?: string
  agent_connection_status?: string
  agent_connection_failures?: number
  agent_last_error?: string
  agent_connection_log?: string[]
  browser_user_agent?: string
  browser_platform?: string
  browser_language?: string
  screen_resolution?: string
  window_size?: string
  page_url?: string
}

export interface CreateFeatureRequestInput {
  title: string
  description: string
  request_type: RequestType
  target_repo?: TargetRepo
  parent_issue_number?: number
  screenshots?: string[]
  console_errors?: ConsoleError[]
  failed_api_calls?: FailedApiCall[]
  diagnostics?: DiagnosticInfo
}

export interface SubmitFeedbackInput {
  feedback_type: FeedbackType
  comment?: string
}

export interface CloseRequestInput {
  user_verified?: boolean
}

export interface ReopenRequestInput {
  comment: string
}

export const STATUS_LABELS: Record<RequestStatus, string> = {
  open: 'Open',
  needs_triage: 'Needs Triage',
  triage_accepted: 'Triage Accepted',
  feasibility_study: 'AI Working',
  fix_ready: 'Fix Ready',
  fix_complete: 'Fix Complete',
  unable_to_fix: 'Needs Human Review',
  closed: 'Closed',
}

export const STATUS_COLORS: Record<RequestStatus, string> = {
  open: 'bg-blue-500',
  needs_triage: 'bg-yellow-500',
  triage_accepted: 'bg-cyan-500',
  feasibility_study: 'bg-purple-500',
  fix_ready: 'bg-green-500',
  fix_complete: 'bg-green-500',
  unable_to_fix: 'bg-orange-500',
  closed: 'bg-gray-400',
}

export const STATUS_DESCRIPTIONS: Record<RequestStatus, string> = {
  open: 'Issue created on GitHub',
  needs_triage: 'Awaiting review by the team',
  triage_accepted: 'Accepted and queued for AI analysis',
  feasibility_study: 'AI coding agent is analyzing and working on a fix',
  fix_ready: 'PR created and ready for review',
  fix_complete: 'Fix has been merged',
  unable_to_fix: 'Requires human developer review',
  closed: 'This request has been closed',
}

/** Get status description, hiding it for user-closed items (badge is sufficient) */
export function getStatusDescription(status: RequestStatus, closedByUser?: boolean): string {
  if (status === 'closed' && closedByUser) {
    return ''
  }
  return STATUS_DESCRIPTIONS[status]
}

export const DEMO_FEATURE_REQUESTS: FeatureRequest[] = [
  {
    id: 'demo-1',
    user_id: 'demo-user',
    title: 'Add dark mode toggle to settings',
    description: 'Would be great to have a dark mode option in the settings panel.',
    request_type: 'feature',
    github_issue_number: 42,
    github_issue_url: 'https://github.com/kubestellar/console/issues/42',
    status: 'fix_ready',
    pr_number: 87,
    pr_url: 'https://github.com/kubestellar/console/pull/87',
    created_at: new Date(Date.now() - 3 * MS_PER_DAY).toISOString(),
  },
  {
    id: 'demo-2',
    user_id: 'demo-user',
    title: 'Dashboard not loading cluster data',
    description: 'The dashboard shows a loading spinner but never loads the cluster data.',
    request_type: 'bug',
    github_issue_number: 56,
    github_issue_url: 'https://github.com/kubestellar/console/issues/56',
    status: 'feasibility_study',
    created_at: new Date(Date.now() - 1 * MS_PER_DAY).toISOString(),
  },
  {
    id: 'demo-3',
    user_id: 'demo-user',
    title: 'Export dashboard as PDF',
    description: 'Ability to export the current dashboard view as a PDF document.',
    request_type: 'feature',
    github_issue_number: 38,
    github_issue_url: 'https://github.com/kubestellar/console/issues/38',
    status: 'fix_complete',
    pr_number: 72,
    pr_url: 'https://github.com/kubestellar/console/pull/72',
    created_at: new Date(Date.now() - 7 * MS_PER_DAY).toISOString(),
  },
]

export const INITIAL_DEMO_NOTIFICATIONS: Notification[] = [
  {
    id: 'demo-notif-1',
    user_id: 'demo-user',
    feature_request_id: 'demo-1',
    notification_type: 'fix_ready',
    title: 'PR Ready: Add dark mode toggle',
    message: 'A pull request has been created for your feature request.',
    read: false,
    created_at: new Date(Date.now() - 2 * MS_PER_HOUR).toISOString(),
    action_url: 'https://github.com/kubestellar/console/pull/87',
  },
  {
    id: 'demo-notif-2',
    user_id: 'demo-user',
    feature_request_id: 'demo-3',
    notification_type: 'fix_complete',
    title: 'Merged: Export dashboard as PDF',
    message: 'Your feature request has been implemented and merged.',
    read: true,
    created_at: new Date(Date.now() - 5 * MS_PER_DAY).toISOString(),
    action_url: 'https://github.com/kubestellar/console/pull/72',
  },
]
