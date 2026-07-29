/**
 * useSubmitFormHandler — owns SubmitForm's non-JSX state: description tab
 * toggle, parent-issue linking, fullscreen preview keyboard handling,
 * paste-to-attach, and the submit handler itself (diagnostics collection +
 * API call). Extracted from SubmitTab.tsx — no behaviour change.
 */

import { useState, useCallback, useEffect } from 'react'
import { useToast } from '../ui/Toast'
import { api } from '../../lib/api'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { FEEDBACK_UPLOAD_TIMEOUT_MS } from '../../lib/constants/network'
import { compressScreenshot } from '../../lib/imageCompression'
import { useBackendHealth } from '../../hooks/useBackendHealth'
import { useKagentBackend } from '../../hooks/useKagentBackend'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import type { CreateFeatureRequestInput } from '../../hooks/useFeatureRequests'
import type { RequestType, TargetRepo, ScreenshotItem, SuccessState } from './FeatureRequestTypes'
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

interface UseSubmitFormHandlerArgs {
  description: string
  setScreenshots: React.Dispatch<React.SetStateAction<ScreenshotItem[]>>
  requestType: RequestType
  targetRepo: TargetRepo
  screenshots: ScreenshotItem[]
  canPerformActions: boolean
  error: string | null
  setError: (v: string | null) => void
  isPreviewFullscreen: boolean
  setIsPreviewFullscreen: (v: boolean) => void
  onSubmit: (payload: CreateFeatureRequestInput, options?: { timeout: number }) => Promise<{ github_issue_url?: string; screenshots_uploaded?: number; screenshots_failed?: number; warning?: string }>
  onSuccess: (result: SuccessState) => void
  onShowLoginPrompt: () => void
  t: (key: string, defaultValue?: string) => string
}

export function useSubmitFormHandler({
  description,
  setScreenshots,
  requestType,
  targetRepo,
  screenshots,
  canPerformActions,
  error,
  setError,
  isPreviewFullscreen,
  setIsPreviewFullscreen,
  onSubmit,
  onSuccess,
  onShowLoginPrompt,
  t,
}: UseSubmitFormHandlerArgs) {
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

  return {
    directIssueUrl,
    errorDetails,
    descriptionExample,
    descriptionPlaceholder,
    descriptionTab, setDescriptionTab,
    parentIssueNumber, setParentIssueNumber,
    canLinkParentIssue,
    isCheckingParentIssueAccess,
    handlePaste,
    handleSubmit,
  }
}
