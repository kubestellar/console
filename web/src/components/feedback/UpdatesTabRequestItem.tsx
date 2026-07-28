import { useEffect, useState } from 'react'
import {
  Bell,
  Clock,
  ExternalLink,
  GitPullRequest,
  Loader2,
  MessageSquare,
  RefreshCw,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../ui/StatusBadge'
import { isTriaged, type CloseRequestInput } from '../../hooks/useFeatureRequests'
import { formatRelativeTime, getStatusInfo } from './FeatureRequestTypes'
import type { RequestCardState, RequestItemProps } from './UpdatesTab.types'
import { getVerifiedFixStorageKey, readVerifiedFixState, writeVerifiedFixState } from './updatesTabStorage'
import { ExternalLinkRow, UntriagedRequestContent, TriagedRequestContent, FixCompleteBanner } from './RequestStatusBadge'
import { FixVerificationPrompt } from './VerificationActions'
import { PreviewSection } from './DiffPreview'

export function RequestItem({
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
  onReopenRequest,
  onSetConfirmClose,
  onCheckPreview,
  onShowLoginPrompt,
}: RequestItemProps) {
  const { t } = useTranslation()
  const [isReopenFormVisible, setIsReopenFormVisible] = useState(false)
  const [reopenComment, setReopenComment] = useState('')
  const isLoading = actionLoading === request.id
  const showConfirm = confirmClose === request.id
  const verificationStorageKey = getVerifiedFixStorageKey(request)
  const [isLocallyVerified, setIsLocallyVerified] = useState(() => readVerifiedFixState(verificationStorageKey))
  const isOwnedByUser = request.github_login
    ? request.github_login === currentGitHubLogin
    : request.user_id === currentGitHubLogin
  const isVerified = Boolean(request.closed_by_user || isLocallyVerified)
  const displayState: RequestCardState = request.status === 'fix_complete' && isOwnedByUser && !isVerified
    ? 'awaiting_verification'
    : request.status
  const statusInfo = getStatusInfo(request.status, request.closed_by_user)
  const shouldBlur = !isTriaged(request.status) && !isOwnedByUser
  const requestUnreadCount = getUnreadCountForRequest(request.id)
  const isAwaitingVerification = displayState === 'awaiting_verification'

  useEffect(() => {
    setIsLocallyVerified(readVerifiedFixState(verificationStorageKey))
  }, [verificationStorageKey])

  const handleVerify = async () => {
    const didVerify = await onCloseRequest(request.id, { user_verified: true })
    if (!didVerify) {
      return
    }

    writeVerifiedFixState(verificationStorageKey, true)
    setIsLocallyVerified(true)
  }

  const handleReopenSubmit = async () => {
    const trimmedComment = reopenComment.trim()
    if (!trimmedComment) {
      return
    }

    try {
      await onReopenRequest(request.id, { comment: trimmedComment })
      writeVerifiedFixState(verificationStorageKey, false)
      setIsLocallyVerified(false)
      setIsReopenFormVisible(false)
      setReopenComment('')
    } catch {
      // Parent handles the toast; keep the form open so the user can retry.
    }
  }

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
            {request.github_issue_number && <span className="text-xs text-muted-foreground">#{request.github_issue_number}</span>}
            {isOwnedByUser && <StatusBadge color="blue" size="xs">Yours</StatusBadge>}
            {requestUnreadCount > 0 && (
              <button
                onClick={(event) => {
                  event.stopPropagation()
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
              isAwaitingVerification={isAwaitingVerification}
            />
          )}

          {request.status === 'feasibility_study' && request.pr_url && (
            <ExternalLinkRow href={request.pr_url} colorClass="text-purple-400 hover:text-purple-300">
              <GitPullRequest className="w-3 h-3" />
              PR #{request.pr_number}
            </ExternalLinkRow>
          )}
          {request.status === 'fix_ready' && request.pr_url && (
            <ExternalLinkRow href={request.pr_url} colorClass="text-green-400 hover:text-green-300">
              <GitPullRequest className="w-3 h-3" />
              View PR #{request.pr_number}
            </ExternalLinkRow>
          )}

          {request.status === 'fix_complete' && (
            <FixCompleteBanner
              request={request}
              isAwaitingVerification={isAwaitingVerification}
              isVerified={isVerified}
            />
          )}
          {isAwaitingVerification && (
            <FixVerificationPrompt
              requestId={request.id}
              canPerformActions={canPerformActions}
              isLoading={isLoading}
              isReopenFormVisible={isReopenFormVisible}
              reopenComment={reopenComment}
              onVerify={() => void handleVerify()}
              onToggleReopenForm={() => setIsReopenFormVisible((value) => !value)}
              onReopenCommentChange={setReopenComment}
              onReopenSubmit={() => void handleReopenSubmit()}
              onShowLoginPrompt={onShowLoginPrompt}
            />
          )}

          {request.status === 'unable_to_fix' && request.latest_comment && (
            <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-muted-foreground">
              <div className="flex items-center gap-1 text-red-400 mb-1">
                <MessageSquare className="w-3 h-3" />
                <span className="font-medium">{t('drilldown.fields.reason')}</span>
              </div>
              <p className="line-clamp-3">{request.latest_comment}</p>
            </div>
          )}

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
              <ExternalLinkRow href={request.github_issue_url} colorClass="text-muted-foreground hover:text-foreground" compact>
                <ExternalLink className="w-3 h-3" />
                GitHub
              </ExternalLinkRow>
            )}
          </div>

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
  onCloseRequest: (id: string, input?: CloseRequestInput) => Promise<boolean>
  onSetConfirmClose: (id: string | null) => void
  onShowLoginPrompt: () => void
}) {
  return (
    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
      {!canPerformActions ? (
        <>
          <button
            onClick={onShowLoginPrompt}
            className="px-2 py-1 text-xs rounded bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors flex items-center gap-1"
            title="Please login to request updates"
          >
            <RefreshCw className="w-3 h-3" />
            Request Update
          </button>
          <button
            onClick={onShowLoginPrompt}
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
