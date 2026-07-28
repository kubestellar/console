import { Check, ExternalLink, GitPullRequest } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { FeatureRequest } from '../../hooks/useFeatureRequests'
import { TextArea } from '../ui/TextArea'
import { ExternalLinkRow } from './UpdatesTabRequestLinks'

const REOPEN_COMMENT_ROWS = 3
const REOPEN_COMMENT_MAX_LENGTH = 1000

export function FixCompleteBanner({
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

export function FixVerificationPrompt({
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
          <TextArea
            value={reopenComment}
            onChange={(event) => onReopenCommentChange(event.target.value.slice(0, REOPEN_COMMENT_MAX_LENGTH))}
            rows={REOPEN_COMMENT_ROWS}
            maxLength={REOPEN_COMMENT_MAX_LENGTH}
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
