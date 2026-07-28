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

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { X, Bug, Lightbulb } from 'lucide-react'
import { ConfirmDialog, useModalFocusTrap } from '../../lib/modals'
import { useRewards, REWARD_ACTIONS } from '../../hooks/useRewards'
import { useToast } from '../ui/Toast'
import { emitFeedbackSubmitted, emitScreenshotUploadFailed, emitScreenshotUploadSuccess, getRecentBrowserErrors, getRecentFailedApiCalls } from '../../lib/analytics'
import { useBranding } from '../../hooks/useBranding'
import { FEEDBACK_UPLOAD_TIMEOUT_MS } from '../../lib/constants/network'
import { compressScreenshot } from '../../lib/imageCompression'
import { useFeatureRequests, DiagnosticInfo } from '../../hooks/useFeatureRequests'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { useAuth } from '../../lib/auth'
import { isFeedbackRequestBodyTooLarge, isFeedbackRequestBodyLimitError } from './FeatureRequestTypes'
import { useFeedbackDraft, clearFeedbackDraft } from './useFeedbackDraft'
import { FeedbackSuccessPanel } from './FeedbackSuccessPanel'
import { FeedbackFormBody } from './FeedbackFormBody'

type FeedbackType = 'bug' | 'feature'

interface FeedbackModalProps {
  isOpen: boolean
  onClose: () => void
  initialType?: FeedbackType
}

export function FeedbackModal({ isOpen, onClose, initialType = 'feature' }: FeedbackModalProps) {
  const { showToast } = useToast()
  const { t } = useTranslation(['common'])
  const branding = useBranding()
  const { user } = useAuth()
  const { createRequest } = useFeatureRequests(user?.github_login || '')
  const { health: agentHealth, status: agentStatus, dataErrorCount: agentDataErrorCount, lastDataError: agentLastDataError } = useLocalAgent()
  const [type, setType] = useState<FeedbackType>(initialType)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState<{ issueUrl?: string; screenshotsUploaded?: number; screenshotsFailed?: number } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<{ title?: string; description?: string }>({})
  const { awardCoins } = useRewards()
  const [screenshots, setScreenshots] = useState<{ file: File; preview: string; mediaType?: 'image' | 'video' }[]>([])
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  useFeedbackDraft({
    type, title, description,
    onRestore: (draft) => { setType(draft.type); setTitle(draft.title); setDescription(draft.description) },
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const errors: { title?: string; description?: string } = {}
    if (!title.trim()) errors.title = 'Title is required'
    if (!description.trim()) errors.description = 'Description is required'
    if (Object.keys(errors).length > 0) { setValidationErrors(errors); return }
    setValidationErrors({})
    setIsSubmitting(true)
    setSubmitError(null)

    const requestBodyTooLargeMessage = t(
      'feedback.attachmentsTooLarge',
      'Attachments are too large to submit. Keep each video at or below 10 MB and reduce the total attachment payload before retrying.',
    )

    try {
      const screenshotDataURIs: string[] = []
      for (const s of screenshots) {
        if (s.mediaType === 'video') {
          screenshotDataURIs.push(s.preview)
        } else {
          const compressed = await compressScreenshot(s.preview)
          if (compressed) screenshotDataURIs.push(compressed)
        }
      }

      const diagnostics: DiagnosticInfo = {
        agent_version: agentHealth?.version,
        commit_sha: agentHealth?.commitSHA,
        build_time: agentHealth?.buildTime,
        go_version: agentHealth?.goVersion,
        agent_os: agentHealth?.os,
        agent_arch: agentHealth?.arch,
        install_method: agentHealth?.install_method,
        clusters: agentHealth?.clusters,
        agent_connection_status: agentStatus,
        agent_connection_failures: agentDataErrorCount,
        agent_last_error: agentLastDataError ?? undefined,
        browser_user_agent: navigator.userAgent,
        browser_platform: navigator.platform,
        browser_language: navigator.language,
        screen_resolution: `${screen.width}x${screen.height}`,
        window_size: `${window.innerWidth}x${window.innerHeight}`,
        page_url: `${window.location.origin}${window.location.pathname}`,
      }

      const consoleErrors = getRecentBrowserErrors()
      const failedApiCalls = getRecentFailedApiCalls()
      const hasScreenshots = screenshotDataURIs.length > 0
      const submissionPayload = {
        title: title.trim(),
        description: description.trim(),
        request_type: type,
        target_repo: 'console' as const,
        diagnostics,
        ...(consoleErrors.length > 0 && { console_errors: consoleErrors }),
        ...(failedApiCalls.length > 0 && { failed_api_calls: failedApiCalls }),
        ...(hasScreenshots && { screenshots: screenshotDataURIs }),
      }
      if (isFeedbackRequestBodyTooLarge(submissionPayload)) {
        setSubmitError(requestBodyTooLargeMessage)
        showToast(requestBodyTooLargeMessage, 'error')
        return
      }
      const result = await createRequest(submissionPayload, hasScreenshots ? { timeout: FEEDBACK_UPLOAD_TIMEOUT_MS } : undefined)
      if (hasScreenshots) emitScreenshotUploadSuccess(screenshotDataURIs.length)
      emitFeedbackSubmitted(type)
      const action = type === 'bug' ? 'bug_report' : 'feature_suggestion'
      awardCoins(action as 'bug_report' | 'feature_suggestion', { title, type })
      clearFeedbackDraft()
      setSuccess({ issueUrl: result.github_issue_url, screenshotsUploaded: result.screenshots_uploaded, screenshotsFailed: result.screenshots_failed })
    } catch (err: unknown) {
      console.error('[Screenshot] Failed to submit feedback:', err)
      const message = err instanceof Error ? err.message : 'Failed to submit feedback'
      const finalMessage = isFeedbackRequestBodyLimitError(message) ? requestBodyTooLargeMessage : message
      if (screenshots.length > 0) emitScreenshotUploadFailed(finalMessage, screenshots.length)
      setSubmitError(finalMessage)
      showToast(finalMessage, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const forceClose = () => {
    setShowDiscardConfirm(false)
    clearFeedbackDraft()
    setSuccess(null)
    setSubmitError(null)
    setValidationErrors({})
    setTitle('')
    setDescription('')
    setScreenshots([])
    onClose()
  }

  const titleRef = useRef(title)
  const descriptionRef = useRef(description)
  const successRef = useRef(success)
  titleRef.current = title
  descriptionRef.current = description
  successRef.current = success

  const handleClose = useCallback(() => {
    if (!successRef.current && (titleRef.current.trim() !== '' || descriptionRef.current.trim() !== '')) {
      setShowDiscardConfirm(true)
      return
    }
    forceClose()
  }, [forceClose])

  const formRef = useRef<HTMLFormElement>(null)
  useModalFocusTrap(modalRef, isOpen)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); handleClose(); return }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); formRef.current?.requestSubmit(); return }
      if (e.key === ' ') {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target instanceof HTMLElement && (e.target.isContentEditable || (e.target as HTMLElement).closest('button, a, select, [role="button"], [role="link"], [role="option"], [role="menuitem"]')))
        ) return
        e.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleClose])

  if (!isOpen) return null

  const coins = type === 'bug' ? REWARD_ACTIONS.bug_report.coins : REWARD_ACTIONS.feature_suggestion.coins
  const isMacPlatform = typeof navigator !== 'undefined' && navigator.platform?.includes('Mac')
  const submitShortcutLabel = `${isMacPlatform ? '⌘' : 'Ctrl'}+↵`

  return createPortal(
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-xs">
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
        <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/30">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${type === 'bug' ? 'bg-red-500/20' : 'bg-green-500/20'}`}>
              {type === 'bug' ? <Bug className="w-5 h-5 text-red-400" /> : <Lightbulb className="w-5 h-5 text-green-400" />}
            </div>
            <div>
              <h2 className="font-semibold text-foreground">{t('feedback.submitFeedback', 'Submit Feedback')}</h2>
              <p className="text-xs text-muted-foreground">
                Earn <span className="text-yellow-400">{REWARD_ACTIONS.bug_report.coins}</span> coins for bugs, <span className="text-yellow-400">{REWARD_ACTIONS.feature_suggestion.coins}</span> for features
              </p>
            </div>
          </div>
          <button onClick={handleClose} aria-label={t('actions.close')} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4">
          {success ? (
            <FeedbackSuccessPanel
              type={type}
              coins={coins}
              success={success}
              screenshotCount={screenshots.length}
              appShortName={branding.appShortName}
              onShare={() => awardCoins('linkedin_share')}
            />
          ) : (
            <FeedbackFormBody
              type={type}
              setType={setType}
              title={title}
              setTitle={setTitle}
              description={description}
              setDescription={setDescription}
              validationErrors={validationErrors}
              setValidationErrors={setValidationErrors}
              screenshots={screenshots}
              setScreenshots={setScreenshots}
              submitError={submitError}
              isSubmitting={isSubmitting}
              coins={coins}
              submitShortcutLabel={submitShortcutLabel}
              onSubmit={handleSubmit}
              hasDraftRestored={!!(title || description)}
            />
          )}
        </div>

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

export { FeedbackButton, LinkedInShareButton } from './FeedbackModal.RatingSelector'


