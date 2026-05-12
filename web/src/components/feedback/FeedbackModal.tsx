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
import { X, Bug, Lightbulb, Send, CheckCircle2, ExternalLink, ImagePlus, Trash2, Copy, Check, AlertTriangle, Loader2, Film } from 'lucide-react'
import { Linkedin } from '@/lib/icons'
import { ConfirmDialog } from '../../lib/modals'
import { StatusBadge } from '../ui/StatusBadge'
import { useRewards, REWARD_ACTIONS } from '../../hooks/useRewards'
import { useToast } from '../ui/Toast'
import { emitFeedbackSubmitted, emitLinkedInShare, emitScreenshotAttached, emitScreenshotUploadFailed, emitScreenshotUploadSuccess, getRecentBrowserErrors, getRecentFailedApiCalls } from '../../lib/analytics'
import { copyBlobToClipboard } from '../../lib/clipboard'
import { useBranding } from '../../hooks/useBranding'
import { FETCH_DEFAULT_TIMEOUT_MS, COPY_FEEDBACK_TIMEOUT_MS } from '../../lib/constants'
import { FEEDBACK_UPLOAD_TIMEOUT_MS } from '../../lib/constants/network'
import { compressScreenshot } from '../../lib/imageCompression'
import { useFeatureRequests, DiagnosticInfo } from '../../hooks/useFeatureRequests'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { useAuth } from '../../lib/auth'
import { MAX_VIDEO_SIZE_BYTES, ACCEPTED_MEDIA_TYPES, ACCEPTED_VIDEO_MIME_TYPES } from './FeatureRequestTypes'

type FeedbackType = 'bug' | 'feature'

interface FeedbackModalProps {
  isOpen: boolean
  onClose: () => void
  initialType?: FeedbackType
}

const DRAFT_KEY = 'feedback-modal-draft'

interface DraftState {
  type: FeedbackType
  title: string
  description: string
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
  const [isDragOver, setIsDragOver] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleScreenshotFiles = (files: FileList | null) => {
    if (!files) return
    const allFiles = Array.from(files)
    const mediaFiles = allFiles.filter(f => f.type.startsWith('image/') || ACCEPTED_VIDEO_MIME_TYPES.has(f.type))
    if (mediaFiles.length === 0) return
    mediaFiles.forEach(file => {
      const isVideo = ACCEPTED_VIDEO_MIME_TYPES.has(file.type)
      if (isVideo && file.size > MAX_VIDEO_SIZE_BYTES) {
        showToast(`Video "${file.name}" exceeds 10 MB limit. Please use a shorter or lower-resolution recording.`, 'error')
        return
      }
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUri = e.target?.result as string
        setScreenshots(prev => [...prev, { file, preview: dataUri, mediaType: isVideo ? 'video' : 'image' }])
      }
      reader.onerror = (err) => {
        console.error(`[Attachment] FileReader failed for ${file.name}:`, err)
        showToast(`Failed to read file "${file.name}". Try a different file.`, 'error')
      }
      reader.readAsDataURL(file)
    })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }
  const handleDragLeave = () => setIsDragOver(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const mediaCount = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || ACCEPTED_VIDEO_MIME_TYPES.has(f.type)).length
    if (mediaCount > 0) emitScreenshotAttached('drop', mediaCount)
    handleScreenshotFiles(e.dataTransfer.files)
  }

  // Handle paste events to capture screenshots pasted into the textarea
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const allItems = Array.from(items)
    const imageItems = allItems.filter(item => item.type.startsWith('image/'))
    if (imageItems.length === 0) return
    // Prevent pasting image data as text in the textarea
    e.preventDefault()
    imageItems.forEach(item => {
      const file = item.getAsFile()
      if (file) {
        const reader = new FileReader()
        reader.onload = (ev) => {
          const dataUri = ev.target?.result as string
          setScreenshots(prev => [...prev, { file, preview: dataUri }])
        }
        reader.onerror = (err) => {
          console.error('[Screenshot] Paste FileReader failed:', err)
          showToast('Failed to read pasted screenshot. Try attaching the image instead.', 'error')
        }
        reader.readAsDataURL(file)
      }
    })
    emitScreenshotAttached('paste', imageItems.length)
    showToast(`Screenshot${imageItems.length > 1 ? 's' : ''} added`, 'success')
  }

  const removeScreenshot = (index: number) => {
    setScreenshots(prev => prev.filter((_, i) => i !== index))
  }

  const copyScreenshotToClipboard = async (preview: string, index: number) => {
    try {
      const res = await fetch(preview, { signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      const blob = await res.blob()
      // #6229: route through the shared lib/clipboard.copyBlobToClipboard
      // helper which guards `navigator.clipboard.write` AND
      // `typeof ClipboardItem === 'function'` so unsupported browsers
      // (older Safari, Firefox <127, all browsers in non-secure contexts)
      // get a clean false return instead of an unhandled exception.
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

  // Restore draft from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) {
        const draft: DraftState = JSON.parse(saved)
        setType(draft.type)
        setTitle(draft.title)
        setDescription(draft.description)
      }
    } catch {
      // ignore malformed draft
    }
  }, [])

  // Autosave draft to localStorage whenever form content changes
  useEffect(() => {
    if (title || description) {
      const draft: DraftState = { type, title, description }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } else {
      localStorage.removeItem(DRAFT_KEY)
    }
  }, [type, title, description])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate required fields and show inline errors instead of silently
    // returning. Fixes #10476 — empty submit gave no feedback.
    const errors: { title?: string; description?: string } = {}
    if (!title.trim()) errors.title = 'Title is required'
    if (!description.trim()) errors.description = 'Description is required'
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }
    setValidationErrors({})

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      // Compress screenshots to fit within GitHub's 65K issue body limit.
      // Images are embedded as base64 and processed into rendered images
      // by a GitHub Actions workflow after the issue is created.
      // Videos are passed through without compression.
      const screenshotDataURIs: string[] = []
      for (const s of screenshots) {
        if (s.mediaType === 'video') {
          screenshotDataURIs.push(s.preview)
        } else {
          const compressed = await compressScreenshot(s.preview)
          if (compressed) screenshotDataURIs.push(compressed)
        }
      }

      // Gather agent and browser diagnostics to help debug reported issues
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

      // Submit via backend API — creates GitHub issue directly using the
      // server-side token. No GitHub login required from the user.
      // Screenshots are uploaded server-side and embedded as images.
      const hasScreenshots = screenshotDataURIs.length > 0
      const result = await createRequest({
        title: title.trim(),
        description: description.trim(),
        request_type: type,
        target_repo: 'console',
        diagnostics,
        ...(consoleErrors.length > 0 && { console_errors: consoleErrors }),
        ...(failedApiCalls.length > 0 && { failed_api_calls: failedApiCalls }),
        ...(hasScreenshots && { screenshots: screenshotDataURIs }) }, hasScreenshots ? { timeout: FEEDBACK_UPLOAD_TIMEOUT_MS } : undefined)
      if (hasScreenshots) emitScreenshotUploadSuccess(screenshotDataURIs.length)

      emitFeedbackSubmitted(type)

      // Award coins based on type
      const action = type === 'bug' ? 'bug_report' : 'feature_suggestion'
      awardCoins(action as 'bug_report' | 'feature_suggestion', { title, type })

      // Clear draft on successful submit
      localStorage.removeItem(DRAFT_KEY)
      setSuccess({
        issueUrl: result.github_issue_url,
        screenshotsUploaded: result.screenshots_uploaded,
        screenshotsFailed: result.screenshots_failed })
    } catch (err: unknown) {
      console.error('[Screenshot] Failed to submit feedback:', err)
      const message = err instanceof Error ? err.message : 'Failed to submit feedback'
      if (screenshots.length > 0) emitScreenshotUploadFailed(message, screenshots.length)
      setSubmitError(message)
      showToast('Failed to submit feedback', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const forceClose = () => {
    setShowDiscardConfirm(false)
    localStorage.removeItem(DRAFT_KEY)
    setSuccess(null)
    setSubmitError(null)
    setValidationErrors({})
    setTitle('')
    setDescription('')
    setScreenshots([])
    onClose()
  }

  // Use refs for dirty check so handleClose doesn't change on every keystroke
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

  // Submit form programmatically via ref (used by Cmd/Ctrl+Enter shortcut)
  const formRef = useRef<HTMLFormElement>(null)

  // Keyboard navigation - ESC to close, Space to close when not typing,
  // Cmd/Ctrl+Enter to submit (#8651)
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC always closes
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
        return
      }

      // Cmd+Enter (Mac) or Ctrl+Enter (Win/Linux) submits the form
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        formRef.current?.requestSubmit()
        return
      }

      // Space closes only if focus is not on an input or interactive control.
      // Use closest() so child elements (e.g. <span>/<svg> inside a <button>)
      // are caught too. Fixes #10476 — Space on a button closed the modal.
      if (e.key === ' ') {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target instanceof HTMLElement && (
            e.target.isContentEditable ||
            (e.target as HTMLElement).closest('button, a, select, [role="button"], [role="link"], [role="option"], [role="menuitem"]')
          ))
        ) {
          return
        }
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

  // Close on backdrop click — only when the click target is the backdrop
  // itself, not any child element (so clicks inside the modal content do
  // not dismiss it). Routes through handleClose() so the unsaved-changes
  // confirmation flow runs if the user has typed anything. (Fixes #9159)
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-xs"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Submit Feedback"
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
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
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
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {success ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Thank you!</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Your {type === 'bug' ? 'bug report' : 'feature suggestion'} has been created as a GitHub issue.
              </p>
              <p className="text-sm text-yellow-400 mb-4">
                +{coins} coins earned!
              </p>

              {/* Link to the created GitHub issue */}
              {success.issueUrl && (
                <a
                  href={success.issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-sm font-medium transition-colors mb-4"
                >
                  <ExternalLink className="w-4 h-4" />
                  View issue on GitHub
                </a>
              )}

              {/* Screenshot status — embedded as base64 in issue body, processed by GHA */}
              {screenshots.length > 0 && success && (success.screenshotsUploaded ?? 0) > 0 && (
                <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <p className="text-xs text-green-400 font-medium">
                    {(success.screenshotsUploaded ?? 0) === 1
                      ? 'Screenshot attached to the issue. It will render as an image shortly.'
                      : `${success.screenshotsUploaded} screenshots attached to the issue. They will render as images shortly.`}
                  </p>
                </div>
              )}
              {screenshots.length > 0 && success && (success.screenshotsFailed ?? 0) > 0 && (
                <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <p className="text-xs text-yellow-400 font-medium">
                    {success.screenshotsFailed === 1
                      ? 'Screenshot could not be attached — invalid image format.'
                      : `${success.screenshotsFailed} screenshots could not be attached — invalid image format.`}
                  </p>
                </div>
              )}

              {/* LinkedIn share suggestion */}
              <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-3">
                  Love {branding.appShortName}? Share it with your network!
                </p>
                <LinkedInShareButton onShare={() => awardCoins('linkedin_share')} />
              </div>
            </div>
          ) : (
            <>
              {/* Draft restore notice */}
              {(title || description) && (
                <div className="flex items-center gap-2 p-2 mb-3 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-muted-foreground">
                  <span>Draft restored.</span>
                </div>
              )}

              {/* Type selector */}
              <div className="flex gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setType('bug')}
                  className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors ${
                    type === 'bug'
                      ? 'bg-red-500/10 border-red-500/30 text-red-400'
                      : 'bg-secondary/30 border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Bug className="w-4 h-4" />
                  <span className="text-sm font-medium">{t('feedback.bugReport', 'Bug Report')}</span>
                  <StatusBadge color="yellow">+{REWARD_ACTIONS.bug_report.coins}</StatusBadge>
                </button>
                <button
                  type="button"
                  onClick={() => setType('feature')}
                  className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors ${
                    type === 'feature'
                      ? 'bg-green-500/10 border-green-500/30 text-green-400'
                      : 'bg-secondary/30 border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Lightbulb className="w-4 h-4" />
                  <span className="text-sm font-medium">{t('feedback.featureRequest', 'Feature Request')}</span>
                  <StatusBadge color="yellow">+{REWARD_ACTIONS.feature_suggestion.coins}</StatusBadge>
                </button>
              </div>

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
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Screenshots <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                    </label>
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                        isDragOver
                          ? 'border-purple-400 bg-purple-500/10'
                          : 'border-border hover:border-muted-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <ImagePlus className="w-5 h-5 text-muted-foreground" />
                        <Film className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <span className="text-xs text-muted-foreground text-center">Drop images or videos here, or click to browse</span>
                      <span className="text-2xs text-muted-foreground/70">Videos: mp4, webm, mov (max 10 MB)</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPTED_MEDIA_TYPES}
                        multiple
                        onChange={e => {
                          const files = e.target.files
                          if (files && files.length > 0) emitScreenshotAttached('file_picker', files.length)
                          handleScreenshotFiles(files)
                        }}
                        className="hidden"
                      />
                    </div>
                    {screenshots.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {screenshots.map((s, i) => (
                          <div key={i} className="relative group w-20 h-20 shrink-0">
                            {s.mediaType === 'video' ? (
                              <div className="w-20 h-20 rounded-lg border border-border bg-black flex items-center justify-center overflow-hidden">
                                <video src={s.preview} className="w-full h-full object-cover" muted playsInline />
                                <Film className="absolute w-5 h-5 text-white/80 drop-shadow-md" />
                              </div>
                            ) : (
                              <img
                                src={s.preview}
                                alt={`Attachment ${i + 1}`}
                                className="w-20 h-20 object-cover rounded-lg border border-border"
                                loading="lazy"
                                width={80}
                                height={80}
                              />
                            )}
                            <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 bg-black/60 rounded-lg transition-opacity">
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
                  </div>

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
                      <kbd className="ml-1 px-2 py-1 rounded-md bg-white/20 text-xs font-semibold leading-none shadow-xs">
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
            <kbd className="px-1.5 py-0.5 rounded border border-border bg-secondary text-[10px] font-mono">Esc</kbd>
            close
          </span>
          {!success && (
            <span className="inline-flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm">
              <kbd className="px-1.5 py-0.5 rounded border border-purple-500/30 bg-background/80 text-[10px] font-mono">{submitShortcutLabel}</kbd>
              submit
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// Floating feedback button - positioned above the AI missions toggle
export function FeedbackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-20 right-4 flex items-center gap-2 px-4 py-2.5 rounded-full bg-purple-500 hover:bg-purple-600 text-white shadow-lg transition-all hover:scale-105 z-sticky"
      title="Submit feedback"
    >
      <Lightbulb className="w-4 h-4" />
      <span className="text-sm font-medium">Feedback</span>
    </button>
  )
}

// LinkedIn share button with coin reward
export function LinkedInShareButton({ onShare, compact = false }: { onShare?: () => void; compact?: boolean }) {
  const { t } = useTranslation()
  const { websiteUrl } = useBranding()
  const handleShare = () => {
    const shareTarget = websiteUrl || 'https://kubestellar.io'
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareTarget)}`
    window.open(linkedInUrl, '_blank', 'noopener,noreferrer,width=600,height=600')
    emitLinkedInShare('feedback_modal')
    onShare?.()
  }

  if (compact) {
    return (
      <button
        onClick={handleShare}
        className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-linkedin/20 hover:bg-linkedin/30 text-linkedin transition-colors"
        title="Share on LinkedIn"
      >
        <Linkedin className="w-4 h-4" />
        <span>{t('feedback.share')}</span>
        <StatusBadge color="yellow">+{REWARD_ACTIONS.linkedin_share.coins}</StatusBadge>
      </button>
    )
  }

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-linkedin hover:bg-linkedin-dark text-white font-medium transition-colors"
    >
      <Linkedin className="w-4 h-4" />
      <span>{t('feedback.shareOnLinkedIn')}</span>
      <span className="text-xs px-1.5 py-0.5 rounded bg-white/20 text-white">
        +{REWARD_ACTIONS.linkedin_share.coins}
      </span>
    </button>
  )
}
