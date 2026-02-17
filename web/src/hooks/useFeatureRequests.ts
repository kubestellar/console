import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'
import { STORAGE_KEY_TOKEN } from '../lib/constants'

// Check if user is in demo mode — no token or explicit demo-token
function isDemoUser(): boolean {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  return !token || token === 'demo-token'
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

export interface CreateFeatureRequestInput {
  title: string
  description: string
  request_type: RequestType
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
  closed: 'Closed',
}

export const STATUS_COLORS: Record<RequestStatus, string> = {
  open: 'bg-blue-500',
  needs_triage: 'bg-yellow-500',
  triage_accepted: 'bg-cyan-500',
  feasibility_study: 'bg-purple-500',
  fix_ready: 'bg-green-500',
  fix_complete: 'bg-emerald-500',
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
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
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
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
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
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
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
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
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
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    action_url: 'https://github.com/kubestellar/console/pull/72',
  },
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

// @ts-ignore Reserved for future use
function _updateDemoNotifications(updater: (prev: Notification[]) => Notification[]): Notification[] {
  demoNotificationsState = updater(getDemoNotifications())
  return demoNotificationsState
}

// Sort requests: user's issues first by date (desc), then others by date (desc)
function sortRequests(requests: FeatureRequest[], currentGitHubLogin: string): FeatureRequest[] {
  const userRequests: FeatureRequest[] = []
  const otherRequests: FeatureRequest[] = []

  for (const r of requests) {
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

// Feature Requests Hook
export function useFeatureRequests(currentUserId?: string) {
  const [requests, setRequests] = useState<FeatureRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const isDemoMode = isDemoUser()

  const loadRequests = useCallback(async () => {
    // In demo mode, use mock data
    if (isDemoUser()) {
      const sorted = currentUserId ? sortRequests(DEMO_FEATURE_REQUESTS, currentUserId) : DEMO_FEATURE_REQUESTS
      setRequests(sorted)
      setIsLoading(false)
      return
    }
    try {
      setIsLoading(true)
      // Fetch from queue endpoint to get all issues
      const { data } = await api.get<FeatureRequest[]>('/api/feedback/queue')
      // Sort: user's issues first, then others, both by date
      const sorted = currentUserId ? sortRequests(data || [], currentUserId) : (data || [])
      setRequests(sorted)
      setError(null)
    } catch {
      // Silently fail - backend may be unavailable in demo mode
    } finally {
      setIsLoading(false)
    }
  }, [currentUserId])

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
    }, 30000)

    return () => clearInterval(interval)
  }, [requests, loadRequests])

  // Refresh function with loading indicator (minimum 500ms to show animation)
  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    const minDelay = new Promise(resolve => setTimeout(resolve, 500))
    await Promise.all([loadRequests(), minDelay])
    setIsRefreshing(false)
  }, [loadRequests])

  const createRequest = useCallback(async (input: CreateFeatureRequestInput) => {
    try {
      setIsSubmitting(true)
      const { data } = await api.post<FeatureRequest>('/api/feedback/requests', input)
      setRequests(prev => [data, ...prev])
      return data
    } catch (err) {
      // Silently fail - backend may be unavailable
      throw err
    } finally {
      setIsSubmitting(false)
    }
  }, [])

  const getRequest = useCallback(async (id: string) => {
    try {
      const { data } = await api.get<FeatureRequest>(`/api/feedback/requests/${id}`)
      return data
    } catch (err) {
      // Silently fail - backend may be unavailable
      throw err
    }
  }, [])

  const submitFeedback = useCallback(async (requestId: string, input: SubmitFeedbackInput) => {
    try {
      const { data } = await api.post<PRFeedback>(`/api/feedback/requests/${requestId}/feedback`, input)
      return data
    } catch (err) {
      // Silently fail - backend may be unavailable
      throw err
    }
  }, [])

  const requestUpdate = useCallback(async (requestId: string) => {
    try {
      const { data } = await api.post<FeatureRequest>(`/api/feedback/requests/${requestId}/request-update`)
      // Refresh the request in the list
      setRequests(prev => prev.map(r => r.id === requestId ? data : r))
      return data
    } catch (err) {
      // Silently fail - backend may be unavailable
      throw err
    }
  }, [])

  const closeRequest = useCallback(async (requestId: string) => {
    try {
      const { data } = await api.post<FeatureRequest>(`/api/feedback/requests/${requestId}/close`)
      // Update the request in the list
      setRequests(prev => prev.map(r => r.id === requestId ? data : r))
      return data
    } catch (err) {
      // Silently fail - backend may be unavailable
      throw err
    }
  }, [])

  return {
    requests,
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
    closeRequest,
  }
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
  const markRequestNotificationsAsRead = useCallback(async (featureRequestId: string) => {
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
    try {
      await Promise.all(unreadForRequest.map(n =>
        api.post(`/api/notifications/${n.id}/read`)
      ))
      setNotifications(prev =>
        prev.map(n => n.feature_request_id === featureRequestId ? { ...n, read: true } : n)
      )
      setUnreadCount(prev => Math.max(0, prev - unreadForRequest.length))
    } catch (err) {
      // Silently fail - backend may be unavailable
      throw err
    }
  }, [notifications])

  const loadNotifications = useCallback(async () => {
    // In demo mode, use mutable demo data
    if (isDemoUser()) {
      setNotifications([...getDemoNotifications()])
      return
    }
    try {
      const { data } = await api.get<Notification[]>('/api/notifications')
      setNotifications(data || [])
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
    }, 30000)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [loadUnreadCount])

  const markAsRead = useCallback(async (id: string) => {
    // In demo mode, just update local state
    if (isDemoUser()) {
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: true } : n))
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
      return
    }
    try {
      await api.post(`/api/notifications/${id}/read`)
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: true } : n))
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (err) {
      // Silently fail - backend may be unavailable
      throw err
    }
  }, [])

  const markAllAsRead = useCallback(async () => {
    // In demo mode, just update local state
    if (isDemoUser()) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
      return
    }
    try {
      await api.post('/api/notifications/read-all')
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch (err) {
      // Silently fail - backend may be unavailable
      throw err
    }
  }, [])

  // Refresh function with loading indicator (minimum 500ms to show animation)
  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    const minDelay = new Promise(resolve => setTimeout(resolve, 500))
    await Promise.all([loadAll(), minDelay])
    setIsRefreshing(false)
  }, [loadAll])

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
    markRequestNotificationsAsRead,
  }
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
    refreshNotifications: notifications.refresh,
  }
}
