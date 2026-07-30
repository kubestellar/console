import { Settings, ExternalLink, Loader2 } from 'lucide-react'
import { Github } from '@/lib/icons'
import { cn } from '@/lib/cn'
import { useToast } from '../ui/Toast'
import { useTranslation } from 'react-i18next'
import { useBackendHealth } from '../../hooks/useBackendHealth'
import { useKagentBackend } from '../../hooks/useKagentBackend'
import { sanitizeUrl } from '@/lib/utils/sanitizeUrl'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import type { CreateFeatureRequestInput } from '../../hooks/useFeatureRequests'
import type { RequestType, TargetRepo, ScreenshotItem, SuccessState } from './FeatureRequestTypes'
import {
  ALL_CLUSTERS_CONTEXT_LABEL,
  buildDirectIssueUrl,
  getSubmitErrorDetails,
  MAX_AGENT_CONNECTION_LOG_LINES,
  MIN_PARENT_ISSUE_NUMBER,
} from './submitTab.utils'

import { SubmitTabAttachments } from './SubmitTabAttachments'
import { AuthGateBanner, FeedbackTokenMissingBanner, EditingDraftBanner, SubmitTypeSelector, RepositorySelector } from './SubmitTab.parts'
import { SubmitFormFields } from './SubmitFormFields'
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
  const { showToast } = useToast()
  const {
    health: agentHealth,
    status: agentStatus,
    dataErrorCount: agentDataErrorCount,
    lastDataError: agentLastDataError,
    connectionEvents,
  } = useLocalAgent()
  const { status: backendStatus, isInClusterMode } = useBackendHealth()
  const { activeBackend } = useKagentBackend()
  const { selectedClusters } = useGlobalFilters()
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
  const requestBodyTooLargeMessage = t(
    'feedback.attachmentsTooLarge',
    'Attachments are too large to submit. Keep each video at or below 10 MB and reduce the total attachment payload before retrying.',
  )

  const {
    descriptionTab,
    setDescriptionTab,
    parentIssueNumber,
    setParentIssueNumber,
    canLinkParentIssue,
    isCheckingParentIssueAccess,
    handleSubmit,
  } = useSubmitFormHandler({
    description,
    requestType,
    targetRepo,
    screenshots,
    canPerformActions,
    isPreviewFullscreen,
    setIsPreviewFullscreen,
    error,
    setError,
    requestBodyTooLargeMessage,
    onSubmit,
    onSuccess,
    onShowLoginPrompt,
    t: t as unknown as (key: string, defaultValue?: string) => string,
    showToast,
    agentHealth,
    agentStatus,
    agentDataErrorCount,
    agentLastDataError,
    connectionEvents,
    backendStatus,
    isInClusterMode,
    activeBackend,
    selectedClusters,
    maxAgentConnectionLogLines: MAX_AGENT_CONNECTION_LOG_LINES,
    allClustersContextLabel: ALL_CLUSTERS_CONTEXT_LABEL,
  })

  // Handle paste events to capture screenshots pasted into the textarea
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
        reader.onload = (ev) => {
          setScreenshots(prev => [...prev, { file, preview: ev.target?.result as string, mediaType: 'image' }])
        }
        reader.onerror = (err) => {
          console.error('[Attachment] Paste FileReader failed:', err)
          showToast('Failed to read pasted image. Try attaching the file instead.', 'error')
        }
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
          <AuthGateBanner directIssueUrl={directIssueUrl} onShowLoginPrompt={onShowLoginPrompt} />
        )}

        {feedbackTokenMissing && (
          <FeedbackTokenMissingBanner targetRepo={targetRepo} description={description} />
        )}

        <EditingDraftBanner
          editingDraftId={editingDraftId}
          setEditingDraftId={setEditingDraftId}
          setDescription={setDescription}
          setRequestType={setRequestType}
          setTargetRepo={setTargetRepo}
          initialRequestType={initialRequestType}
        />

        <SubmitTypeSelector requestType={requestType} setRequestType={setRequestType} inputsDisabled={inputsDisabled} />

        <RepositorySelector targetRepo={targetRepo} setTargetRepo={setTargetRepo} inputsDisabled={inputsDisabled} />

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
          descriptionPlaceholder={descriptionPlaceholder}
          descriptionExample={descriptionExample}
          isSubmitting={isSubmitting}
          inputsDisabled={inputsDisabled}
          isPreviewFullscreen={isPreviewFullscreen}
          setIsPreviewFullscreen={setIsPreviewFullscreen}
          onPaste={handlePaste}
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
          <div className="space-y-2">
            <p className="text-sm text-red-400">{errorDetails.message}</p>
            <div className="p-3 bg-secondary/30 border border-border rounded-lg">
              <p className="text-xs text-muted-foreground mb-2">
                {errorDetails.guidance}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={sanitizeUrl(directIssueUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs rounded-lg border border-border text-foreground hover:bg-secondary/50 transition-colors flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3 h-3" />
                  {t('feedback.openGitHubIssue')}
                </a>
                {errorDetails.action === 'reauthenticate' && (
                  <button
                    type="button"
                    onClick={onReauthenticate}
                    className="px-3 py-1.5 text-xs rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors flex items-center gap-1.5"
                  >
                    <Github className="w-3 h-3" />
                    {t('feedback.reauthenticateGitHub', 'Re-authenticate with GitHub')}
                  </button>
                )}
                {errorDetails.action === 'setup' && (
                  <button
                    type="button"
                    onClick={() => { setError(null); onShowSetupDialog() }}
                    className="px-3 py-1.5 text-xs rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors flex items-center gap-1.5"
                  >
                    <Settings className="w-3 h-3" />
                    {t('feedback.setupOAuth')}
                  </button>
                )}
              </div>
            </div>
          </div>
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
