import { useTranslation } from 'react-i18next'
import { useToast } from '../ui/Toast'
import { useBackendHealth } from '../../hooks/useBackendHealth'
import { useKagentBackend } from '../../hooks/useKagentBackend'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { compressScreenshot } from '../../lib/imageCompression'
import { FEEDBACK_UPLOAD_TIMEOUT_MS } from '../../lib/constants/network'
import {
  isFeedbackRequestBodyTooLarge,
  isFeedbackRequestBodyLimitError,
  MIN_TITLE_LENGTH,
  MIN_DESCRIPTION_LENGTH,
  MIN_DESCRIPTION_WORDS,
  MAX_TITLE_LENGTH,
  EMPTY_FILE_SIZE_BYTES,
} from './FeatureRequestTypes'
import type { RequestType, TargetRepo, ScreenshotItem, SuccessState } from './FeatureRequestTypes'
import {
  ALL_CLUSTERS_CONTEXT_LABEL,
  MAX_AGENT_CONNECTION_LOG_LINES,
  MIN_PARENT_ISSUE_NUMBER,
} from './submitTab.utils'
import type { CreateFeatureRequestInput } from '../../hooks/useFeatureRequests'

interface UseSubmitFormHandlerOptions {
  description: string
  requestType: RequestType
  targetRepo: TargetRepo
  screenshots: ScreenshotItem[]
  canPerformActions: boolean
  parentIssueNumber: string
  canLinkParentIssue: boolean
  onSubmit: (payload: CreateFeatureRequestInput, options?: { timeout: number }) => Promise<{ github_issue_url?: string; screenshots_uploaded?: number; screenshots_failed?: number; warning?: string }>
  onSuccess: (result: SuccessState) => void
  onShowLoginPrompt: () => void
  setError: (v: string | null) => void
}

export function useSubmitFormHandler({
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
}: UseSubmitFormHandlerOptions) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const { health: agentHealth, status: agentStatus, dataErrorCount: agentDataErrorCount, lastDataError: agentLastDataError, connectionEvents } = useLocalAgent()
  const { status: backendStatus, isInClusterMode } = useBackendHealth()
  const { activeBackend } = useKagentBackend()
  const { selectedClusters } = useGlobalFilters()

  const requestBodyTooLargeMessage = t(
    'feedback.attachmentsTooLarge',
    'Attachments are too large to submit. Keep each video at or below 10 MB and reduce the total attachment payload before retrying.',
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!canPerformActions) { onShowLoginPrompt(); return }

    const trimmed = description.trim()
    const lines = trimmed.split('\n')
    const extractedTitle = lines[0].trim().substring(0, MAX_TITLE_LENGTH)
    const extractedDesc = lines.length > 1 ? lines.slice(1).join('\n').trim() || extractedTitle : extractedTitle

    if (extractedTitle.length < MIN_TITLE_LENGTH) { setError('Title (first line) must be at least 10 characters'); return }
    if (extractedDesc.length < MIN_DESCRIPTION_LENGTH) { setError('Description must be at least 20 characters'); return }
    if (extractedDesc.split(/\s+/).filter(Boolean).length < MIN_DESCRIPTION_WORDS) { setError('Description must contain at least 3 words'); return }

    const hasZeroByteAttachment = screenshots.some(({ file }) => file.size === EMPTY_FILE_SIZE_BYTES)
    if (hasZeroByteAttachment) {
      setError(t('feedback.invalidAttachmentRestore', 'One or more attachments could not be restored. Remove them or re-attach the original file before submitting.'))
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
        ...(parsedParentIssueNumber && canLinkParentIssue && { parent_issue_number: parsedParentIssueNumber }),
        ...(hasScreenshots && { screenshots: screenshotDataURIs }),
        ...(browserErrors.length > 0 && { console_errors: browserErrors }),
        ...(failedApiCalls.length > 0 && { failed_api_calls: failedApiCalls }),
      }

      if (isFeedbackRequestBodyTooLarge(submissionPayload)) {
        setError(requestBodyTooLargeMessage)
        showToast(requestBodyTooLargeMessage, 'error')
        return
      }

      const result = await onSubmit(submissionPayload, hasScreenshots ? { timeout: FEEDBACK_UPLOAD_TIMEOUT_MS } : undefined)
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
      if (isFeedbackRequestBodyLimitError(message)) showToast(normalizedMessage, 'error')
      setError(normalizedMessage)
    }
  }

  return { handleSubmit }
}
