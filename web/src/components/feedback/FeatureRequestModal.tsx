import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Bug, Sparkles, Loader2, ExternalLink, Bell, Check, Clock, GitPullRequest, Eye, RefreshCw, MessageSquare, AlertTriangle } from 'lucide-react'
import {
  useFeatureRequests,
  useNotifications,
  STATUS_LABELS,
  STATUS_DESCRIPTIONS,
  isTriaged,
  type RequestType,
  type RequestStatus,
  type Notification,
  type NotificationType,
} from '../../hooks/useFeatureRequests'
import { useAuth } from '../../lib/auth'

interface FeatureRequestModalProps {
  isOpen: boolean
  onClose: () => void
}

type TabType = 'submit' | 'updates'

// Format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

// Get icon for notification type
function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case 'issue_created':
      return <Bug className="w-4 h-4 text-blue-400" />
    case 'triage_accepted':
      return <Check className="w-4 h-4 text-cyan-400" />
    case 'feasibility_study':
      return <Clock className="w-4 h-4 text-purple-400" />
    case 'fix_ready':
      return <GitPullRequest className="w-4 h-4 text-green-400" />
    case 'fix_complete':
      return <Check className="w-4 h-4 text-emerald-400" />
    case 'unable_to_fix':
      return <AlertTriangle className="w-4 h-4 text-orange-400" />
    case 'closed':
      return <X className="w-4 h-4 text-gray-400" />
    case 'feedback_received':
      return <Sparkles className="w-4 h-4 text-yellow-400" />
    default:
      return <Bell className="w-4 h-4 text-muted-foreground" />
  }
}

// Get status label and color for notification type
function getNotificationStatus(type: NotificationType): { label: string; color: string; bgColor: string } {
  switch (type) {
    case 'issue_created':
      return { label: 'Issue Created', color: 'text-blue-400', bgColor: 'bg-blue-500/20' }
    case 'triage_accepted':
      return { label: 'Triage Accepted', color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' }
    case 'feasibility_study':
      return { label: 'Claude Working', color: 'text-purple-400', bgColor: 'bg-purple-500/20' }
    case 'fix_ready':
      return { label: 'PR Ready', color: 'text-green-400', bgColor: 'bg-green-500/20' }
    case 'fix_complete':
      return { label: 'Merged', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' }
    case 'unable_to_fix':
      return { label: 'Needs Human', color: 'text-orange-400', bgColor: 'bg-orange-500/20' }
    case 'closed':
      return { label: 'Closed', color: 'text-gray-400', bgColor: 'bg-gray-500/20' }
    case 'feedback_received':
      return { label: 'Feedback', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' }
    default:
      return { label: 'Update', color: 'text-muted-foreground', bgColor: 'bg-secondary' }
  }
}

// Get status display info
function getStatusInfo(status: RequestStatus, closedByUser?: boolean): { label: string; color: string; bgColor: string } {
  const colors: Record<RequestStatus, { color: string; bgColor: string }> = {
    open: { color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
    needs_triage: { color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
    triage_accepted: { color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' },
    feasibility_study: { color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
    fix_ready: { color: 'text-green-400', bgColor: 'bg-green-500/20' },
    fix_complete: { color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
    unable_to_fix: { color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
    closed: { color: 'text-gray-400', bgColor: 'bg-gray-500/20' },
  }
  // Show different label for closed status based on who closed it
  let label = STATUS_LABELS[status]
  if (status === 'closed' && closedByUser) {
    label = 'Closed by You'
  }
  return { label, ...colors[status] }
}

export function FeatureRequestModal({ isOpen, onClose }: FeatureRequestModalProps) {
  const { user, isAuthenticated, token } = useAuth()
  const currentGitHubLogin = user?.github_login || ''
  const { createRequest, isSubmitting, requests, isLoading: requestsLoading, isRefreshing: requestsRefreshing, refresh: refreshRequests, requestUpdate, closeRequest, isDemoMode: _isDemoMode } = useFeatureRequests(currentGitHubLogin)
  const { notifications, unreadCount, markAsRead, markAllAsRead, isLoading: notificationsLoading, isRefreshing: notificationsRefreshing, refresh: refreshNotifications } = useNotifications()
  const isRefreshing = requestsRefreshing || notificationsRefreshing
  // User can't perform actions if not authenticated or if using demo token
  const canPerformActions = isAuthenticated && token !== 'demo-token'
  const [activeTab, setActiveTab] = useState<TabType>('submit')
  const [updatesSubTab, setUpdatesSubTab] = useState<'requests' | 'activity'>('requests')
  const [requestType, setRequestType] = useState<RequestType>('bug')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ issueUrl?: string } | null>(null)
  const [confirmClose, setConfirmClose] = useState<string | null>(null) // request ID to confirm close
  const [actionLoading, setActionLoading] = useState<string | null>(null) // request ID being acted on
  const [actionError, setActionError] = useState<string | null>(null)
  const [showLoginPrompt, setShowLoginPrompt] = useState(false)

  const handleLoginRedirect = () => {
    // Clear demo token and redirect to GitHub login via backend
    localStorage.removeItem('token')
    // Use full backend URL to ensure proper OAuth flow
    window.location.href = 'http://localhost:8080/auth/github'
  }

  const handleRequestUpdate = async (requestId: string) => {
    try {
      setActionLoading(requestId)
      setActionError(null)
      await requestUpdate(requestId)
      // requestUpdate already updates local state in-place, no need for full refresh
    } catch (err) {
      console.error('Failed to request update:', err)
      setActionError('Failed to request update')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCloseRequest = async (requestId: string) => {
    try {
      setActionLoading(requestId)
      setActionError(null)
      await closeRequest(requestId)
      setConfirmClose(null)
      // closeRequest already updates local state in-place, no need for full refresh
    } catch (err) {
      console.error('Failed to close request:', err)
      setActionError('Failed to close request')
    } finally {
      setActionLoading(null)
    }
  }

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (title.length < 5) {
      setError('Title must be at least 5 characters')
      return
    }
    if (description.length < 10) {
      setError('Description must be at least 10 characters')
      return
    }

    try {
      const result = await createRequest({
        title,
        description,
        request_type: requestType,
      })
      setSuccess({ issueUrl: result.github_issue_url })
      // Reset form after short delay
      setTimeout(() => {
        setTitle('')
        setDescription('')
        setRequestType('bug')
        setSuccess(null)
        onClose()
      }, 3000)
    } catch (err) {
      setError('Failed to submit request. Please try again.')
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setTitle('')
      setDescription('')
      setRequestType('bug')
      setError(null)
      setSuccess(null)
      setActiveTab('submit')
      onClose()
    }
  }

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id)
    }
    // Open the action URL in a new tab if available
    if (notification.action_url) {
      window.open(notification.action_url, '_blank', 'noopener,noreferrer')
    }
  }

  const modalContent = (
    <>
      {/* Login Prompt Dialog */}
      {showLoginPrompt && (
        <>
          <div
            className="fixed inset-0 bg-black/70 z-[10001]"
            onClick={() => setShowLoginPrompt(false)}
          />
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 pointer-events-none">
            <div
              className="bg-background border border-border rounded-lg shadow-xl p-6 max-w-sm w-full pointer-events-auto"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Login Required
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Please login with GitHub to submit feedback, request updates, or close requests.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowLoginPrompt(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLoginRedirect}
                  className="px-4 py-2 text-sm rounded-lg bg-purple-500 hover:bg-purple-600 text-white transition-colors"
                >
                  Login with GitHub
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[9999]"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[9999] overflow-y-auto pointer-events-none">
        <div className="flex min-h-full items-start justify-center p-4 pt-20">
          <div
            className="bg-background border border-border rounded-lg shadow-xl w-full max-w-lg my-8 pointer-events-auto"
            onClick={e => e.stopPropagation()}
          >
          {/* Header */}
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              Feedback
            </h2>
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="p-1 rounded hover:bg-secondary/50 text-muted-foreground disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('submit')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'submit'
                  ? 'text-foreground border-b-2 border-purple-500'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Submit Feedback
            </button>
            <button
              onClick={() => setActiveTab('updates')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'updates'
                  ? 'text-foreground border-b-2 border-purple-500'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Updates
              {unreadCount > 0 && (
                <span className="min-w-5 h-5 px-1 text-xs rounded-full bg-purple-500 text-white flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          {/* Login banner for demo/unauthenticated users */}
          {!canPerformActions && (
            <button
              onClick={() => setShowLoginPrompt(true)}
              className="w-full px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between hover:bg-amber-500/20 transition-colors cursor-pointer"
            >
              <span className="text-xs text-amber-400">
                Login with GitHub to submit feedback and manage requests
              </span>
              <span className="text-xs px-2 py-1 rounded bg-amber-500/20 text-amber-400">
                Login
              </span>
            </button>
          )}

          {/* Content */}
          {activeTab === 'updates' ? (
            /* Updates Tab */
            <div>
              {/* Sub-tabs for Queue vs Activity */}
              <div className="flex border-b border-border/50">
                <button
                  onClick={() => setUpdatesSubTab('requests')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                    updatesSubTab === 'requests'
                      ? 'text-foreground border-b-2 border-purple-500 -mb-px'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Queue ({requests.length})
                </button>
                <button
                  onClick={() => setUpdatesSubTab('activity')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                    updatesSubTab === 'activity'
                      ? 'text-foreground border-b-2 border-purple-500 -mb-px'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Activity
                  {unreadCount > 0 && (
                    <span className="min-w-4 h-4 px-1 text-[10px] rounded-full bg-purple-500 text-white flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Actions header */}
              <div className="p-2 border-b border-border/50 flex items-center justify-between">
                {actionError ? (
                  <span className="text-xs text-red-400">{actionError}</span>
                ) : (
                  <span />
                )}
                <button
                  onClick={() => {
                    setActionError(null)
                    refreshRequests()
                    refreshNotifications()
                  }}
                  disabled={isRefreshing}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50"
                  title="Refresh"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto">
                {updatesSubTab === 'requests' ? (
                  /* Request Queue Sub-tab */
                  requestsLoading && requests.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
                      <p className="text-sm">Loading...</p>
                    </div>
                  ) : requests.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <Bug className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No requests in queue</p>
                      <p className="text-xs mt-1">Submit a bug report or feature request to get started</p>
                    </div>
                  ) : (
                    requests.map(request => {
                      const statusInfo = getStatusInfo(request.status, request.closed_by_user)
                      const isLoading = actionLoading === request.id
                      const showConfirm = confirmClose === request.id
                      // Check ownership by github_login (for queue items) or user_id
                      const isOwnedByUser = request.github_login
                        ? request.github_login === currentGitHubLogin
                        : request.user_id === currentGitHubLogin
                      // Blur untriaged issues that aren't owned by the current user
                      const shouldBlur = !isTriaged(request.status) && !isOwnedByUser
                      return (
                        <div
                          key={request.id}
                          className="p-3 border-b border-border/50 hover:bg-secondary/30 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                                  request.request_type === 'bug' ? 'bg-red-500/20 text-red-400' : 'bg-purple-500/20 text-purple-400'
                                }`}>
                                  {request.request_type === 'bug' ? 'Bug' : 'Feature'}
                                </span>
                                {request.github_issue_number && (
                                  <span className="text-xs text-muted-foreground">
                                    #{request.github_issue_number}
                                  </span>
                                )}
                                {isOwnedByUser && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-500/20 text-blue-400">
                                    Yours
                                  </span>
                                )}
                              </div>
                              <p className={`text-sm font-medium text-foreground mt-1 truncate ${shouldBlur ? 'blur-sm select-none' : ''}`}>
                                {request.title}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${statusInfo.bgColor} ${statusInfo.color}`}>
                                  {statusInfo.label}
                                </span>
                                <span className={`text-xs text-muted-foreground ${shouldBlur ? 'blur-sm select-none' : ''}`}>
                                  {STATUS_DESCRIPTIONS[request.status]}
                                </span>
                              </div>
                              {/* Show PR link if fix is ready or complete */}
                              {(request.status === 'fix_ready' || request.status === 'fix_complete') && request.pr_url && (
                                <a
                                  href={request.pr_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`text-xs flex items-center gap-1 mt-1.5 ${
                                    request.status === 'fix_complete'
                                      ? 'text-emerald-400 hover:text-emerald-300'
                                      : 'text-green-400 hover:text-green-300'
                                  }`}
                                  onClick={e => e.stopPropagation()}
                                >
                                  <GitPullRequest className="w-3 h-3" />
                                  {request.status === 'fix_complete' ? 'View Merged PR' : 'View PR'} #{request.pr_number}
                                </a>
                              )}
                              {/* Show latest comment if unable to fix */}
                              {request.status === 'unable_to_fix' && request.latest_comment && (
                                <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-muted-foreground">
                                  <div className="flex items-center gap-1 text-red-400 mb-1">
                                    <MessageSquare className="w-3 h-3" />
                                    <span className="font-medium">Reason:</span>
                                  </div>
                                  <p className="line-clamp-3">{request.latest_comment}</p>
                                </div>
                              )}
                              {/* Show preview link if available */}
                              {request.netlify_preview_url && (
                                <a
                                  href={request.netlify_preview_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 mt-1"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <Eye className="w-3 h-3" />
                                  Preview Fix
                                </a>
                              )}
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatRelativeTime(request.created_at)}
                                </span>
                                {request.github_issue_url && (
                                  <a
                                    href={request.github_issue_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    GitHub
                                  </a>
                                )}
                              </div>
                              {/* Actions - only show for user's own active requests (not closed or fix_complete) */}
                              {isOwnedByUser && request.status !== 'closed' && request.status !== 'fix_complete' && (
                                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
                                  {!canPerformActions ? (
                                    /* Not authenticated or demo mode - show login prompts */
                                    <>
                                      <button
                                        onClick={() => setShowLoginPrompt(true)}
                                        className="px-2 py-1 text-xs rounded bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors flex items-center gap-1"
                                        title="Please login to request updates"
                                      >
                                        <RefreshCw className="w-3 h-3" />
                                        Request Update
                                      </button>
                                      <button
                                        onClick={() => setShowLoginPrompt(true)}
                                        className="px-2 py-1 text-xs rounded text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                                        title="Please login to close requests"
                                      >
                                        Close
                                      </button>
                                    </>
                                  ) : showConfirm ? (
                                    <>
                                      <span className="text-xs text-muted-foreground">Close this request?</span>
                                      <button
                                        onClick={() => handleCloseRequest(request.id)}
                                        disabled={isLoading}
                                        className="px-2 py-1 text-xs rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors disabled:opacity-50"
                                      >
                                        {isLoading ? 'Closing...' : 'Confirm'}
                                      </button>
                                      <button
                                        onClick={() => setConfirmClose(null)}
                                        className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 text-muted-foreground transition-colors"
                                      >
                                        Cancel
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => handleRequestUpdate(request.id)}
                                        disabled={isLoading}
                                        className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 text-foreground transition-colors flex items-center gap-1 disabled:opacity-50"
                                      >
                                        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                        Request Update
                                      </button>
                                      <button
                                        onClick={() => setConfirmClose(request.id)}
                                        className="px-2 py-1 text-xs rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                      >
                                        Close
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )
                ) : (
                  /* Activity Sub-tab */
                  <>
                    {unreadCount > 0 && (
                      <div className="p-2 border-b border-border/50 flex items-center justify-end">
                        <button
                          onClick={() => markAllAsRead()}
                          className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                          Mark all read
                        </button>
                      </div>
                    )}
                    {notificationsLoading && notifications.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
                        <p className="text-sm">Loading...</p>
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No activity yet</p>
                        <p className="text-xs mt-1">Updates will appear here</p>
                      </div>
                    ) : (
                      notifications.map(notification => {
                        const status = getNotificationStatus(notification.notification_type)
                        return (
                          <div
                            key={notification.id}
                            onClick={() => handleNotificationClick(notification)}
                            className={`p-3 border-b border-border/50 hover:bg-secondary/30 cursor-pointer transition-colors ${
                              !notification.read ? 'bg-purple-500/5' : ''
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5">
                                {getNotificationIcon(notification.notification_type)}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-sm font-medium truncate ${
                                    notification.read ? 'text-muted-foreground' : 'text-foreground'
                                  }`}>
                                    {notification.title}
                                  </span>
                                  <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${status.bgColor} ${status.color}`}>
                                    {status.label}
                                  </span>
                                  {!notification.read && (
                                    <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                  {notification.message}
                                </p>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatRelativeTime(notification.created_at)}
                                  </span>
                                  {notification.action_url && (
                                    <span className="text-xs text-purple-400 flex items-center gap-1">
                                      <ExternalLink className="w-3 h-3" />
                                      View on GitHub
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </>
                )}
              </div>
            </div>
          ) : success ? (
            <div className="p-6 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-green-400" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                Request Submitted!
              </h3>
              <p className="text-sm text-muted-foreground mb-2">
                Your request has been submitted for review.
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Once a maintainer approves your request, it will appear in "My Requests"
                and our AI will start working on a fix.
              </p>
              {success.issueUrl && (
                <a
                  href={success.issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300"
                >
                  View on GitHub
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="p-4 space-y-4">
                {/* Type Selection */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRequestType('bug')}
                    className={`flex-1 p-3 rounded-lg border transition-colors flex items-center justify-center gap-2 ${
                      requestType === 'bug'
                        ? 'bg-red-500/20 border-red-500/50 text-red-400'
                        : 'border-border text-muted-foreground hover:border-muted-foreground'
                    }`}
                  >
                    <Bug className="w-4 h-4" />
                    Bug Report
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequestType('feature')}
                    className={`flex-1 p-3 rounded-lg border transition-colors flex items-center justify-center gap-2 ${
                      requestType === 'feature'
                        ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
                        : 'border-border text-muted-foreground hover:border-muted-foreground'
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    Feature Request
                  </button>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder={
                      requestType === 'bug'
                        ? 'e.g., Dashboard not loading cluster data'
                        : 'e.g., Add dark mode toggle to settings'
                    }
                    className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    disabled={isSubmitting}
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder={
                      requestType === 'bug'
                        ? 'Describe what happened, what you expected, and steps to reproduce...'
                        : 'Describe the feature you would like to see and why it would be useful...'
                    }
                    rows={5}
                    className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
                    disabled={isSubmitting}
                  />
                </div>

                {/* Error */}
                {error && (
                  <p className="text-sm text-red-400">{error}</p>
                )}

                {/* Info */}
                <p className="text-xs text-muted-foreground">
                  Your request will be reviewed by a maintainer before being analyzed
                  by our AI. Once approved, the AI will attempt to create a fix
                  automatically and you'll receive a notification when ready.
                </p>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                {canPerformActions ? (
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 text-sm rounded-lg bg-purple-500 hover:bg-purple-600 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Submit'
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowLoginPrompt(true)}
                    className="px-4 py-2 text-sm rounded-lg bg-purple-500 hover:bg-purple-600 text-white transition-colors flex items-center gap-2"
                    title="Please login to submit feedback"
                  >
                    Login to Submit
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
        </div>
      </div>
    </>
  )

  return createPortal(modalContent, document.body)
}
