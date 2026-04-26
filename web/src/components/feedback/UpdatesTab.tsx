import { useState } from 'react'
import {
  X, Bug, Loader2, ExternalLink, Bell, Check, Clock,
  GitPullRequest, GitMerge, Eye, RefreshCw, MessageSquare,
  Lightbulb, AlertCircle, AlertTriangle, Trophy,
} from 'lucide-react'
import { Github, Linkedin } from '@/lib/icons'
import { StatusBadge } from '../ui/StatusBadge'
import { isTriaged } from '../../hooks/useFeatureRequests'
import type { FeatureRequest } from '../../hooks/useFeatureRequests'
import { emitLinkedInShare } from '../../lib/analytics'
import { BACKEND_DEFAULT_URL, FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { MS_PER_SECOND } from '../../lib/constants/time'
import { ContributorBanner } from '../rewards/ContributorLadder'
import { GITHUB_REWARD_LABELS } from '../../types/rewards'
import type { GitHubContribution } from '../../types/rewards'
import {
  formatRelativeTime,
  getStatusInfo,
  GitHubContributionIcon,
  PREVIEW_WARMUP_SECONDS,
} from './FeatureRequestTypes'
import type { PreviewResult } from './FeatureRequestTypes'
import { useTranslation } from 'react-i18next'
import { getStatusDescription } from '../../hooks/useFeatureRequests'

interface UpdatesTabProps {
  requests: FeatureRequest[]
  requestsLoading: boolean
  isRefreshing: boolean
  isInDemoMode: boolean
  canPerformActions: boolean
  currentGitHubLogin: string
  githubRewards: {
    breakdown?: {
      prs_merged: number
      prs_opened: number
      bug_issues: number
      feature_issues: number
      other_issues: number
    }
    contributions?: GitHubContribution[]
    from_cache?: boolean
    cached_at: string
  } | null
  githubPoints: number
  token: string | null
  showToast: (message: string, type: 'success' | 'error' | 'info') => void
  onRefreshRequests: () => void
  onRefreshNotifications: () => void
  onRefreshGitHub: () => void
  isGitHubRefreshing: boolean
  onRequestUpdate: (id: string) => Promise<unknown>
  onCloseRequest: (id: string) => Promise<unknown>
  getUnreadCountForRequest: (id: string) => number
  markRequestNotificationsAsRead: (id: string) => void
  onShowLoginPrompt: () => void
}


export function UpdatesTab({
  requests,
  requestsLoading,
  isRefreshing,
  isInDemoMode,
  canPerformActions,
  currentGitHubLogin,
  githubRewards,
  githubPoints,
  token,
  showToast,
  onRefreshRequests,
  onRefreshNotifications,
  onRefreshGitHub,
  isGitHubRefreshing,
  onRequestUpdate,
  onCloseRequest,
  getUnreadCountForRequest,
  markRequestNotificationsAsRead,
  onShowLoginPrompt,
}: UpdatesTabProps) {
  const { t } = useTranslation()
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState<string | null>(null)
  const [previewChecking, setPreviewChecking] = useState<number | null>(null)
  const [previewResults, setPreviewResults] = useState<Record<number, PreviewResult>>({})

  const handleRequestUpdate = async (requestId: string) => {
    try {
      setActionLoading(requestId)
      setActionError(null)
      await onRequestUpdate(requestId)
    } catch {
      const errorMsg = 'Failed to request update'
      setActionError(errorMsg)
      showToast(errorMsg, 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCloseRequest = async (requestId: string) => {
    try {
      setActionLoading(requestId)
      setActionError(null)
      await onCloseRequest(requestId)
      setConfirmClose(null)
    } catch {
      const errorMsg = 'Failed to close request'
      setActionError(errorMsg)
      showToast(errorMsg, 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCheckPreview = async (prNumber: number) => {
    setPreviewChecking(prNumber)
    try {
      const headers: Record<string, string> = {}
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
      const res = await fetch(`${BACKEND_DEFAULT_URL}/api/feedback/preview/${prNumber}`, {
        headers,
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (res.ok) {
        const data = await res.json()
        setPreviewResults(prev => ({ ...prev, [prNumber]: data }))
      }
    } catch {
      setPreviewResults(prev => ({ ...prev, [prNumber]: { status: 'error', message: 'Failed to check' } }))
    } finally {
      setPreviewChecking(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {isInDemoMode && (
        <div
          role="status"
          className="flex items-start gap-2 border-b border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400"
        >
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            {t('feedback.demoDataBanner')}
          </span>
        </div>
      )}
      {/* Contributor banner */}
      <ContributorBanner />

      {/* Link to full leaderboard on docs site */}
      <div className="border-b border-border/50 px-3 py-2">
        <a
          href="https://kubestellar.io/leaderboard"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors"
        >
          <Trophy className="w-3.5 h-3.5" />
          <span>View Full Leaderboard</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Actions header */}
      <div className="p-2 border-b border-border/50 flex items-center justify-between shrink-0">
        {actionError ? (
          <span className="text-xs text-red-400">{actionError}</span>
        ) : (
          <span />
        )}
        <button
          onClick={() => {
            setActionError(null)
            onRefreshRequests()
            onRefreshNotifications()
          }}
          disabled={isRefreshing}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50"
          title={t('common.refresh')}
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Your Requests section */}
        <div className="p-2 border-b border-border/50 shrink-0">
          <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">
            Your Requests ({requests.length})
          </span>
        </div>
        {requestsLoading && requests.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
            <p className="text-sm">{t('common.loading')}</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Bug className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No requests in queue</p>
            <p className="text-xs mt-1">Submit a bug report or feature request to get started</p>
          </div>
        ) : (
          requests.map(request => (
            <RequestItem
              key={request.id}
              request={request}
              currentGitHubLogin={currentGitHubLogin}
              canPerformActions={canPerformActions}
              actionLoading={actionLoading}
              confirmClose={confirmClose}
              previewChecking={previewChecking}
              previewResults={previewResults}
              getUnreadCountForRequest={getUnreadCountForRequest}
              markRequestNotificationsAsRead={markRequestNotificationsAsRead}
              onRequestUpdate={handleRequestUpdate}
              onCloseRequest={handleCloseRequest}
              onSetConfirmClose={setConfirmClose}
              onCheckPreview={handleCheckPreview}
              onShowLoginPrompt={onShowLoginPrompt}
            />
          ))
        )}

        {/* GitHub Contributions section */}
        <GitHubContributionsSection
          currentGitHubLogin={currentGitHubLogin}
          githubRewards={githubRewards}
          githubPoints={githubPoints}
          isGitHubRefreshing={isGitHubRefreshing}
          onRefreshGitHub={onRefreshGitHub}
          requests={requests}
          requestsLoading={requestsLoading}
        />
      </div>
    </div>
  )
}

// ── Request Item ──

interface RequestItemProps {
  request: FeatureRequest
  currentGitHubLogin: string
  canPerformActions: boolean
  actionLoading: string | null
  confirmClose: string | null
  previewChecking: number | null
  previewResults: Record<number, PreviewResult>
  getUnreadCountForRequest: (id: string) => number
  markRequestNotificationsAsRead: (id: string) => void
  onRequestUpdate: (id: string) => Promise<void>
  onCloseRequest: (id: string) => Promise<void>
  onSetConfirmClose: (id: string | null) => void
  onCheckPreview: (prNumber: number) => Promise<void>
  onShowLoginPrompt: () => void
}

function RequestItem({
  request,
  currentGitHubLogin,
  canPerformActions,
  actionLoading,
  confirmClose,
  previewChecking,
  previewResults,
  getUnreadCountForRequest,
  markRequestNotificationsAsRead,
  onRequestUpdate,
  onCloseRequest,
  onSetConfirmClose,
  onCheckPreview,
  onShowLoginPrompt,
}: RequestItemProps) {
  const { t } = useTranslation()
  const statusInfo = getStatusInfo(request.status, request.closed_by_user)
  const isLoading = actionLoading === request.id
  const showConfirm = confirmClose === request.id
  const isOwnedByUser = request.github_login
    ? request.github_login === currentGitHubLogin
    : request.user_id === currentGitHubLogin
  const shouldBlur = !isTriaged(request.status) && !isOwnedByUser
  const requestUnreadCount = getUnreadCountForRequest(request.id)

  return (
    <div
      className={`p-3 border-b border-border/50 hover:bg-secondary/30 transition-colors ${
        requestUnreadCount > 0 ? 'bg-purple-500/5' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-1.5 py-0.5 text-2xs font-medium rounded ${
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
              <StatusBadge color="blue" size="xs">Yours</StatusBadge>
            )}
            {requestUnreadCount > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  markRequestNotificationsAsRead(request.id)
                }}
                className="flex items-center gap-1 px-1.5 py-0.5 text-2xs font-medium rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
                title="Click to clear updates"
              >
                <Bell className="w-3 h-3" />
                {requestUnreadCount} update{requestUnreadCount !== 1 ? 's' : ''}
                <X className="w-3 h-3 ml-0.5 hover:text-purple-300" />
              </button>
            )}
          </div>

          {/* Status-dependent content */}
          {!isTriaged(request.status) ? (
            <UntriagedRequestContent
              request={request}
              isOwnedByUser={isOwnedByUser}
              statusInfo={statusInfo}
            />
          ) : (
            <TriagedRequestContent
              request={request}
              shouldBlur={shouldBlur}
              statusInfo={statusInfo}
            />
          )}

          {/* PR links */}
          {request.status === 'feasibility_study' && request.pr_url && (
            <a href={request.pr_url} target="_blank" rel="noopener noreferrer"
              className="text-xs flex items-center gap-1 mt-1.5 text-purple-400 hover:text-purple-300"
              onClick={e => e.stopPropagation()}>
              <GitPullRequest className="w-3 h-3" />
              PR #{request.pr_number}
            </a>
          )}
          {request.status === 'fix_ready' && request.pr_url && (
            <a href={request.pr_url} target="_blank" rel="noopener noreferrer"
              className="text-xs flex items-center gap-1 mt-1.5 text-green-400 hover:text-green-300"
              onClick={e => e.stopPropagation()}>
              <GitPullRequest className="w-3 h-3" />
              View PR #{request.pr_number}
            </a>
          )}

          {/* Merged celebration for fix_complete */}
          {request.status === 'fix_complete' && (
            <FixCompleteBanner request={request} />
          )}

          {/* Latest comment for unable_to_fix */}
          {request.status === 'unable_to_fix' && request.latest_comment && (
            <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-muted-foreground">
              <div className="flex items-center gap-1 text-red-400 mb-1">
                <MessageSquare className="w-3 h-3" />
                <span className="font-medium">{t('drilldown.fields.reason')}</span>
              </div>
              <p className="line-clamp-3">{request.latest_comment}</p>
            </div>
          )}

          {/* Preview section */}
          {(request.status === 'fix_ready' || request.status === 'fix_complete') && (
            <PreviewSection
              request={request}
              previewChecking={previewChecking}
              previewResults={previewResults}
              onCheckPreview={onCheckPreview}
            />
          )}

          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatRelativeTime(request.created_at)}
            </span>
            {request.github_issue_url && (
              <a href={request.github_issue_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={e => e.stopPropagation()}>
                <ExternalLink className="w-3 h-3" />
                GitHub
              </a>
            )}
          </div>

          {/* Actions */}
          {isOwnedByUser && request.status !== 'closed' && request.status !== 'fix_complete' && (
            <RequestActions
              requestId={request.id}
              canPerformActions={canPerformActions}
              isLoading={isLoading}
              showConfirm={showConfirm}
              onRequestUpdate={onRequestUpdate}
              onCloseRequest={onCloseRequest}
              onSetConfirmClose={onSetConfirmClose}
              onShowLoginPrompt={onShowLoginPrompt}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Untriaged Request Content ──

function UntriagedRequestContent({
  request,
  isOwnedByUser,
  statusInfo,
}: {
  request: FeatureRequest
  isOwnedByUser: boolean
  statusInfo: { label: string; color: string; bgColor: string }
}) {
  return isOwnedByUser ? (
    <>
      <p className="text-sm font-medium text-foreground mt-1 truncate blur-xs select-none">
        {request.request_type === 'bug' ? '\uD83D\uDC1B ' : '\u2728 '}{request.title}
      </p>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <span className={`px-1.5 py-0.5 text-2xs font-medium rounded ${statusInfo.bgColor} ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
        {request.github_issue_url && (
          <a href={request.github_issue_url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
            onClick={e => e.stopPropagation()}>
            <ExternalLink className="w-3 h-3" />
            View on GitHub
          </a>
        )}
      </div>
      <p className="text-xs text-muted-foreground italic mt-1.5">
        Details will be visible to you once we accept triage
      </p>
    </>
  ) : (
    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
      <span className={`px-1.5 py-0.5 text-2xs font-medium rounded ${statusInfo.bgColor} ${statusInfo.color}`}>
        {statusInfo.label}
      </span>
      <span className="text-xs text-muted-foreground italic">
        Awaiting maintainer attention
      </span>
      {request.github_issue_number && (
        <span className="text-xs text-muted-foreground">
          #{request.github_issue_number}
        </span>
      )}
      {request.github_issue_url && (
        <a href={request.github_issue_url} target="_blank" rel="noopener noreferrer"
          className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
          onClick={e => e.stopPropagation()}>
          <ExternalLink className="w-3 h-3" />
          View on GitHub
        </a>
      )}
    </div>
  )
}

// ── Triaged Request Content ──

function TriagedRequestContent({
  request,
  shouldBlur,
  statusInfo,
}: {
  request: FeatureRequest
  shouldBlur: boolean
  statusInfo: { label: string; color: string; bgColor: string }
}) {
  return (
    <>
      <p className={`text-sm font-medium text-foreground mt-1 truncate ${shouldBlur ? 'blur-xs select-none' : ''}`}>
        {request.request_type === 'bug' ? '\uD83D\uDC1B ' : '\u2728 '}{request.title}
      </p>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <span className={`px-1.5 py-0.5 text-2xs font-medium rounded ${statusInfo.bgColor} ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
        {request.status === 'fix_complete' && (
          <span className="px-1.5 py-0.5 text-2xs font-medium rounded bg-gray-500/20 text-muted-foreground">
            Closed
          </span>
        )}
        {getStatusDescription(request.status, request.closed_by_user) && (
          <span className={`text-xs text-muted-foreground ${shouldBlur ? 'blur-xs select-none' : ''}`}>
            {getStatusDescription(request.status, request.closed_by_user)}
          </span>
        )}
      </div>
    </>
  )
}

// ── Fix Complete Banner ──

function FixCompleteBanner({ request }: { request: FeatureRequest }) {
  return (
    <div className="mt-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
      <div className="flex items-center gap-2 mb-1">
        <div className="flex items-center gap-1.5">
          <Check className="w-4 h-4 text-green-400" />
          <span className="text-xs font-semibold text-green-400">Merged</span>
        </div>
      </div>
      <p className="text-xs text-green-300/80 mb-2">
        Thank you for your feedback! Your {request.request_type === 'bug' ? 'bug fix' : 'feature'} has been merged and will be available in the next nightly build and weekly release.
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <a href="https://github.com/kubestellar/console/releases" target="_blank" rel="noopener noreferrer"
          className="text-xs flex items-center gap-1 text-green-400 hover:text-green-300"
          onClick={e => e.stopPropagation()}>
          <ExternalLink className="w-3 h-3" />
          Releases
        </a>
        {request.pr_url && (
          <a href={request.pr_url} target="_blank" rel="noopener noreferrer"
            className="text-xs flex items-center gap-1 text-green-400 hover:text-green-300"
            onClick={e => e.stopPropagation()}>
            <GitPullRequest className="w-3 h-3" />
            PR #{request.pr_number}
          </a>
        )}
        {request.github_issue_url && (
          <a href={request.github_issue_url} target="_blank" rel="noopener noreferrer"
            className="text-xs flex items-center gap-1 text-green-400 hover:text-green-300"
            onClick={e => e.stopPropagation()}>
            <ExternalLink className="w-3 h-3" />
            Issue #{request.github_issue_number}
          </a>
        )}
      </div>
    </div>
  )
}

// ── Preview Section ──

function PreviewSection({
  request,
  previewChecking,
  previewResults,
  onCheckPreview,
}: {
  request: FeatureRequest
  previewChecking: number | null
  previewResults: Record<number, PreviewResult>
  onCheckPreview: (prNumber: number) => Promise<void>
}) {
  const checkedPreview = request.pr_number ? previewResults[request.pr_number] : null
  const previewUrl = request.netlify_preview_url || (checkedPreview?.status === 'ready' ? checkedPreview.preview_url : null)
  const isCheckingThis = previewChecking === request.pr_number

  const readyAt = checkedPreview?.ready_at ? new Date(checkedPreview.ready_at) : null
  const secondsSinceReady = readyAt ? (Date.now() - readyAt.getTime()) / MS_PER_SECOND : Infinity
  const isWarmingUp = secondsSinceReady < PREVIEW_WARMUP_SECONDS

  if (previewUrl && request.status === 'fix_ready') {
    if (isWarmingUp) {
      const secondsLeft = Math.ceil(PREVIEW_WARMUP_SECONDS - secondsSinceReady)
      return (
        <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
            <span className="text-xs text-yellow-400 font-medium">Preview warming up... ({secondsLeft}s)</span>
          </div>
        </div>
      )
    }
    return (
      <div className="mt-2 p-2 bg-green-500/10 border border-green-500/30 rounded">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-green-400" />
            <span className="text-xs text-green-400 font-medium">Preview Available</span>
          </div>
          <a href={previewUrl} target="_blank" rel="noopener noreferrer"
            className="px-2 py-1 text-xs rounded bg-green-500 hover:bg-green-600 text-white transition-colors flex items-center gap-1"
            onClick={e => e.stopPropagation()}>
            <ExternalLink className="w-3 h-3" />
            Try It
          </a>
        </div>
      </div>
    )
  }
  if (previewUrl) {
    return (
      <a href={previewUrl} target="_blank" rel="noopener noreferrer"
        className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 mt-1"
        onClick={e => e.stopPropagation()}>
        <Eye className="w-3 h-3" />
        Preview
      </a>
    )
  }
  if (request.pr_number && request.status === 'fix_ready') {
    return (
      <div className="mt-1.5 flex items-center gap-2">
        <button
          onClick={e => { e.stopPropagation(); void onCheckPreview(request.pr_number!) }}
          disabled={isCheckingThis}
          className="text-xs text-muted-foreground hover:text-green-400 flex items-center gap-1 transition-colors disabled:opacity-50"
        >
          {isCheckingThis ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Eye className="w-3 h-3" />
          )}
          Check Preview
        </button>
        {checkedPreview && checkedPreview.status !== 'ready' && (
          <span className="text-2xs text-muted-foreground">
            {checkedPreview.status === 'pending' ? 'Building...' : checkedPreview.message || checkedPreview.status}
          </span>
        )}
      </div>
    )
  }
  return null
}

// ── Request Actions ──

function RequestActions({
  requestId,
  canPerformActions,
  isLoading,
  showConfirm,
  onRequestUpdate,
  onCloseRequest,
  onSetConfirmClose,
  onShowLoginPrompt,
}: {
  requestId: string
  canPerformActions: boolean
  isLoading: boolean
  showConfirm: boolean
  onRequestUpdate: (id: string) => Promise<void>
  onCloseRequest: (id: string) => Promise<void>
  onSetConfirmClose: (id: string | null) => void
  onShowLoginPrompt: () => void
}) {
  return (
    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
      {!canPerformActions ? (
        <>
          <button
            onClick={() => onShowLoginPrompt()}
            className="px-2 py-1 text-xs rounded bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors flex items-center gap-1"
            title="Please login to request updates"
          >
            <RefreshCw className="w-3 h-3" />
            Request Update
          </button>
          <button
            onClick={() => onShowLoginPrompt()}
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
            onClick={() => void onCloseRequest(requestId)}
            disabled={isLoading}
            className="px-2 py-1 text-xs rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Closing...' : 'Confirm'}
          </button>
          <button
            onClick={() => onSetConfirmClose(null)}
            className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 text-muted-foreground transition-colors"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => void onRequestUpdate(requestId)}
            disabled={isLoading}
            className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 text-foreground transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Request Update
          </button>
          <button
            onClick={() => onSetConfirmClose(requestId)}
            className="px-2 py-1 text-xs rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            Close
          </button>
        </>
      )}
    </div>
  )
}

// ── GitHub Contributions Section ──

interface GitHubContributionsSectionProps {
  currentGitHubLogin: string
  githubRewards: UpdatesTabProps['githubRewards']
  githubPoints: number
  isGitHubRefreshing: boolean
  onRefreshGitHub: () => void
  requests: FeatureRequest[]
  requestsLoading: boolean
}

/** Width and height for the LinkedIn share popup window */
const LINKEDIN_POPUP_SIZE = 600

function GitHubContributionsSection({
  currentGitHubLogin,
  githubRewards,
  githubPoints,
  isGitHubRefreshing,
  onRefreshGitHub,
  requests,
  requestsLoading,
}: GitHubContributionsSectionProps) {
  return (
    <>
      <div className="p-2 border-b border-border/50 flex items-center justify-between shrink-0">
        <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Github className="w-3 h-3" />
          {currentGitHubLogin ? `${currentGitHubLogin}'s` : ''} GitHub Contributions
          {githubRewards && (
            <span className="ml-1 text-yellow-400 font-bold">{githubPoints.toLocaleString()} coins</span>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          {githubRewards && githubPoints > 0 && (
            <button
              onClick={() => {
                const bd = githubRewards.breakdown
                const prCount = (bd?.prs_merged ?? 0) + (bd?.prs_opened ?? 0)
                const issueCount = (bd?.bug_issues ?? 0) + (bd?.feature_issues ?? 0) + (bd?.other_issues ?? 0)
                const text = `I've earned ${githubPoints.toLocaleString()} contributor coins on the KubeStellar Console! ${prCount > 0 ? `${prCount} PRs` : ''}${prCount > 0 && issueCount > 0 ? ' and ' : ''}${issueCount > 0 ? `${issueCount} issues` : ''} contributed to the open-source KubeStellar project.`
                const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://kubestellar.io')}&summary=${encodeURIComponent(text)}`
                window.open(linkedInUrl, '_blank', `noopener,noreferrer,width=${LINKEDIN_POPUP_SIZE},height=${LINKEDIN_POPUP_SIZE}`)
                emitLinkedInShare('feature_request')
              }}
              className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-[#0A66C2] transition-colors"
              title={`Share ${githubPoints.toLocaleString()} coins on LinkedIn`}
            >
              <Linkedin className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onRefreshGitHub}
            disabled={isGitHubRefreshing}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isGitHubRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {githubRewards && githubRewards.breakdown && (
        // These badges count every issue/PR you authored across our orgs
        // (kubestellar, llm-d) — NOT only items submitted via this console.
        // The Rewards panel's "Submitted via console" line counts a different
        // (smaller) population. See kubestellar/console#8893 for context.
        <div className="px-3 py-2 border-b border-border/50 shrink-0">
          <div className="flex flex-wrap gap-1.5">
            {githubRewards.breakdown.prs_merged > 0 && (
              <StatusBadge color="purple" size="xs" rounded="full" icon={<GitMerge className="w-2.5 h-2.5" />}>
                {githubRewards.breakdown.prs_merged} Merged
              </StatusBadge>
            )}
            {githubRewards.breakdown.prs_opened > 0 && (
              <StatusBadge color="green" size="xs" rounded="full" icon={<GitPullRequest className="w-2.5 h-2.5" />}>
                {githubRewards.breakdown.prs_opened} PRs
              </StatusBadge>
            )}
            {githubRewards.breakdown.bug_issues > 0 && (
              <StatusBadge
                color="red"
                size="xs"
                rounded="full"
                icon={<Bug className="w-2.5 h-2.5" />}
                title="All bug-labeled GitHub issues you authored across our orgs. The Rewards panel's 'Report Bugs' counter only includes bugs submitted through this console and will be smaller."
              >
                {githubRewards.breakdown.bug_issues} Bugs
              </StatusBadge>
            )}
            {githubRewards.breakdown.feature_issues > 0 && (
              <StatusBadge
                color="yellow"
                size="xs"
                rounded="full"
                icon={<Lightbulb className="w-2.5 h-2.5" />}
                title="All feature-labeled GitHub issues you authored across our orgs. The Rewards panel's 'Suggest Features' counter only includes features submitted through this console and will be smaller."
              >
                {githubRewards.breakdown.feature_issues} Features
              </StatusBadge>
            )}
            {githubRewards.breakdown.other_issues > 0 && (
              <StatusBadge color="purple" size="xs" rounded="full" className="bg-gray-500/20! text-muted-foreground!" icon={<AlertCircle className="w-2.5 h-2.5" />}>
                {githubRewards.breakdown.other_issues} Issues
              </StatusBadge>
            )}
          </div>
        </div>
      )}

      {!githubRewards ? (
        <div className="p-6 text-center text-muted-foreground">
          <Github className="w-6 h-6 mx-auto mb-2 opacity-50" />
          <p className="text-xs">Log in with GitHub to see contributions</p>
        </div>
      ) : !githubRewards.contributions?.length ? (
        <div className="p-6 text-center text-muted-foreground">
          <Github className="w-6 h-6 mx-auto mb-2 opacity-50" />
          <p className="text-xs">No contributions found — open issues or PRs to earn points</p>
        </div>
      ) : (
        (() => {
          const requestsReady = !requestsLoading && requests.length > 0
          const untriagedIssueNumbers = new Set(
            (requests || [])
              .filter(r => !isTriaged(r.status) && r.github_issue_number)
              .map(r => r.github_issue_number)
          )
          return githubRewards.contributions.map((contrib: GitHubContribution, idx: number) => {
            const isConsoleIssue = contrib.type.startsWith('issue_') && contrib.repo?.includes('console')
            const isUntriaged = requestsReady
              ? untriagedIssueNumbers.has(contrib.number)
              : isConsoleIssue
            return (
              <a
                key={`${contrib.repo}-${contrib.number}-${contrib.type}-${idx}`}
                href={contrib.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-2.5 border-b border-border/50 hover:bg-secondary/30 transition-colors group"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <GitHubContributionIcon type={contrib.type} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm text-foreground truncate group-hover:text-blue-400 transition-colors ${isUntriaged ? 'blur-xs select-none' : ''}`}>
                      {contrib.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      @{currentGitHubLogin} · {contrib.repo} #{contrib.number} · {GITHUB_REWARD_LABELS[contrib.type]}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-xs text-yellow-400 font-medium">+{contrib.points}</span>
                  <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </a>
            )
          })
        })()
      )}

      {githubRewards?.contributions && githubRewards.contributions.length > 0 && currentGitHubLogin && (
        <div className="p-2.5 border-t border-border/50 text-center">
          <a
            href={`https://github.com/search?q=author:${encodeURIComponent(currentGitHubLogin)}+org:kubestellar+org:llm-d&type=issues&s=updated&o=desc`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            View all contributions on GitHub
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {githubRewards?.from_cache && (
        <div className="p-2 border-t border-border/50">
          <p className="text-2xs text-muted-foreground text-center">
            Cached {new Date(githubRewards.cached_at).toLocaleTimeString()}
          </p>
        </div>
      )}
    </>
  )
}
