/**
 * Feedback Modal - allows users to submit bugs or feature requests
 *
 * Uses the backend API (POST /api/feedback/requests) to create GitHub issues
 * directly via the server-side GitHub token. This means users do not need to
 * be logged into GitHub — the issue is created automatically.
 *
 * Screenshots are uploaded to GitHub via the backend and embedded directly
 * in the created issue as markdown images.
 */

import { createPortal } from 'react-dom'
import { X, Bug, Lightbulb, Send, ExternalLink, AlertTriangle, Loader2 } from 'lucide-react'
import { ConfirmDialog } from '../../lib/modals'
import { REWARD_ACTIONS } from '../../hooks/useRewards'
import { FeedbackTabBar, ScreenshotAttacher, FeedbackSuccessView } from './FeedbackModal.parts'
import { type FeedbackModalProps } from './FeedbackModal.types'
import { useFeedbackDraft } from './useFeedbackDraft'

export function FeedbackModal({ isOpen, onClose, initialType = 'feature' }: FeedbackModalProps) {
  const {
    t,
    branding,
    type,
    setType,
    title,
    setTitle,
    description,
    setDescription,
    isSubmitting,
    success,
    submitError,
    validationErrors,
    setValidationErrors,
    screenshots,
    isDragOver,
    copiedIndex,
    showDiscardConfirm,
    setShowDiscardConfirm,
    modalRef,
    formRef,
    handleSubmit,
    handleClose,
    forceClose,
    handleScreenshotFiles,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
    removeScreenshot,
    copyScreenshotToClipboard,
    coins,
    submitShortcutLabel,
    awardCoins,
  } = useFeedbackDraft({ isOpen, onClose, initialType })

  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Prevent backdrop click from closing the modal (form safety)
    // Only allow explicit close via X button or form submission
    if (e.target === e.currentTarget) {
      e.stopPropagation()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-xs"
      onClick={handleBackdropClick}
    >
      <ConfirmDialog
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={forceClose}
        title={t('common:common.discardUnsavedChanges', 'Discard unsaved changes?')}
        message={t('common:common.discardUnsavedChangesMessage', 'You have unsaved changes that will be lost.')}
        confirmLabel={t('common:common.discard', 'Discard')}
        cancelLabel={t('common:common.keepEditing', 'Keep editing')}
        variant="warning"
      />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Submit Feedback"
        tabIndex={-1}
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/30">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              type === 'bug' ? 'bg-red-500/20' : 'bg-green-500/20'
            }`}>
              {type === 'bug' ? (
                <Bug className="w-5 h-5 text-red-400" />
              ) : (
                <Lightbulb className="w-5 h-5 text-green-400" />
              )}
            </div>
            <div>
              <h2 className="font-semibold text-foreground">{t('feedback.submitFeedback', 'Submit Feedback')}</h2>
              <p className="text-xs text-muted-foreground">
                Earn <span className="text-yellow-400">{REWARD_ACTIONS.bug_report.coins}</span> coins for bugs, <span className="text-yellow-400">{REWARD_ACTIONS.feature_suggestion.coins}</span> for features
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            aria-label={t('actions.close')}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {success ? (
            <FeedbackSuccessView
              type={type}
              coins={coins}
              issueUrl={success.issueUrl}
              screenshotsUploaded={success.screenshotsUploaded}
              screenshotsFailed={success.screenshotsFailed}
              screenshotCount={screenshots.length}
              appShortName={branding.appShortName}
              onAwardLinkedIn={() => awardCoins('linkedin_share')}
            />
          ) : (
            <>
              {/* Draft restore notice */}
              {(title || description) && (
                <div className="flex items-center gap-2 p-2 mb-3 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-muted-foreground">
                  <span>{t('feedback.draftRestored')}</span>
                </div>
              )}

              {/* Type selector */}
              <FeedbackTabBar type={type} setType={setType} />

              <form ref={formRef} onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => { setTitle(e.target.value); if (validationErrors.title) setValidationErrors(prev => ({ ...prev, title: undefined })) }}
                      placeholder={type === 'bug' ? 'Brief description of the bug' : 'Brief description of the feature'}
                      className={`w-full px-3 py-2.5 rounded-lg bg-secondary border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50 ${
                        validationErrors.title ? 'border-red-500' : 'border-border'
                      }`}
                      required
                    />
                    {validationErrors.title && (
                      <p className="mt-1 text-xs text-red-400">{validationErrors.title}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => { setDescription(e.target.value); if (validationErrors.description) setValidationErrors(prev => ({ ...prev, description: undefined })) }}
                      onPaste={handlePaste}
                      placeholder={type === 'bug'
                        ? 'Steps to reproduce, expected behavior, actual behavior... (paste screenshots here!)'
                        : 'Describe the feature, use case, and how it would help... (paste screenshots here!)'
                      }
                      rows={4}
                      className={`w-full px-3 py-2.5 rounded-lg bg-secondary border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50 resize-none ${
                        validationErrors.description ? 'border-red-500' : 'border-border'
                      }`}
                      required
                    />
                    {validationErrors.description && (
                      <p className="mt-1 text-xs text-red-400">{validationErrors.description}</p>
                    )}
                  </div>

                  {/* Screenshot Upload */}
                  <ScreenshotAttacher
                    screenshots={screenshots}
                    isDragOver={isDragOver}
                    copiedIndex={copiedIndex}
                    onFiles={handleScreenshotFiles}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onCopy={(preview, i) => void copyScreenshotToClipboard(preview, i)}
                    onRemove={removeScreenshot}
                  />

                  {/* Error message */}
                  {submitError && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <span className="text-red-400">{submitError}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
                    <ExternalLink className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="text-muted-foreground">
                      {screenshots.length > 0
                        ? 'A GitHub issue will be created automatically with your screenshots attached.'
                        : 'A GitHub issue will be created automatically. No GitHub login required.'}
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-500 hover:bg-purple-600 disabled:bg-purple-500/50 disabled:cursor-not-allowed text-white font-medium transition-colors"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {isSubmitting ? 'Creating issue...' : `Submit & Earn ${coins} Coins`}
                    {!isSubmitting && (
                      <kbd className="ml-1 px-2 py-1 rounded-md bg-foreground/20 text-xs font-semibold leading-none shadow-xs">
                        {submitShortcutLabel}
                      </kbd>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
        {/* Keyboard hints */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-t border-border/50 bg-secondary/20">
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <kbd className="px-1.5 py-0.5 rounded border border-border bg-secondary text-xs font-mono">Esc</kbd>
            close
          </span>
          {!success && (
            <span className="inline-flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm">
              <kbd className="px-1.5 py-0.5 rounded border border-purple-500/30 bg-background/80 text-xs font-mono">{submitShortcutLabel}</kbd>
              submit
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export { FeedbackButton, LinkedInShareButton } from './FeedbackModal.actions'
