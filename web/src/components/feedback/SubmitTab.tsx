import { useState, useCallback, useEffect } from 'react'
import {
  ExternalLink, FileText, Lock, AlertTriangle,
} from 'lucide-react'
import { Github } from '@/lib/icons'
import { Button } from '../ui/Button'
import { isDemoModeForced } from '../../lib/demoMode'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { api } from '../../lib/api'
import { FEEDBACK_UPLOAD_TIMEOUT_MS } from '../../lib/constants/network'
import { GITHUB_TOKEN_CREATE_URL, GITHUB_TOKEN_FINE_GRAINED_PERMISSIONS } from '../../lib/constants/github-token'
import { compressScreenshot } from '../../lib/imageCompression'
import { useToast } from '../ui/Toast'
import { useTranslation } from 'react-i18next'
import { useBackendHealth } from '../../hooks/useBackendHealth'
import { useKagentBackend } from '../../hooks/useKagentBackend'
import { sanitizeUrl } from '@/lib/utils/sanitizeUrl'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import type { CreateFeatureRequestInput } from '../../hooks/useFeatureRequests'
import type { RequestType } from './FeatureRequestTypes'
import type { SubmitFormProps } from './submitTab.types'
import {
  MIN_TITLE_LENGTH,
  MIN_DESCRIPTION_LENGTH,
  MIN_DESCRIPTION_WORDS,
  MAX_TITLE_LENGTH,
  EMPTY_FILE_SIZE_BYTES,
  isFeedbackRequestBodyTooLarge,
  isFeedbackRequestBodyLimitError,
} from './FeatureRequestTypes'

import {
  ALL_CLUSTERS_CONTEXT_LABEL,
  buildDirectIssueUrl,
  getSubmitErrorDetails,
  MAX_AGENT_CONNECTION_LOG_LINES,
  MIN_PARENT_ISSUE_NUMBER,
} from './submitTab.utils'

import { CategoryPicker } from './CategoryPicker'
import { SubmitFormFields } from './SubmitFormFields'
import { getSettingsWithHash } from '../../config/routes'

export { SuccessView } from './SuccessView'

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
  const [descriptionTab, setDescriptionTab] = useState<'write' | 'preview'>('write')
  const requestBodyTooLargeMessage = t(
    'feedback.attachmentsTooLarge',
    'Attachments are too large to submit. Keep each video at or below 10 MB and reduce the total attachment payload before retrying.',
  )
  const [parentIssueNumber, setParentIssueNumber] = useState('')
  const [canLinkParentIssue, setCanLinkParentIssue] = useState(false)
  const [isCheckingParentIssueAccess, setIsCheckingParentIssueAccess] = useState(false)

  // Close fullscreen preview on Escape key
  const handleFullscreenKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsPreviewFullscreen(false)
    }
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
    if (!canLinkParentIssue) {
      setParentIssueNumber('')
    }
  }, [canLinkParentIssue, targetRepo])

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



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!canPerformActions) {
      onShowLoginPrompt()
      return
    }

    const trimmed = description.trim()
    const lines = trimmed.split('\n')
    const extractedTitle = lines[0].trim().substring(0, MAX_TITLE_LENGTH)
    const extractedDesc = lines.length > 1 ? lines.slice(1).join('\n').trim() || extractedTitle : extractedTitle

    if (extractedTitle.length < MIN_TITLE_LENGTH) {
      setError('Title (first line) must be at least 10 characters')
      return
    }
    if (extractedDesc.length < MIN_DESCRIPTION_LENGTH) {
      setError('Description must be at least 20 characters')
      return
    }
    if (extractedDesc.split(/\s+/).filter(Boolean).length < MIN_DESCRIPTION_WORDS) {
      setError('Description must contain at least 3 words')
      return
    }

    const hasZeroByteAttachment = screenshots.some(({ file }) => file.size === EMPTY_FILE_SIZE_BYTES)
    if (hasZeroByteAttachment) {
      setError(t(
        'feedback.invalidAttachmentRestore',
        'One or more attachments could not be restored. Remove them or re-attach the original file before submitting.',
      ))
      return
    }

    const trimmedParentIssueNumber = parentIssueNumber.trim()
    let parsedParentIssueNumber: number | undefined
    if (trimmedParentIssueNumber) {
      parsedParentIssueNumber = Number.parseInt(trimmedParentIssueNumber, 10)
      if (!Number.isInteger(parsedParentIssueNumber) || parsedParentIssueNumber < MIN_PARENT_ISSUE_NUMBER) {
        setError(t('feedback.parentIssueNumberInvalid', 'Parent issue number must be a positive integer.'))
        return
      }
    }

    const screenshotDataURIs: string[] = []
    for (const s of screenshots) {
      if (s.mediaType === 'video') {
        // Videos are passed through without compression
        screenshotDataURIs.push(s.preview)
      } else {
        const compressed = await compressScreenshot(s.preview)
        if (compressed) screenshotDataURIs.push(compressed)
      }
    }

    try {
      const hasScreenshots = screenshotDataURIs.length > 0
      const { getRecentBrowserErrors, getRecentFailedApiCalls } = await import('../../lib/analytics-core')
      const browserErrors = requestType === 'bug' ? getRecentBrowserErrors() : []
      const failedApiCalls = getRecentFailedApiCalls()

      const selectedClusterContext = (selectedClusters || []).length > 0
        ? (selectedClusters || []).join(', ')
        : ALL_CLUSTERS_CONTEXT_LABEL
      const agentConnectionLog = (connectionEvents || []).length > 0
        ? (connectionEvents || [])
          .slice(0, MAX_AGENT_CONNECTION_LOG_LINES)
          .map(event => `[${event.timestamp.toISOString()}] ${event.type}: ${event.message}`)
        : isInClusterMode
          ? [`[${new Date().toISOString()}] connected: Using in-cluster service`]
          : []
      const diagnostics = {
        agent_version: agentHealth?.version,
        commit_sha: agentHealth?.commitSHA,
        build_time: agentHealth?.buildTime,
        go_version: agentHealth?.goVersion,
        agent_os: agentHealth?.os,
        agent_arch: agentHealth?.arch,
        install_method: agentHealth?.install_method,
        clusters: agentHealth?.clusters,
        cluster_context: selectedClusterContext,
        console_deploy_mode: isInClusterMode ? 'in-cluster' : 'local',
        active_agent_backend: activeBackend,
        backend_ws_status: backendStatus,
        agent_connection_status: agentStatus,
        agent_connection_failures: agentDataErrorCount,
        agent_last_error: agentLastDataError ?? undefined,
        ...(agentConnectionLog.length > 0 && { agent_connection_log: agentConnectionLog }),
        browser_user_agent: navigator.userAgent,
        browser_platform: navigator.platform,
        browser_language: navigator.language,
        screen_resolution: `${screen.width}x${screen.height}`,
        window_size: `${window.innerWidth}x${window.innerHeight}`,
        page_url: `${window.location.origin}${window.location.pathname}`,
      }

      const submissionPayload: CreateFeatureRequestInput = {
        title: extractedTitle,
        description: extractedDesc,
        request_type: requestType,
        target_repo: targetRepo,
        diagnostics,
        ...(parsedParentIssueNumber && { parent_issue_number: parsedParentIssueNumber }),
        ...(hasScreenshots && { screenshots: screenshotDataURIs }),
        ...(browserErrors.length > 0 && { console_errors: browserErrors }),
        ...(failedApiCalls.length > 0 && { failed_api_calls: failedApiCalls }),
      }
      if (isFeedbackRequestBodyTooLarge(submissionPayload)) {
        setError(requestBodyTooLargeMessage)
        showToast(requestBodyTooLargeMessage, 'error')
        return
      }

      const result = await onSubmit(
        submissionPayload,
        hasScreenshots ? { timeout: FEEDBACK_UPLOAD_TIMEOUT_MS } : undefined,
      )
      onSuccess({
        issueUrl: result.github_issue_url,
        screenshotsUploaded: result.screenshots_uploaded,
        screenshotsFailed: result.screenshots_failed,
        warning: result.warning,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : ''
      const normalizedMessage = isFeedbackRequestBodyLimitError(message)
        ? requestBodyTooLargeMessage
        : message || t('feedback.submitFailed')
      if (isFeedbackRequestBodyLimitError(message)) {
        showToast(normalizedMessage, 'error')
      }
      setError(normalizedMessage)
    }
  }

  const isAuthGated = !canPerformActions
  const inputsDisabled = isSubmitting || isAuthGated

  return (
    <form id="feedback-form" onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="p-4 space-y-4 flex-1 flex flex-col min-h-0 overflow-y-auto">
        {isAuthGated && (
          <div
            role="region"
            aria-label={t('feedback.authGateTitle')}
            className="flex items-start gap-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/40"
          >
            <div className="w-9 h-9 rounded-full bg-yellow-500/20 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 text-yellow-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-yellow-400 mb-1">
                {t('feedback.authGateTitle')}
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                {isDemoModeForced
                  ? t('feedback.authGateBodyDemo')
                  : t('feedback.authGateBodyLocal')}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="accent"
                  size="md"
                  icon={<Github className="w-3.5 h-3.5" />}
                  onClick={onShowLoginPrompt}
                >
                  {isDemoModeForced
                    ? t('feedback.loginWithGitHub')
                    : t('feedback.setupOAuth')}
                </Button>
                <a
                  href={sanitizeUrl(directIssueUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-border text-foreground hover:bg-secondary/50 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {t('feedback.openGitHubIssue')}
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Warning banner when FEEDBACK_GITHUB_TOKEN is not configured */}
        {feedbackTokenMissing && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-yellow-400 mb-1">
                GitHub integration not configured
              </p>
              <p className="text-muted-foreground text-xs">
                The <code className="px-1 py-0.5 rounded bg-secondary text-foreground text-2xs">FEEDBACK_GITHUB_TOKEN</code> is
                not set. Issue submission requires a GitHub personal access token with these permissions:
              </p>
              <ul className="text-muted-foreground text-xs list-disc ml-4 mt-1 space-y-0.5">
                {GITHUB_TOKEN_FINE_GRAINED_PERMISSIONS.map(p => (
                  <li key={p.scope}><em>{p.scope}</em> — to {p.reason}</li>
                ))}
              </ul>
              <div className="text-muted-foreground text-xs mt-1.5 flex flex-wrap gap-1 items-center">
                <a
                  href={sanitizeUrl(buildDirectIssueUrl(targetRepo, description))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300 underline underline-offset-2"
                >
                  Report on GitHub
                </a>
                <span>{' · '}</span>
                <button
                  type="button"
                  onClick={() => window.open(GITHUB_TOKEN_CREATE_URL, '_blank', 'noopener,noreferrer')}
                  className="text-purple-400 hover:text-purple-300 underline underline-offset-2"
                >
                  Create token on GitHub
                </button>
                <span>{' · '}</span>
                <button
                  type="button"
                  onClick={() => { window.location.href = getSettingsWithHash('github-token') }}
                  className="text-purple-400 hover:text-purple-300 underline underline-offset-2 p-0 h-auto bg-transparent border-none"
                >
                  Console Settings
                </button>
              </div>
            </div>
          </div>
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
          canLinkParentIssue={canLinkParentIssue}
          isCheckingParentIssueAccess={isCheckingParentIssueAccess}
          parentIssueNumber={parentIssueNumber}
          setParentIssueNumber={setParentIssueNumber}
          inputsDisabled={inputsDisabled}
          t={t}
        />

        <SubmitFormFields
          descriptionTab={descriptionTab}
          setDescriptionTab={setDescriptionTab}
          description={description}
          setDescription={setDescription}
          descriptionPlaceholder={descriptionPlaceholder}
          descriptionExample={descriptionExample}
          screenshots={screenshots}
          setScreenshots={setScreenshots}
          setPreviewImageSrc={setPreviewImageSrc}
          setIsPreviewFullscreen={setIsPreviewFullscreen}
          inputsDisabled={inputsDisabled}
          isSubmitting={isSubmitting}
          onPaste={handlePaste}
          errorDetails={errorDetails}
          directIssueUrl={directIssueUrl}
          onReauthenticate={onReauthenticate}
          onShowSetupDialog={onShowSetupDialog}
          setError={setError}
          t={t}
        />
      </div>
    </form>
  )
}


export { SubmitFooter } from './SubmitTabFooter'
