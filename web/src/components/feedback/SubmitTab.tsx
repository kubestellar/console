import { useRef, useState, useCallback, useEffect } from 'react'
import {
  Bug, Sparkles, Loader2, ExternalLink, Bell,
  Check, Eye, Pencil, Settings, Maximize2,
  ImagePlus, Trash2, Copy, AlertTriangle, Monitor, BookOpen, FileText, Save, Lock,
  Film,
} from 'lucide-react'
import { Github } from '@/lib/icons'
import { Button } from '../ui/Button'
import { isDemoModeForced } from '../../lib/demoMode'
import { FETCH_DEFAULT_TIMEOUT_MS, COPY_FEEDBACK_TIMEOUT_MS } from '../../lib/constants'
import { FEEDBACK_UPLOAD_TIMEOUT_MS } from '../../lib/constants/network'
import { GITHUB_TOKEN_CREATE_URL, GITHUB_TOKEN_FINE_GRAINED_PERMISSIONS } from '../../lib/constants/github-token'
import { compressScreenshot } from '../../lib/imageCompression'
import { copyBlobToClipboard } from '../../lib/clipboard'
import { useToast } from '../ui/Toast'
import { useTranslation } from 'react-i18next'
import { LazyMarkdown as ReactMarkdown } from '../ui/LazyMarkdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { REWARD_ACTIONS } from '../../types/rewards'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import type { CreateFeatureRequestInput } from '../../hooks/useFeatureRequests'
import type { RequestType, TargetRepo, ScreenshotItem, SuccessState, TabType } from './FeatureRequestTypes'
import {
  MIN_DRAFT_LENGTH,
  MIN_TITLE_LENGTH,
  MIN_DESCRIPTION_LENGTH,
  MIN_DESCRIPTION_WORDS,
  MAX_TITLE_LENGTH,
  MAX_VIDEO_SIZE_BYTES,
  ACCEPTED_MEDIA_TYPES,
} from './FeatureRequestTypes'

// ── Success View (shown after successful submission) ──

interface SuccessViewProps {
  success: SuccessState
  screenshots: ScreenshotItem[]
  onViewUpdates: () => void
}

export function SuccessView({ success, screenshots, onViewUpdates }: SuccessViewProps) {
  const { t } = useTranslation()
  return (
    <div className="p-6 text-center flex-1 overflow-y-auto min-h-0">
      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
        <Sparkles className="w-6 h-6 text-green-400" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">
        {t('feedback.requestSubmitted')}
      </h3>
      <p className="text-sm text-muted-foreground mb-2">
        Your request has been submitted for review.
      </p>
      <p className="text-xs text-muted-foreground mb-4">
        Once a maintainer accepts triage, check the Activity tab for updates — our AI will start working on a fix.
      </p>
      <div className="flex items-center justify-center gap-3">
        {success.issueUrl && (
          <a
            href={success.issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300"
          >
            View on GitHub
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
        <button
          onClick={onViewUpdates}
          className="inline-flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300"
        >
          <Bell className="w-3 h-3" />
          View Updates
        </button>
      </div>

      {/* Attachment status */}
      {screenshots.length > 0 && (success.screenshotsUploaded ?? 0) > 0 && (
        <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <p className="text-xs text-green-400 font-medium">
            {(success.screenshotsUploaded ?? 0) === 1
              ? 'Attachment uploaded to the issue successfully.'
              : `${success.screenshotsUploaded} attachments uploaded to the issue successfully.`}
          </p>
        </div>
      )}
      {screenshots.length > 0 && (success.screenshotsFailed ?? 0) > 0 && (
        <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-xs text-yellow-400 font-medium">
            {success.screenshotsFailed === 1
              ? 'Attachment could not be uploaded — unsupported format or too large.'
              : `${success.screenshotsFailed} attachments could not be uploaded — unsupported format or too large.`}
          </p>
        </div>
      )}
    </div>
  )
}

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
  onSubmit: (payload: CreateFeatureRequestInput, options?: { timeout: number }) => Promise<{ github_issue_url?: string; screenshots_uploaded?: number; screenshots_failed?: number }>
  onSuccess: (result: SuccessState) => void
  onShowSetupDialog: () => void
  onShowLoginPrompt: () => void
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
}: SubmitFormProps) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const { health: agentHealth, status: agentStatus, dataErrorCount: agentDataErrorCount, lastDataError: agentLastDataError } = useLocalAgent()
  const [descriptionTab, setDescriptionTab] = useState<'write' | 'preview'>('write')
  const [isDragOver, setIsDragOver] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const screenshotInputRef = useRef<HTMLInputElement>(null)

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

  const handleScreenshotFiles = (files: FileList | null) => {
    if (!files) return
    const mediaFiles = Array.from(files).filter(f =>
      f.type.startsWith('image/') || f.type.startsWith('video/')
    )
    mediaFiles.forEach(file => {
      const isVideo = file.type.startsWith('video/')
      if (isVideo && file.size > MAX_VIDEO_SIZE_BYTES) {
        showToast(`Video "${file.name}" exceeds 10 MB limit. Please use a shorter or lower-resolution recording.`, 'error')
        return
      }
      const reader = new FileReader()
      reader.onload = (ev) => {
        setScreenshots(prev => [...prev, {
          file,
          preview: ev.target?.result as string,
          mediaType: isVideo ? 'video' : 'image',
        }])
      }
      reader.onerror = (err) => {
        console.error(`[Attachment] FileReader failed for ${file.name}:`, err)
        showToast(`Failed to read file "${file.name}". Try a different file.`, 'error')
      }
      reader.readAsDataURL(file)
    })
  }

  const handleScreenshotDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }
  const handleScreenshotDragLeave = () => setIsDragOver(false)
  const handleScreenshotDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    handleScreenshotFiles(e.dataTransfer.files)
  }

  const removeScreenshot = (index: number) => {
    setScreenshots(prev => prev.filter((_, i) => i !== index))
  }

  const copyScreenshotToClipboard = async (preview: string, index: number) => {
    try {
      const res = await fetch(preview, { signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      const blob = await res.blob()
      const ok = await copyBlobToClipboard(blob)
      if (!ok) {
        showToast('Could not copy image to clipboard (browser may not support image copy)', 'error')
        return
      }
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), COPY_FEEDBACK_TIMEOUT_MS)
    } catch {
      showToast('Could not copy image to clipboard', 'error')
    }
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

      const diagnostics = {
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
        page_url: window.location.href,
      }

      const result = await onSubmit(
        {
          title: extractedTitle,
          description: extractedDesc,
          request_type: requestType,
          target_repo: targetRepo,
          diagnostics,
          ...(hasScreenshots && { screenshots: screenshotDataURIs }),
          ...(browserErrors.length > 0 && { console_errors: browserErrors }),
          ...(failedApiCalls.length > 0 && { failed_api_calls: failedApiCalls }),
        },
        hasScreenshots ? { timeout: FEEDBACK_UPLOAD_TIMEOUT_MS } : undefined,
      )
      onSuccess({
        issueUrl: result.github_issue_url,
        screenshotsUploaded: result.screenshots_uploaded,
        screenshotsFailed: result.screenshots_failed,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : ''
      try {
        const parsed = JSON.parse(message)
        setError(parsed.error || parsed.message || t('feedback.submitFailed'))
      } catch {
        setError(message || t('feedback.submitFailed'))
      }
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
                  href="https://github.com/kubestellar/console/issues/new"
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
              <div className="text-muted-foreground text-xs mt-1.5">
                <a href={GITHUB_TOKEN_CREATE_URL} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline underline-offset-2">Create token on GitHub</a>
                {' · '}
                <button
                  type="button"
                  onClick={() => { window.location.href = '/settings#github-token' }}
                  className="text-purple-400 hover:text-purple-300 underline underline-offset-2"
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

        {/* Type Selection */}
        <fieldset
          disabled={inputsDisabled}
          className="flex gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          aria-disabled={inputsDisabled}
        >
          <button
            type="button"
            onClick={() => setRequestType('bug')}
            disabled={inputsDisabled}
            className={`flex-1 p-3 rounded-lg border transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
              requestType === 'bug'
                ? 'bg-red-500/20 border-red-500/50 text-red-400'
                : 'border-border text-muted-foreground hover:border-muted-foreground'
            }`}
          >
            <Bug className="w-4 h-4" />
            {t('feedback.bugReport')}
            <span className="text-2xs text-muted-foreground">
              +{REWARD_ACTIONS.bug_report.coins}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setRequestType('feature')}
            disabled={inputsDisabled}
            className={`flex-1 p-3 rounded-lg border transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
              requestType === 'feature'
                ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
                : 'border-border text-muted-foreground hover:border-muted-foreground'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            {t('feedback.featureRequest')}
            <span className="text-2xs text-muted-foreground">
              +{REWARD_ACTIONS.feature_suggestion.coins}
            </span>
          </button>
        </fieldset>

        {/* Repository selector */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Where does this issue belong?
          </label>
          <fieldset
            disabled={inputsDisabled}
            className="flex gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            aria-disabled={inputsDisabled}
          >
            <button
              type="button"
              onClick={() => setTargetRepo('console')}
              disabled={inputsDisabled}
              className={`flex-1 p-2.5 rounded-lg border transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
                targetRepo === 'console'
                  ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                  : 'border-border text-muted-foreground hover:border-muted-foreground'
              }`}
            >
              <Monitor className="w-4 h-4" />
              <span className="text-sm">Console App</span>
            </button>
            <button
              type="button"
              onClick={() => setTargetRepo('docs')}
              disabled={inputsDisabled}
              className={`flex-1 p-2.5 rounded-lg border transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
                targetRepo === 'docs'
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                  : 'border-border text-muted-foreground hover:border-muted-foreground'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span className="text-sm">Console Docs</span>
            </button>
          </fieldset>
          {targetRepo === 'docs' && (
            <p className="text-2xs text-amber-400/80 mt-1">
              This issue will be filed on <span className="font-mono">kubestellar/docs</span>
            </p>
          )}
        </div>

        {/* Description */}
        <div className="flex flex-col">
          <div className="flex items-center gap-3 mb-1.5 border-b border-border">
            <button
              type="button"
              onClick={() => setDescriptionTab('write')}
              className={`flex items-center gap-1.5 pb-1.5 text-xs font-medium transition-colors ${
                descriptionTab === 'write'
                  ? 'text-foreground border-b-2 border-purple-500'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Pencil className="w-3 h-3" />
              Write
            </button>
            <button
              type="button"
              onClick={() => setDescriptionTab('preview')}
              className={`flex items-center gap-1.5 pb-1.5 text-xs font-medium transition-colors ${
                descriptionTab === 'preview'
                  ? 'text-foreground border-b-2 border-purple-500'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Eye className="w-3 h-3" />
              Preview
            </button>
            {descriptionTab === 'preview' && description.trim() && (
              <button
                type="button"
                onClick={() => setIsPreviewFullscreen(true)}
                className="ml-auto pb-1.5 text-muted-foreground hover:text-foreground transition-colors"
                title="Expand preview"
                aria-label="Expand preview to fullscreen"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {descriptionTab === 'write' ? (
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={e => {
                // Cmd+Enter (Mac) / Ctrl+Enter (Win/Linux) submits the form,
                // matching the convention used by GitHub, Slack, and other
                // compose-style modals. See issue #8651.
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isSubmitting) {
                  e.preventDefault()
                  e.currentTarget.form?.requestSubmit()
                }
              }}
              placeholder={
                requestType === 'bug'
                  ? 'Example bug report: (replace this with a detailed bug report)\n\nWhat happened:\nThe GPU utilization card shows 0% even though pods are running.\n\nWhat I expected:\nGPU metrics should reflect actual usage from nvidia-smi.\n\nSteps to reproduce:\n1. Deploy a GPU workload\n2. Open the dashboard\n3. Check the GPU card'
                  : 'Example feature request: (replace this with your feature request)\n\nWhat I want:\nAdd a button to export dashboard data as CSV.\n\nWhy it would be useful:\nI need to share cluster metrics with my team in spreadsheets.\n\nAdditional context:\nShould include all visible card data with timestamps.'
              }
              className="w-full h-[200px] px-3 py-2 bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50 resize-none font-mono text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={inputsDisabled}
              aria-disabled={inputsDisabled}
            />
          ) : (
            <div className="w-full h-[200px] overflow-y-auto px-3 py-2 bg-secondary/50 border border-border rounded-lg ghmd">
              {description.trim() ? (
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                  {description}
                </ReactMarkdown>
              ) : (
                <p className="text-muted-foreground italic">Nothing to preview</p>
              )}
            </div>
          )}
          <p className="text-2xs text-muted-foreground mt-1">
            First line becomes the title. Add details below.{' '}
            <span className="text-muted-foreground/70">{t('feedback.submitShortcutHint')}</span>
          </p>
        </div>

        {/* Attachment Upload (images & videos) */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Attachments <span className="font-normal">(optional — images &amp; videos)</span>
          </label>
          <div
            onDragOver={inputsDisabled ? undefined : handleScreenshotDragOver}
            onDragLeave={inputsDisabled ? undefined : handleScreenshotDragLeave}
            onDrop={inputsDisabled ? undefined : handleScreenshotDrop}
            onClick={inputsDisabled ? undefined : () => screenshotInputRef.current?.click()}
            aria-disabled={inputsDisabled}
            className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 border-dashed transition-colors ${
              inputsDisabled
                ? 'cursor-not-allowed opacity-60 border-border'
                : `cursor-pointer ${isDragOver
                  ? 'border-purple-400 bg-purple-500/10'
                  : 'border-border hover:border-muted-foreground'}`
            }`}
          >
            <div className="flex items-center gap-2">
              <ImagePlus className="w-5 h-5 text-muted-foreground" />
              <Film className="w-4 h-4 text-muted-foreground" />
            </div>
            <span className="text-xs text-muted-foreground text-center">Drop images or videos here, or click to browse</span>
            <span className="text-2xs text-muted-foreground/70">Videos: mp4, webm, mov (max 10 MB)</span>
            <input
              ref={screenshotInputRef}
              type="file"
              accept={ACCEPTED_MEDIA_TYPES}
              multiple
              disabled={inputsDisabled}
              onChange={e => handleScreenshotFiles(e.target.files)}
              className="hidden"
            />
          </div>
          {screenshots.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {screenshots.map((s, i) => (
                <div key={i} className="relative group w-20 h-20 shrink-0">
                  {s.mediaType === 'video' ? (
                    <div className="w-20 h-20 rounded-lg border border-border bg-black flex items-center justify-center overflow-hidden">
                      <video
                        src={s.preview}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                      />
                      <Film className="absolute w-5 h-5 text-white/80 drop-shadow-md" />
                    </div>
                  ) : (
                    <img
                      src={s.preview}
                      alt={`Attachment ${i + 1}`}
                      className="w-20 h-20 object-cover rounded-lg border border-border"
                    />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 bg-black/60 rounded-lg transition-opacity">
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setPreviewImageSrc(s.preview) }}
                      className="p-1.5 rounded-md bg-secondary/80 text-foreground hover:bg-secondary transition-colors"
                      title={s.mediaType === 'video' ? 'Preview video' : 'Preview image'}
                      aria-label={s.mediaType === 'video' ? 'Preview video' : 'Preview image'}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {s.mediaType !== 'video' && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); void copyScreenshotToClipboard(s.preview, i) }}
                        className="p-1.5 rounded-md bg-secondary/80 text-foreground hover:bg-secondary transition-colors"
                        title="Copy to clipboard"
                      >
                        {copiedIndex === i ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); removeScreenshot(i) }}
                      className="p-1.5 rounded-md bg-secondary/80 text-red-400 hover:bg-red-500/20 transition-colors"
                      title="Remove attachment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {screenshots.length > 0 && (
            <p className="text-2xs text-muted-foreground mt-1">
              Attachments will be uploaded and embedded directly in the GitHub issue.
            </p>
          )}
        </div>

        {/* Error with actionable guidance */}
        {error && (
          <div className="space-y-2">
            <p className="text-sm text-red-400">{error}</p>
            <div className="p-3 bg-secondary/30 border border-border rounded-lg">
              <p className="text-xs text-muted-foreground mb-2">
                {t('feedback.submitFailedGuidance')}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href="https://github.com/kubestellar/console/issues/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs rounded-lg border border-border text-foreground hover:bg-secondary/50 transition-colors flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3 h-3" />
                  {t('feedback.openGitHubIssue')}
                </a>
                {!canPerformActions && (
                  <button
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

// ── Submit Footer (buttons at bottom of modal when on Submit tab) ──

interface SubmitFooterProps {
  activeTab: TabType
  success: SuccessState | null
  description: string
  isSubmitting: boolean
  canPerformActions: boolean
  feedbackTokenMissing: boolean
  editingDraftId: string | null
  requestType: RequestType
  onClose: () => void
  onSaveDraft: () => void
  onShowLoginPrompt: () => void
  onSetActiveTab: (tab: TabType) => void
}

export function SubmitFooter({
  activeTab,
  success,
  description,
  isSubmitting,
  canPerformActions,
  feedbackTokenMissing,
  editingDraftId,
  requestType,
  onClose,
  onSaveDraft,
  onShowLoginPrompt,
  onSetActiveTab,
}: SubmitFooterProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-2">
      {activeTab === 'submit' && !success ? (
        <>
          <Button
            variant="secondary"
            size="lg"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="border border-border"
          >
            Cancel
          </Button>
          {description.trim().length >= MIN_DRAFT_LENGTH && (
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={isSubmitting}
              className="px-3 py-2 text-sm rounded-lg border border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              title={editingDraftId ? 'Update saved draft' : 'Save as draft for later'}
            >
              <Save className="w-3.5 h-3.5" />
              {editingDraftId ? 'Update Draft' : 'Save Draft'}
            </button>
          )}
          {canPerformActions ? (
            <button
              type="submit"
              form="feedback-form"
              disabled={isSubmitting || feedbackTokenMissing}
              title={feedbackTokenMissing ? 'FEEDBACK_GITHUB_TOKEN is not configured — set it in .env or Settings' : undefined}
              className="px-4 py-2 text-sm rounded-lg bg-purple-500 hover:bg-purple-600 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('feedback.submitting')}
                </>
              ) : (
                <>
                  Submit
                  <span className="text-white/60 text-xs font-normal">
                    +{requestType === 'bug' ? REWARD_ACTIONS.bug_report.coins : REWARD_ACTIONS.feature_suggestion.coins}
                  </span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onShowLoginPrompt}
              className="px-4 py-2 text-sm rounded-lg bg-purple-500 hover:bg-purple-600 text-white transition-colors flex items-center gap-2"
              title="Please login to submit feedback"
            >
              Login to Submit
            </button>
          )}
        </>
      ) : activeTab === 'drafts' ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSetActiveTab('submit')}
            className="px-3 py-2 text-sm rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 transition-colors flex items-center gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" />
            New Report
          </button>
          <Button
            variant="secondary"
            size="lg"
            type="button"
            onClick={onClose}
            className="border border-border"
          >
            Close
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          size="lg"
          type="button"
          onClick={onClose}
          className="border border-border"
        >
          Close
        </Button>
      )}
    </div>
  )
}
