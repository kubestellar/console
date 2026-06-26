import { useEffect, useState, type ReactNode } from 'react'
import {
  Bell,
  Check,
  Clock,
  ExternalLink,
  Eye,
  GitPullRequest,
  Loader2,
  MessageSquare,
  RefreshCw,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../ui/StatusBadge'
import { isTriaged, getStatusDescription, type CloseRequestInput, type FeatureRequest } from '../../hooks/useFeatureRequests'
import { formatRelativeTime, getStatusInfo, PREVIEW_WARMUP_SECONDS, type PreviewResult } from './FeatureRequestTypes'
import { sanitizeUrl } from '@/lib/utils/sanitizeUrl'
import { isValidPreviewUrl } from '../../lib/utils/isValidPreviewUrl'
import { MS_PER_SECOND } from '../../lib/constants/time'
import type { RequestCardState, RequestItemProps, RequestStatusInfo } from './UpdatesTab.types'
import { getVerifiedFixStorageKey, readVerifiedFixState, writeVerifiedFixState } from './updatesTabStorage'

const REOPEN_COMMENT_ROWS = 3
const REOPEN_COMMENT_MAX_LENGTH = 1000

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

function ExternalLinkRow({
  href,
  colorClass,
  compact = false,
  children,
}: {
  href: string
  colorClass: string
  compact?: boolean
  children: ReactNode
}) {
  return (
    <a
      href={sanitizeUrl(href)}
      target="_blank"
      rel="noopener noreferrer"
      className={`${compact ? 'text-xs text-muted-foreground hover:text-foreground' : 'text-xs flex items-center gap-1 mt-1.5'} ${colorClass} flex items-center gap-1`}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </a>
  )
}

function UntriagedRequestContent({
  request,
  isOwnedByUser,
  statusInfo,
}: {
  request: FeatureRequest
  isOwnedByUser: boolean
  statusInfo: RequestStatusInfo
}) {
  return isOwnedByUser ? (
    <>
      <p className="text-sm font-medium text-foreground mt-1 truncate blur-xs select-none">
        {request.request_type === 'bug' ? '🐛 ' : '✨ '}{request.title}
      </p>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <span className={`px-1.5 py-0.5 text-2xs font-medium rounded ${statusInfo.bgColor} ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
        {request.github_issue_url && (
          <ExternalLinkRow href={request.github_issue_url} colorClass="text-purple-400 hover:text-purple-300">
            <ExternalLink className="w-3 h-3" />
            View on GitHub
          </ExternalLinkRow>
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
      <span className="text-xs text-muted-foreground italic">Awaiting maintainer attention</span>
      {request.github_issue_number && <span className="text-xs text-muted-foreground">#{request.github_issue_number}</span>}
      {request.github_issue_url && (
        <ExternalLinkRow href={request.github_issue_url} colorClass="text-purple-400 hover:text-purple-300">
          <ExternalLink className="w-3 h-3" />
          View on GitHub
        </ExternalLinkRow>
      )}
    </div>
  )
}

function TriagedRequestContent({
  request,
  shouldBlur,
  statusInfo,
  isAwaitingVerification,
}: {
  request: FeatureRequest
  shouldBlur: boolean
  statusInfo: RequestStatusInfo
  isAwaitingVerification: boolean
}) {
  const { t } = useTranslation()

  return (
    <>
      <p className={`text-sm font-medium text-foreground mt-1 truncate ${shouldBlur ? 'blur-xs select-none' : ''}`}>
        {request.request_type === 'bug' ? '🐛 ' : '✨ '}{request.title}
      </p>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <span className={`px-1.5 py-0.5 text-2xs font-medium rounded ${statusInfo.bgColor} ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
        {request.status === 'fix_complete' && (
          <span className="px-1.5 py-0.5 text-2xs font-medium rounded bg-muted text-muted-foreground">
            Closed
          </span>
        )}
        {isAwaitingVerification && (
          <span className="px-1.5 py-0.5 text-2xs font-medium rounded bg-blue-500/20 text-blue-300">
            {t('feedback.awaitingVerificationBadge')}
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

function FixCompleteBanner({
  request,
  isAwaitingVerification,
  isVerified,
}: {
  request: FeatureRequest
  isAwaitingVerification: boolean
  isVerified: boolean
}) {
  const { t } = useTranslation()

  return (
    <div className="mt-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Check className="w-4 h-4 text-green-400" />
          <span className="text-xs font-semibold text-green-400">{t('feedback.fixMerged')}</span>
        </div>
        {isVerified && (
          <span className="px-1.5 py-0.5 text-2xs font-medium rounded bg-green-500/20 text-green-300">
            {t('feedback.verifiedByYou')}
          </span>
        )}
        {isAwaitingVerification && (
          <span className="px-1.5 py-0.5 text-2xs font-medium rounded bg-blue-500/20 text-blue-300">
            {t('feedback.awaitingVerificationBadge')}
          </span>
        )}
      </div>
      <p className="text-xs text-green-300/80 mb-2">
        {isVerified
          ? t('feedback.verificationRecorded')
          : t('feedback.fixMergedDescription', {
            requestType: request.request_type === 'bug'
              ? t('feedback.requestTypeBugFix')
              : t('feedback.requestTypeFeature'),
          })}
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <ExternalLinkRow href="https://github.com/kubestellar/console/releases" colorClass="text-green-400 hover:text-green-300">
          <ExternalLink className="w-3 h-3" />
          {t('feedback.releases')}
        </ExternalLinkRow>
        {request.pr_url && (
          <ExternalLinkRow href={request.pr_url} colorClass="text-green-400 hover:text-green-300">
            <GitPullRequest className="w-3 h-3" />
            PR #{request.pr_number}
          </ExternalLinkRow>
        )}
        {request.github_issue_url && (
          <ExternalLinkRow href={request.github_issue_url} colorClass="text-green-400 hover:text-green-300">
            <ExternalLink className="w-3 h-3" />
            Issue #{request.github_issue_number}
          </ExternalLinkRow>
        )}
      </div>
    </div>
  )
}

function FixVerificationPrompt({
  requestId,
  canPerformActions,
  isLoading,
  isReopenFormVisible,
  reopenComment,
  onVerify,
  onToggleReopenForm,
  onReopenCommentChange,
  onReopenSubmit,
  onShowLoginPrompt,
}: {
  requestId: string
  canPerformActions: boolean
  isLoading: boolean
  isReopenFormVisible: boolean
  reopenComment: string
  onVerify: () => void
  onToggleReopenForm: () => void
  onReopenCommentChange: (value: string) => void
  onReopenSubmit: () => void
  onShowLoginPrompt: () => void
}) {
  const { t } = useTranslation()
  const isCommentEmpty = reopenComment.trim().length === 0

  return (
    <div className="mt-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3" data-testid={`awaiting-verification-${requestId}`}>
      <p className="text-sm font-medium text-blue-200">{t('feedback.awaitingVerificationQuestion')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={canPerformActions ? onVerify : onShowLoginPrompt}
          disabled={canPerformActions && isLoading}
          className="px-2.5 py-1.5 text-xs rounded bg-green-500/20 hover:bg-green-500/30 text-green-300 transition-colors disabled:opacity-50"
        >
          {canPerformActions && isLoading ? t('feedback.verifyingFix') : t('feedback.verifyFix')}
        </button>
        <button
          onClick={canPerformActions ? onToggleReopenForm : onShowLoginPrompt}
          className="px-2.5 py-1.5 text-xs rounded bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
        >
          {t('feedback.stillBroken')}
        </button>
      </div>
      {isReopenFormVisible && (
        <div className="mt-3 space-y-2">
          <textarea
            value={reopenComment}
            onChange={(event) => onReopenCommentChange(event.target.value.slice(0, REOPEN_COMMENT_MAX_LENGTH))}
            rows={REOPEN_COMMENT_ROWS}
            maxLength={REOPEN_COMMENT_MAX_LENGTH}
            className="w-full rounded-md border border-border bg-background/70 px-3 py-2 text-sm text-foreground outline-none focus:border-blue-400"
            placeholder={t('feedback.stillBrokenPlaceholder')}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onReopenSubmit}
              disabled={isLoading || isCommentEmpty}
              className="px-2.5 py-1.5 text-xs rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 transition-colors disabled:opacity-50"
            >
              {isLoading ? t('feedback.submittingReopen') : t('feedback.submitStillBroken')}
            </button>
            <button
              onClick={onToggleReopenForm}
              className="px-2.5 py-1.5 text-xs rounded bg-secondary hover:bg-secondary/80 text-muted-foreground transition-colors"
            >
              {t('actions.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

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
  const safePreviewUrl = isValidPreviewUrl(previewUrl) ? previewUrl : null
  const isCheckingThis = previewChecking === request.pr_number
  const readyAt = checkedPreview?.ready_at ? new Date(checkedPreview.ready_at) : null
  const secondsSinceReady = readyAt ? (Date.now() - readyAt.getTime()) / MS_PER_SECOND : Infinity
  const isWarmingUp = secondsSinceReady < PREVIEW_WARMUP_SECONDS

  if (safePreviewUrl && request.status === 'fix_ready') {
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
          <button
            onClick={(event) => {
              event.stopPropagation()
              if (isValidPreviewUrl(safePreviewUrl)) {
                window.open(safePreviewUrl, '_blank', 'noopener,noreferrer')
              }
            }}
            className="px-2 py-1 text-xs rounded bg-green-500 hover:bg-green-600 text-white transition-colors flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            Try It
          </button>
        </div>
      </div>
    )
  }

  if (safePreviewUrl) {
    return (
      <button
        onClick={(event) => {
          event.stopPropagation()
          if (isValidPreviewUrl(safePreviewUrl)) {
            window.open(safePreviewUrl, '_blank', 'noopener,noreferrer')
          }
        }}
        className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 mt-1 bg-transparent border-0 p-0 cursor-pointer"
      >
        <Eye className="w-3 h-3" />
        Preview
      </button>
    )
  }

  if (request.pr_number && request.status === 'fix_ready') {
    return (
      <div className="mt-1.5 flex items-center gap-2">
        <button
          onClick={(event) => {
            event.stopPropagation()
            void onCheckPreview(request.pr_number!)
          }}
          disabled={isCheckingThis}
          className="text-xs text-muted-foreground hover:text-green-400 flex items-center gap-1 transition-colors disabled:opacity-50"
        >
          {isCheckingThis ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
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
