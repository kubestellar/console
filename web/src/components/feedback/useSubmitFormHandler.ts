import { useState, useCallback, useEffect } from 'react'
import { api } from '../../lib/api'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { FEEDBACK_UPLOAD_TIMEOUT_MS } from '../../lib/constants/network'
import { compressScreenshot } from '../../lib/imageCompression'
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
import { MIN_PARENT_ISSUE_NUMBER } from './submitTab.utils'

interface UseSubmitFormHandlerOptions {
  description: string
  requestType: RequestType
  targetRepo: TargetRepo
  screenshots: ScreenshotItem[]
  canPerformActions: boolean
  isPreviewFullscreen: boolean
  setIsPreviewFullscreen: (v: boolean) => void
  error: string | null
  setError: (v: string | null) => void
  requestBodyTooLargeMessage: string
  onSubmit: (payload: CreateFeatureRequestInput, options?: { timeout: number }) => Promise<{ github_issue_url?: string; screenshots_uploaded?: number; screenshots_failed?: number; warning?: string }>
  onSuccess: (result: SuccessState) => void
  onShowLoginPrompt: () => void
  t: (key: string, defaultValue?: string) => string
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void
  agentHealth: { version?: string; commitSHA?: string; buildTime?: string; goVersion?: string; os?: string; arch?: string; install_method?: string; clusters?: number } | null | undefined
  agentStatus: string | undefined
  agentDataErrorCount: number
  agentLastDataError: string | null | undefined
  connectionEvents: { timestamp: Date; type: string; message: string }[] | undefined
  backendStatus: string | undefined
  isInClusterMode: boolean
  activeBackend: string | null | undefined
  selectedClusters: string[] | undefined
  maxAgentConnectionLogLines: number
  allClustersContextLabel: string
}

export function useSubmitFormHandler({
  description,
  requestType,
  targetRepo,
  screenshots,
  canPerformActions,
  isPreviewFullscreen,
  setIsPreviewFullscreen,
  error: _error,
  setError,
  requestBodyTooLargeMessage,
  onSubmit,
  onSuccess,
  onShowLoginPrompt,
  t,
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
  maxAgentConnectionLogLines,
  allClustersContextLabel,
}: UseSubmitFormHandlerOptions) {
  const [descriptionTab, setDescriptionTab] = useState<'write' | 'preview'>('write')
  const [parentIssueNumber, setParentIssueNumber] = useState('')
  const [canLinkParentIssue, setCanLinkParentIssue] = useState(false)
  const [isCheckingParentIssueAccess, setIsCheckingParentIssueAccess] = useState(false)

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
        : allClustersContextLabel
      const agentConnectionLog = (connectionEvents || []).length > 0
        ? (connectionEvents || [])
          .slice(0, maxAgentConnectionLogLines)
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
    descriptionTab,
    setDescriptionTab,
    parentIssueNumber,
    setParentIssueNumber,
    canLinkParentIssue,
    isCheckingParentIssueAccess,
    handleSubmit,
  }
}
