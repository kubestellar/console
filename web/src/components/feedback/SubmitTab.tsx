import { useState, useCallback, useEffect } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { useTranslation } from 'react-i18next'
import { useToast } from '../ui/Toast'

import type { RequestType, TargetRepo, ScreenshotItem, SuccessState } from './FeatureRequestTypes'
import { MIN_PARENT_ISSUE_NUMBER, buildDirectIssueUrl, getSubmitErrorDetails } from './submitTab.utils'
import { SubmitTabAttachments } from './SubmitTabAttachments'
import type { CreateFeatureRequestInput } from '../../hooks/useFeatureRequests'
import { CategoryPicker } from './CategoryPicker'
import { SubmitFormFields } from './SubmitFormFields'
import { SubmitAuthGateBanner } from './SubmitAuthGateBanner'
import { SubmitTokenWarning } from './SubmitTokenWarning'
import { SubmitErrorPanel } from './SubmitErrorPanel'
import { useSubmitFormHandler } from './useSubmitFormHandler'

export { SuccessView } from './SubmitTabSuccessView'

// ── Submit Form ──

interface SubmitFormProps {
  description: string
  setDescription: (v: string) => void
  requestType: RequestType
  setRequestType: (v: RequestType) => void
  targetRepo: TargetRepo
  setTargetRepo: (v: TargetRepo) => void
  screenshots: ScreenshotItem[]
  setScreenshots: React.Dispatch<React.SetStateAction<ScreenshotItem[]>>
  isSubmitting: boolean
  canPerformActions: boolean
  feedbackTokenMissing: boolean
  editingDraftId: string | null
  setEditingDraftId: (id: string | null) => void
  initialRequestType?: RequestType
  error: string | null
  setError: (v: string | null) => void
  isPreviewFullscreen: boolean
  setIsPreviewFullscreen: (v: boolean) => void
  setPreviewImageSrc: (v: string | null) => void
  onSubmit: (payload: CreateFeatureRequestInput, options?: { timeout: number }) => Promise<{ github_issue_url?: string; screenshots_uploaded?: number; screenshots_failed?: number; warning?: string }>
  onSuccess: (result: SuccessState) => void
  onShowSetupDialog: () => void
  onShowLoginPrompt: () => void
  onReauthenticate: () => void
}

export function SubmitForm({
  description,
  setDescription,
  requestType,
  setRequestType,
  targetRepo,
  setTargetRepo,
  screenshots,
  setScreenshots,
  isSubmitting,
  canPerformActions,
  feedbackTokenMissing,
  editingDraftId,
  setEditingDraftId,
  initialRequestType,
  error,
  setError,
  isPreviewFullscreen,
  setIsPreviewFullscreen,
  setPreviewImageSrc,
  onSubmit,
  onSuccess,
  onShowSetupDialog,
  onShowLoginPrompt,
  onReauthenticate,
}: SubmitFormProps) {
  const { t } = useTranslation()
  const directIssueUrl = buildDirectIssueUrl(targetRepo, description)
  const errorDetails = error ? getSubmitErrorDetails(error, canPerformActions, t as unknown as (key: string, defaultValue?: string) => string) : null
  const bugReportExample = t(
    'feedback.exampleBugReportBody',
    'Example bug report: (replace this with a detailed bug report)\n\nWhat happened:\nThe GPU utilization card shows 0% even though pods are running.\n\nWhat I expected:\nGPU metrics should reflect actual usage from nvidia-smi.\n\nSteps to reproduce:\n1. Deploy a GPU workload\n2. Open the dashboard\n3. Check the GPU card',
  )
  const featureRequestExample = t(
    'feedback.exampleFeatureRequestBody',
    'Example feature request: (replace this with your feature request)\n\nWhat I want:\nAdd a button to export dashboard data as CSV.\n\nWhy it would be useful:\nI need to share cluster metrics with my team in spreadsheets.\n\nAdditional context:\nShould include all visible card data with timestamps.',
  )
  const descriptionExample = requestType === 'bug' ? bugReportExample : featureRequestExample
  const descriptionPlaceholder = requestType === 'bug'
    ? t('feedback.descriptionPlaceholderBug', 'Describe the bug in your own words. See the full example below.')
    : t('feedback.descriptionPlaceholderFeature', 'Describe the feature in your own words. See the full example below.')
  const [descriptionTab, setDescriptionTab] = useState<'write' | 'preview'>('write')
  const [parentIssueNumber, setParentIssueNumber] = useState('')
  const [canLinkParentIssue, setCanLinkParentIssue] = useState(false)
  const [isCheckingParentIssueAccess, setIsCheckingParentIssueAccess] = useState(false)

  const { handleSubmit } = useSubmitFormHandler({
    description,
    requestType,
    targetRepo,
    screenshots,
    canPerformActions,
    parentIssueNumber,
    canLinkParentIssue,
    onSubmit,
    onSuccess,
    onShowLoginPrompt,
    setError,
  })

  // Close fullscreen preview on Escape key
  const handleFullscreenKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setIsPreviewFullscreen(false)
  }, [setIsPreviewFullscreen])

  useEffect(() => {
    if (isPreviewFullscreen) {
      document.addEventListener('keydown', handleFullscreenKeyDown)
      return () => document.removeEventListener('keydown', handleFullscreenKeyDown)
    }
  }, [isPreviewFullscreen, handleFullscreenKeyDown])

  useEffect(() => {
    if (!canPerformActions || requestType !== 'bug') {
      setCanLinkParentIssue(false)
      setIsCheckingParentIssueAccess(false)
      return
    }

    let isCurrent = true
    setIsCheckingParentIssueAccess(true)

    ;(async () => {
      try {
        const { data } = await api.get<{ can_link_parent?: boolean }>(`/api/feedback/issue-link-capabilities?target_repo=${targetRepo}`, {
          timeout: FETCH_DEFAULT_TIMEOUT_MS,
        })
        if (isCurrent) {
          setCanLinkParentIssue(data.can_link_parent === true)
        }
      } catch {
        if (isCurrent) setCanLinkParentIssue(false)
      } finally {
        if (isCurrent) setIsCheckingParentIssueAccess(false)
      }
    })()

    return () => {
      isCurrent = false
    }
  }, [canPerformActions, requestType, targetRepo])

  useEffect(() => {
    if (!canLinkParentIssue) setParentIssueNumber('')
  }, [canLinkParentIssue, targetRepo])

  const { showToast } = useToast()
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'))
    if (imageItems.length === 0) return
    e.preventDefault()
    imageItems.forEach(item => {
      const file = item.getAsFile()
      if (file) {
        const reader = new FileReader()
        reader.onload = (ev) => setScreenshots(prev => [...prev, { file, preview: ev.target?.result as string, mediaType: 'image' }])
        reader.onerror = () => showToast('Failed to read pasted image. Try attaching the file instead.', 'error')
        reader.readAsDataURL(file)
      }
    })
    showToast(`Screenshot${imageItems.length > 1 ? 's' : ''} added`, 'success')
  }

  const isAuthGated = !canPerformActions
  const inputsDisabled = isSubmitting || isAuthGated

  return (
    <form id="feedback-form" onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="p-4 space-y-4 flex-1 flex flex-col min-h-0 overflow-y-auto">
        {isAuthGated && (
          <SubmitAuthGateBanner directIssueUrl={directIssueUrl} onShowLoginPrompt={onShowLoginPrompt} />
        )}

        {/* Warning banner when FEEDBACK_GITHUB_TOKEN is not configured */}
        {feedbackTokenMissing && (
          <SubmitTokenWarning targetRepo={targetRepo} description={description} />
        )}

        {/* Editing draft banner */}
        {editingDraftId && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <FileText className="w-4 h-4 text-orange-400 shrink-0" />
            <span className="text-xs text-orange-400">Editing a saved draft</span>
            <button
              type="button"
              onClick={() => {
                setEditingDraftId(null)
                setDescription('')
                setRequestType(initialRequestType || 'bug')
                setTargetRepo('console')
              }}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          </div>
        )}

        <CategoryPicker
          requestType={requestType}
          setRequestType={setRequestType}
          targetRepo={targetRepo}
          setTargetRepo={setTargetRepo}
          inputsDisabled={inputsDisabled}
        />

        {(requestType === 'bug' && (canLinkParentIssue || isCheckingParentIssueAccess)) && (
          <details className="rounded-lg border border-border bg-secondary/20 px-3 py-2">
            <summary className="cursor-pointer list-none text-xs font-medium text-foreground">
              {t('feedback.linkToParentIssue', 'Link to parent issue')}
            </summary>
            <div className="mt-3 space-y-2">
              {isCheckingParentIssueAccess ? (
                <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <p>{t('feedback.checkingIssueLinkAccess', 'Checking repository access…')}</p>
                </div>
              ) : canLinkParentIssue ? (
                <>
                  <label htmlFor="feedback-parent-issue" className="block text-xs font-medium text-muted-foreground">
                    {t('feedback.parentIssueNumber', 'Parent issue number')}
                  </label>
                  <input
                    id="feedback-parent-issue"
                    type="number"
                    min={MIN_PARENT_ISSUE_NUMBER}
                    inputMode="numeric"
                    value={parentIssueNumber}
                    onChange={e => setParentIssueNumber(e.target.value)}
                    disabled={inputsDisabled}
                    placeholder="12345"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-hidden transition-colors focus:border-purple-500 disabled:opacity-60"
                  />
                  <p className="text-2xs text-muted-foreground">
                    {t('feedback.parentIssueHelp', 'If provided, this report will be linked as a child issue after submission.')}
                  </p>
                </>
              ) : null}
            </div>
          </details>
        )}

        {/* Description */}
        <SubmitFormFields
          description={description}
          setDescription={setDescription}
          requestType={requestType}
          descriptionTab={descriptionTab}
          setDescriptionTab={setDescriptionTab}
          isPreviewFullscreen={isPreviewFullscreen}
          setIsPreviewFullscreen={setIsPreviewFullscreen}
          inputsDisabled={inputsDisabled}
          handlePaste={handlePaste}
          isSubmitting={isSubmitting}
          descriptionExample={descriptionExample}
          descriptionPlaceholder={descriptionPlaceholder}
        />

        {/* Attachment Upload (images & videos) */}
        <SubmitTabAttachments
          screenshots={screenshots}
          setScreenshots={setScreenshots}
          setPreviewImageSrc={setPreviewImageSrc}
          inputsDisabled={inputsDisabled}
        />

        {/* Error with actionable guidance */}
        {errorDetails && (
          <SubmitErrorPanel
            errorDetails={errorDetails}
            directIssueUrl={directIssueUrl}
            setError={setError}
            onShowSetupDialog={onShowSetupDialog}
            onReauthenticate={onReauthenticate}
          />
        )}

        {/* Info */}
        <p className="text-xs text-muted-foreground">
          {t('feedback.submitInfo')}
        </p>
      </div>
    </form>
  )
}


export { SubmitFooter } from './SubmitTabFooter'
