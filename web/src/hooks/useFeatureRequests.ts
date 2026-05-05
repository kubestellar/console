import { useState, useEffect, useCallback, useRef } from 'react'
import { api, RateLimitError } from '../lib/api'
import { STORAGE_KEY_TOKEN, STORAGE_KEY_HAS_SESSION, DEMO_TOKEN_VALUE } from '../lib/constants'
import { MIN_PERCEIVED_DELAY_MS } from '../lib/constants/network'
import { MS_PER_DAY, MS_PER_HOUR } from '../lib/constants/time'

/** Cache TTL: 30 seconds — polling interval for status updates */
const CACHE_TTL_MS = 30_000

// #8291 — Post-#6590, a legitimate OAuth session can live ENTIRELY in the
// HttpOnly kc_auth cookie with nothing in localStorage['token']. The previous
// token-only check mislabeled those users as demo and served them the
// hardcoded sample queue. The `kc-has-session` flag is set by /auth/refresh
// once the backend confirms a cookie-backed session, so it's the authoritative
// signal that a real user is logged in even with an empty localStorage token.
function isDemoUser(): boolean {
  if (localStorage.getItem(STORAGE_KEY_HAS_SESSION) === 'true') return false
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  return !token || token === DEMO_TOKEN_VALUE
}

// Types
export type RequestType = 'bug' | 'feature'
export type RequestStatus = 'open' | 'needs_triage' | 'triage_accepted' | 'feasibility_study' | 'fix_ready' | 'fix_complete' | 'unable_to_fix' | 'closed'
export type FeedbackType = 'positive' | 'negative'
export type NotificationType = 'issue_created' | 'triage_accepted' | 'feasibility_study' | 'fix_ready' | 'fix_complete' | 'unable_to_fix' | 'closed' | 'feedback_received' | 'pr_created' | 'preview_ready' | 'pr_merged' | 'pr_closed'

export interface FeatureRequest {
  id: string
  user_id: string
  /** GitHub login of the issue author (for queue items from GitHub) */
  github_login?: string
  title: string
  description: string
  request_type: RequestType
  /** Which repo this issue was filed against (console or docs) */
  target_repo?: TargetRepo
  github_issue_number?: number
  github_issue_url?: string
  status: RequestStatus
  pr_number?: number
  pr_url?: string
  copilot_session_url?: string
  netlify_preview_url?: string
  /** Latest comment from GitHub (used for unable_to_fix status) */
  latest_comment?: string
  /** True if closed by the user themselves, false if closed externally */
  closed_by_user?: boolean
  created_at: string
  updated_at?: string
  /** Number of screenshots successfully uploaded to GitHub (only in create response) */
  screenshots_uploaded?: number
  /** Number of screenshots that failed to upload (only in create response) */
  screenshots_failed?: number
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
  action_url?: string // URL to GitHub issue, PR, or preview
}

/** Target repository for issue creation */
export type TargetRepo = 'console' | 'docs'

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
  agent_connection_status?: string
  agent_connection_failures?: number
  agent_last_error?: string
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
  /** Base64 data-URI screenshots to upload and embed in the GitHub issue */
  screenshots?: string[]
  /** Recent browser console errors captured automatically for bug reports */
  console_errors?: ConsoleError[]
  /** Recent failed API calls (4xx/5xx) captured automatically */
  failed_api_calls?: FailedApiCall[]
  /** Agent and browser diagnostics for debugging */
  diagnostics?: DiagnosticInfo
}

export interface SubmitFeedbackInput {
  feedback_type: FeedbackType
  comment?: string
}

// Status display helpers
export const STATUS_LABELS: Record<RequestStatus, string> = {
  open: 'Open',
  needs_triage: 'Needs Triage',
  triage_accepted: 'Triage Accepted',
  feasibility_study: 'AI Working',
  fix_ready: 'Fix Ready',
  fix_complete: 'Fix Complete',
  unable_to_fix: 'Needs Human Review',
  closed: 'Closed' }

export const STATUS_COLORS: Record<RequestStatus, string> = {
  open: 'bg-blue-500',
  needs_triage: 'bg-yellow-500',
  triage_accepted: 'bg-cyan-500',
  feasibility_study: 'bg-purple-500',
  fix_ready: 'bg-green-500',
  fix_complete: 'bg-green-500',
  unable_to_fix: 'bg-orange-500',
  closed: 'bg-gray-400' }

export const STATUS_DESCRIPTIONS: Record<RequestStatus, string> = {
  open: 'Issue created on GitHub',
  needs_triage: 'Awaiting review by the team',
  triage_accepted: 'Accepted and queued for AI analysis',
  feasibility_study: 'AI coding agent is analyzing and working on a fix',
  fix_ready: 'PR created and ready for review',
  fix_complete: 'Fix has been merged',
  unable_to_fix: 'Requires human developer review',
  closed: 'This request has been closed' }

/** Get status description, hiding it for user-closed items (badge is sufficient) */
export function getStatusDescription(status: RequestStatus, closedByUser?: boolean): string {
  if (status === 'closed' && closedByUser) {
    return ''
  }
  return STATUS_DESCRIPTIONS[status]
}


// Demo mode mock data
const DEMO_FEATURE_REQUESTS: FeatureRequest[] = [
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
    created_at: new Date(Date.now() - 3 * MS_PER_DAY).toISOString() },
  {
    id: 'demo-2',
    user_id: 'demo-user',
    title: 'Dashboard not loading cluster data',
    description: 'The dashboard shows a loading spinner but never loads the cluster data.',
    request_type: 'bug',
    github_issue_number: 56,
    github_issue_url: 'https://github.com/kubestellar/console/issues/56',
    status: 'feasibility_study',
    created_at: new Date(Date.now() - 1 * MS_PER_DAY).toISOString() },
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
    created_at: new Date(Date.now() - 7 * MS_PER_DAY).toISOString() },
]

const INITIAL_DEMO_NOTIFICATIONS: Notification[] = [
  {
    id: 'demo-notif-1',
    user_id: 'demo-user',
    feature_request_id: 'demo-1',
    notification_type: 'fix_ready',
    title: 'PR Ready: Add dark mode toggle',
    message: 'A pull request has been created for your feature request.',
    read: false,
    created_at: new Date(Date.now() - 2 * MS_PER_HOUR).toISOString(),
    action_url: 'https://github.com/kubestellar/console/pull/87' },
  {
    id: 'demo-notif-2',
    user_id: 'demo-user',
    feature_request_id: 'demo-3',
    notification_type: 'fix_complete',
    title: 'Merged: Export dashboard as PDF',
    message: 'Your feature request has been implemented and merged.',
    read: true,
    created_at: new Date(Date.now() - 5 * MS_PER_DAY).toISOString(),
    action_url: 'https://github.com/kubestellar/console/pull/72' },
]

// Mutable demo notifications state (persists across hook instances in demo mode)
let demoNotificationsState: Notification[] | null = null

function getDemoNotifications(): Notification[] {
  if (demoNotificationsState === null) {
    // Initialize from the initial demo data (deep copy to avoid mutation of original)
    demoNotificationsState = INITIAL_DEMO_NOTIFICATIONS.map(n => ({ ...n }))
  }
  return demoNotificationsState
}

// @ts-expect-error Reserved for future use
function __updateDemoNotifications(updater: (prev: Notification[]) => Notification[]): Notification[] {
  demoNotificationsState = updater(getDemoNotifications())
  return demoNotificationsState
}

// Sort requests: user's issues first by date (desc), then others by date (desc)
function sortRequests(requests: FeatureRequest[], currentGitHubLogin: string): FeatureRequest[] {
  const userRequests: FeatureRequest[] = []
  const otherRequests: FeatureRequest[] = []

  for (const r of (requests || [])) {
    // Compare by github_login if available (for queue items), otherwise by user_id
    const isOwner = r.github_login
      ? r.github_login === currentGitHubLogin
      : r.user_id === currentGitHubLogin
    if (isOwner) {
      userRequests.push(r)
    } else {
      otherRequests.push(r)
    }
  }

  // Sort by date descending (newest first)
  const sortByDate = (a: FeatureRequest, b: FeatureRequest) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()

  userRequests.sort(sortByDate)
  otherRequests.sort(sortByDate)

  return [...userRequests, ...otherRequests]
}

/**
 * PR #6518 item G — Options for useFeatureRequests.
 *
 * `countOnly`: when true, the hook passes `?count_only=true` to
 * `/api/feedback/queue`. The backend responds with a minimal payload of
 * {id, status} pairs per issue — no titles, bodies, PR URLs, etc. The
 * FeatureRequestButton navbar badge only needs the closed-ID set to filter
 * notifications, so it can avoid fetching the full queue on every page load.
 * Consumers that render queue items (FeatureRequestModal, etc.) must omit
 * this flag so they receive the full response.
 */
export interface UseFeatureRequestsOptions {
  countOnly?: boolean
}

/**
 * PR #6573 item B — Lean shape returned by the `?count_only=true` endpoint.
 * Only `id` and `status` are present; every other field on FeatureRequest is
 * guaranteed empty on the wire, so we use a dedicated type instead of
 * shoehorning the full FeatureRequest type onto a partial payload.
 */
export interface FeatureRequestSummary {
  id: string
  status: RequestStatus
}

// Feature Requests Hook
export function useFeatureRequests(currentUserId?: string, options?: UseFeatureRequestsOptions) {
  const [requests, setRequests] = useState<FeatureRequest[]>([])
  // PR #6573 item B — countOnly responses get their own lean-typed state
  // slot instead of being cast into FeatureRequest[]. The wire payload only
  // carries {id, status}, so every other field would be undefined on the
  // full type — a footgun for any consumer that wandered in expecting
  // title/description/etc. to be populated.
  const [summaries, setSummaries] = useState<FeatureRequestSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const isDemoMode = isDemoUser()
  const countOnly = options?.countOnly === true

  const loadRequests = useCallback(async () => {
    // In demo mode, use mock data
    if (isDemoUser()) {
      if (countOnly) {
        setSummaries(DEMO_FEATURE_REQUESTS.map(r => ({ id: r.id, status: r.status })))
      } else {
        const sorted = currentUserId ? sortRequests(DEMO_FEATURE_REQUESTS, currentUserId) : DEMO_FEATURE_REQUESTS
        setRequests(sorted)
      }
      setIsLoading(false)
      return
    }
    try {
      setIsLoading(true)
      if (countOnly) {
        // PR #6573 item B — lean endpoint returns {id, status} only. Type
        // it that way instead of pretending to hydrate a FeatureRequest[].
        const { data } = await api.get<FeatureRequestSummary[]>('/api/feedback/queue?count_only=true')
        setSummaries(Array.isArray(data) ? data : [])
      } else {
        const { data } = await api.get<FeatureRequest[]>('/api/feedback/queue')
        const safeData = Array.isArray(data) ? data : []
        const sorted = currentUserId ? sortRequests(safeData, currentUserId) : safeData
        setRequests(sorted)
      }
      setError(null)
    } catch {
      // Silently fail - backend may be unavailable in demo mode
    } finally {
      setIsLoading(false)
    }
  }, [currentUserId, countOnly])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  // Polling for status updates (every 30 seconds) - skip in demo mode
  useEffect(() => {
    if (isDemoUser()) return

    const interval = setInterval(() => {
      // Only poll if there are pending requests
      const hasPending = requests.some(r =>
        r.status !== 'closed' && r.status !== 'fix_complete'
      )
      if (hasPending) {
        loadRequests()
      }
    }, CACHE_TTL_MS)

    return () => clearInterval(interval)
  }, [requests, loadRequests])

  // Refresh function with loading indicator (minimum 500ms to show animation)
  const refresh = async () => {
    setIsRefreshing(true)
    const minDelay = new Promise(resolve => setTimeout(resolve, MIN_PERCEIVED_DELAY_MS))
    await Promise.all([loadRequests(), minDelay])
    setIsRefreshing(false)
  }

  const createRequest = async (input: CreateFeatureRequestInput, options?: { timeout?: number }) => {
    try {
      setIsSubmitting(true)
      // Attach the per-user client credential so the backend can route
      // through the attribution proxy. The header name is intentionally
      // non-descriptive (do not rename to anything auth-suggestive).
      const { getClientCtx } = await import('../lib/clientCtx')
      const ctx = getClientCtx()
      const mergedOpts = ctx
        ? { ...(options ?? {}), headers: { ...(options as { headers?: Record<string, string> })?.headers, 'X-KC-Client-Auth': ctx } }
        : options
      const { data } = await api.post<FeatureRequest>('/api/feedback/requests', input, mergedOpts)
      setRequests(prev => [data, ...prev])
      return data
    } catch (err: unknown) {
      if (err instanceof RateLimitError) {
        throw new Error('Too many requests — please wait a moment and try again.')
      }
      throw err
    } finally {
      setIsSubmitting(false)
    }
  }

  const getRequest = async (id: string) => {
    const { data } = await api.get<FeatureRequest>(`/api/feedback/requests/${id}`)
    return data
  }

  const submitFeedback = async (requestId: string, input: SubmitFeedbackInput) => {
    const { data } = await api.post<PRFeedback>(`/api/feedback/requests/${requestId}/feedback`, input)
    return data
  }

  const requestUpdate = async (requestId: string) => {
    const { data } = await api.post<FeatureRequest>(`/api/feedback/requests/${requestId}/request-update`)
    // Refresh the request in the list
    setRequests(prev => prev.map(r => r.id === requestId ? data : r))
    return data
  }

  const closeRequest = async (requestId: string) => {
    const { data } = await api.post<FeatureRequest>(`/api/feedback/requests/${requestId}/close`)
    // Update the request in the list
    setRequests(prev => prev.map(r => r.id === requestId ? data : r))
    return data
  }

  return {
    requests,
    // PR #6573 item B — populated only when `countOnly` option is set.
    // Consumers that passed countOnly should read `summaries`; consumers
    // that need the full queue should read `requests`.
    summaries,
    isLoading,
    isRefreshing,
    error,
    isSubmitting,
    isDemoMode,
    loadRequests,
    refresh,
    createRequest,
    getRequest,
    submitFeedback,
    requestUpdate,
    closeRequest }
}

// Notifications Hook
export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const pollingRef = useRef<number | null>(null)

  // Get unread count for a specific feature request
  const getUnreadCountForRequest = useCallback((featureRequestId: string): number => {
    return notifications.filter(n =>
      n.feature_request_id === featureRequestId && !n.read
    ).length
  }, [notifications])

  // Mark all notifications for a specific feature request as read
  const markRequestNotificationsAsRead = async (featureRequestId: string) => {
    // Get unread notifications for this request
    const unreadForRequest = notifications.filter(n =>
      n.feature_request_id === featureRequestId && !n.read
    )

    if (unreadForRequest.length === 0) return

    // In demo mode, just update local state
    if (isDemoUser()) {
      setNotifications(prev =>
        prev.map(n => n.feature_request_id === featureRequestId ? { ...n, read: true } : n)
      )
      setUnreadCount(prev => Math.max(0, prev - unreadForRequest.length))
      return
    }

    // Mark each notification as read
    await Promise.all(unreadForRequest.map(n =>
      api.post(`/api/notifications/${n.id}/read`)
    ))
    setNotifications(prev =>
      prev.map(n => n.feature_request_id === featureRequestId ? { ...n, read: true } : n)
    )
    setUnreadCount(prev => Math.max(0, prev - unreadForRequest.length))
  }

  const loadNotifications = useCallback(async () => {
    // In demo mode, use mutable demo data
    if (isDemoUser()) {
      setNotifications([...getDemoNotifications()])
      return
    }
    try {
      const { data } = await api.get<Notification[]>('/api/notifications')
      setNotifications(Array.isArray(data) ? data : [])
    } catch {
      // Silently fail - backend may be unavailable
    }
  }, [])

  const loadUnreadCount = useCallback(async () => {
    // In demo mode, calculate from mutable demo data
    if (isDemoUser()) {
      setUnreadCount(getDemoNotifications().filter(n => !n.read).length)
      return
    }
    try {
      const { data } = await api.get<{ count: number }>('/api/notifications/unread-count')
      setUnreadCount(data.count)
    } catch {
      // Silently fail - backend may be unavailable
    }
  }, [])

  const loadAll = useCallback(async () => {
    setIsLoading(true)
    await Promise.all([loadNotifications(), loadUnreadCount()])
    setIsLoading(false)
  }, [loadNotifications, loadUnreadCount])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Poll for new notifications every 30 seconds - skip in demo mode
  useEffect(() => {
    if (isDemoUser()) return

    pollingRef.current = window.setInterval(() => {
      loadUnreadCount()
      loadNotifications()
    }, CACHE_TTL_MS)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [loadUnreadCount, loadNotifications])

  const markAsRead = async (id: string) => {
    // In demo mode, just update local state
    if (isDemoUser()) {
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: true } : n))
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
      return
    }
    await api.post(`/api/notifications/${id}/read`)
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    )
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  const markAllAsRead = async () => {
    // In demo mode, just update local state
    if (isDemoUser()) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
      return
    }
    await api.post('/api/notifications/read-all')
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  // Refresh function with loading indicator (minimum 500ms to show animation)
  const refresh = async () => {
    setIsRefreshing(true)
    const minDelay = new Promise(resolve => setTimeout(resolve, MIN_PERCEIVED_DELAY_MS))
    await Promise.all([loadAll(), minDelay])
    setIsRefreshing(false)
  }

  return {
    notifications,
    unreadCount,
    isLoading,
    isRefreshing,
    loadNotifications,
    loadUnreadCount,
    markAsRead,
    markAllAsRead,
    refresh,
    getUnreadCountForRequest,
    markRequestNotificationsAsRead }
}

// Combined hook for convenience
export function useFeedback() {
  const featureRequests = useFeatureRequests()
  const notifications = useNotifications()

  return {
    ...featureRequests,
    notifications: notifications.notifications,
    unreadCount: notifications.unreadCount,
    notificationsLoading: notifications.isLoading,
    notificationsRefreshing: notifications.isRefreshing,
    markNotificationAsRead: notifications.markAsRead,
    markAllNotificationsAsRead: notifications.markAllAsRead,
    refreshNotifications: notifications.refresh }
}
