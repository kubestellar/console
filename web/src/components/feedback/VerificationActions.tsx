import { useTranslation } from 'react-i18next'

const REOPEN_COMMENT_ROWS = 3
const REOPEN_COMMENT_MAX_LENGTH = 1000

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
