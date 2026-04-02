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
import { X, Bug, Lightbulb, Send, CheckCircle2, ExternalLink, Linkedin, ImagePlus, Trash2, Copy, Check, AlertTriangle, Loader2 } from 'lucide-react'
import { ConfirmDialog } from '../../lib/modals'
import { StatusBadge } from '../ui/StatusBadge'
import { useRewards, REWARD_ACTIONS } from '../../hooks/useRewards'
import { useToast } from '../ui/Toast'
import { emitFeedbackSubmitted, emitLinkedInShare, emitScreenshotAttached, emitScreenshotUploadFailed, emitScreenshotUploadSuccess } from '../../lib/analytics'
import { useBranding } from '../../hooks/useBranding'
import { FETCH_DEFAULT_TIMEOUT_MS, COPY_FEEDBACK_TIMEOUT_MS } from '../../lib/constants'
import { FEEDBACK_UPLOAD_TIMEOUT_MS } from '../../lib/constants/network'
import { useFeatureRequests } from '../../hooks/useFeatureRequests'
import { useAuth } from '../../lib/auth'

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
  const [type, setType] = useState<FeedbackType>(initialType)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState<{ issueUrl?: string; screenshotsUploaded?: number; screenshotsFailed?: number } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const { awardCoins } = useRewards()
  const [screenshots, setScreenshots] = useState<{ file: File; preview: string }[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleScreenshotFiles = (files: FileList | null) => {
    if (!files) {
      console.debug('[Screenshot] handleScreenshotFiles called with null/empty files')
      return
    }
    const allFiles = Array.from(files)
    console.debug(`[Screenshot] Received ${allFiles.length} file(s):`, allFiles.map(f => ({ name: f.name, type: f.type, size: f.size })))
    const imageFiles = allFiles.filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      console.debug('[Screenshot] No image files found after filtering. File types:', allFiles.map(f => f.type))
      return
    }
    console.debug(`[Screenshot] Processing ${imageFiles.length} image file(s)`)
    imageFiles.forEach(file => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUri = e.target?.result as string
        console.debug(`[Screenshot] FileReader loaded: ${file.name} (${dataUri?.length ?? 0} chars, prefix: ${dataUri?.substring(0, 30)}...)`)
        setScreenshots(prev => [...prev, { file, preview: dataUri }])
      }
      reader.onerror = (err) => {
        console.error(`[Screenshot] FileReader failed for ${file.name}:`, err)
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
    console.debug(`[Screenshot] Drop event: ${e.dataTransfer.files.length} file(s)`)
    const imageCount = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).length
    if (imageCount > 0) emitScreenshotAttached('drop', imageCount)
    handleScreenshotFiles(e.dataTransfer.files)
  }

  // Handle paste events to capture screenshots pasted into the textarea
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) {
      console.debug('[Screenshot] Paste event: no clipboardData items')
      return
    }
    const allItems = Array.from(items)
    console.debug(`[Screenshot] Paste event: ${allItems.length} item(s):`, allItems.map(i => ({ kind: i.kind, type: i.type })))
    const imageItems = allItems.filter(item => item.type.startsWith('image/'))
    if (imageItems.length === 0) {
      console.debug('[Screenshot] No image items in paste data')
      return
    }
    // Prevent pasting image data as text in the textarea
    e.preventDefault()
    imageItems.forEach(item => {
      const file = item.getAsFile()
      if (file) {
        console.debug(`[Screenshot] Paste image: ${file.name || '(unnamed)'}, type=${file.type}, size=${file.size}`)
        const reader = new FileReader()
        reader.onload = (ev) => {
          const dataUri = ev.target?.result as string
          console.debug(`[Screenshot] Paste FileReader loaded: ${dataUri?.length ?? 0} chars`)
          setScreenshots(prev => [...prev, { file, preview: dataUri }])
        }
        reader.onerror = (err) => {
          console.error('[Screenshot] Paste FileReader failed:', err)
        }
        reader.readAsDataURL(file)
      } else {
        console.debug('[Screenshot] item.getAsFile() returned null for type:', item.type)
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
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
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
    if (!title.trim() || !description.trim()) return

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      // Collect base64 data URIs for any attached screenshots so the
      // backend can upload them to GitHub and embed them in the issue.
      const screenshotDataURIs = screenshots.map(s => s.preview)

      // Submit via backend API — creates GitHub issue directly using the
      // server-side token. No GitHub login required from the user.
      // Screenshots are uploaded server-side and embedded as images.
      const hasScreenshots = screenshotDataURIs.length > 0
      console.debug(`[Screenshot] Submitting feedback: type=${type}, screenshots=${screenshotDataURIs.length}, sizes=${screenshotDataURIs.map(s => s.length).join(',')}`)
      if (hasScreenshots) {
        screenshotDataURIs.forEach((uri, i) => {
          const prefix = uri.substring(0, 50)
          console.debug(`[Screenshot] #${i}: ${uri.length} chars, starts with: ${prefix}...`)
        })
        console.debug(`[Screenshot] Using upload timeout: ${FEEDBACK_UPLOAD_TIMEOUT_MS}ms`)
      }
      const result = await createRequest({
        title: title.trim(),
        description: description.trim(),
        request_type: type,
        target_repo: 'console',
        ...(hasScreenshots && { screenshots: screenshotDataURIs }),
      }, hasScreenshots ? { timeout: FEEDBACK_UPLOAD_TIMEOUT_MS } : undefined)
      console.debug('[Screenshot] Submit succeeded:', result.github_issue_url)
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
        screenshotsFailed: result.screenshots_failed,
      })
    } catch (err) {
      console.error('[Screenshot] Failed to submit feedback:', err)
      if (err instanceof Error) {
        console.debug(`[Screenshot] Error details: name=${err.name}, message=${err.message}`)
        if ('response' in err) console.debug('[Screenshot] Response:', (err as Record<string, unknown>).response)
      }
      const message = err instanceof Error ? err.message : 'Failed to submit feedback'
      if (screenshots.length > 0) emitScreenshotUploadFailed(message, screenshots.length)
      setSubmitError(message)
      showToast('Failed to submit feedback', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const forceClose = useCallback(() => {
    setShowDiscardConfirm(false)
    localStorage.removeItem(DRAFT_KEY)
    setSuccess(null)
    setSubmitError(null)
    setTitle('')
    setDescription('')
    setScreenshots([])
    onClose()
  }, [onClose])

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

  // Keyboard navigation - ESC to close, Space to close when not typing
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC always closes
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
        return
      }

      // Space closes only if not typing in an input
      if (e.key === ' ') {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target instanceof HTMLElement && e.target.isContentEditable)
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

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-2xl">
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
              <h2 className="font-semibold text-foreground">Submit Feedback</h2>
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

              {/* Screenshot upload status — show based on actual backend result */}
              {screenshots.length > 0 && success && (success.screenshotsUploaded ?? 0) > 0 && (
                <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <p className="text-xs text-green-400 font-medium">
                    {(success.screenshotsUploaded ?? 0) === 1
                      ? 'Screenshot uploaded and attached to the issue.'
                      : `${success.screenshotsUploaded} screenshots uploaded and attached to the issue.`}
                  </p>
                </div>
              )}
              {screenshots.length > 0 && success && (success.screenshotsFailed ?? 0) > 0 && (success.screenshotsUploaded ?? 0) === 0 && (
                <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <p className="text-xs text-yellow-400 font-medium">
                    Screenshot could not be uploaded — the issue was created without it.
                    The token needs <em>Contents: Read and write</em> permission (fine-grained PAT) or <em>repo</em> scope (classic PAT).
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    <a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline underline-offset-2">Update token on GitHub</a>
                    {' · '}
                    <button type="button" onClick={() => { window.location.href = '/settings' }} className="text-purple-400 hover:text-purple-300 underline underline-offset-2">Console Settings</button>
                  </p>
                </div>
              )}
              {screenshots.length > 0 && success && (success.screenshotsFailed ?? 0) > 0 && (success.screenshotsUploaded ?? 0) > 0 && (
                <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <p className="text-xs text-yellow-400 font-medium">
                    {success.screenshotsUploaded} of {screenshots.length} screenshots uploaded. {success.screenshotsFailed} failed — token may need <em>Contents: Read and write</em> permission.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    <a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline underline-offset-2">Update token on GitHub</a>
                    {' · '}
                    <button type="button" onClick={() => { window.location.href = '/settings' }} className="text-purple-400 hover:text-purple-300 underline underline-offset-2">Console Settings</button>
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
                  <span className="text-sm font-medium">Bug Report</span>
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
                  <span className="text-sm font-medium">Feature Request</span>
                  <StatusBadge color="yellow">+{REWARD_ACTIONS.feature_suggestion.coins}</StatusBadge>
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={type === 'bug' ? 'Brief description of the bug' : 'Brief description of the feature'}
                      className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      onPaste={handlePaste}
                      placeholder={type === 'bug'
                        ? 'Steps to reproduce, expected behavior, actual behavior... (paste screenshots here!)'
                        : 'Describe the feature, use case, and how it would help... (paste screenshots here!)'
                      }
                      rows={4}
                      className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
                      required
                    />
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
                      <ImagePlus className="w-5 h-5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground text-center">Drop screenshots here or click to browse</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
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
                          <div key={i} className="relative group w-20 h-20 flex-shrink-0">
                            <img
                              src={s.preview}
                              alt={`Screenshot ${i + 1}`}
                              className="w-20 h-20 object-cover rounded-lg border border-border"
                            />
                            <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 bg-black/60 rounded-lg transition-opacity">
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); void copyScreenshotToClipboard(s.preview, i) }}
                                className="p-1.5 rounded-md bg-secondary/80 text-foreground hover:bg-secondary transition-colors"
                                title="Copy to clipboard"
                              >
                                {copiedIndex === i ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); removeScreenshot(i) }}
                                className="p-1.5 rounded-md bg-secondary/80 text-red-400 hover:bg-red-500/20 transition-colors"
                                title="Remove screenshot"
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
                      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      <span className="text-red-400">{submitError}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
                    <ExternalLink className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <span className="text-muted-foreground">
                      {screenshots.length > 0
                        ? 'A GitHub issue will be created automatically with your screenshots attached.'
                        : 'A GitHub issue will be created automatically. No GitHub login required.'}
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !title.trim() || !description.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-500 hover:bg-purple-600 disabled:bg-purple-500/50 disabled:cursor-not-allowed text-white font-medium transition-colors"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {isSubmitting ? 'Creating issue...' : `Submit & Earn ${coins} Coins`}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
        {/* Keyboard hints */}
        <div className="flex items-center justify-end gap-3 px-4 py-2 border-t border-border/50 text-2xs text-muted-foreground/50">
          <span><kbd className="px-1 py-0.5 rounded bg-secondary/50 text-[9px]">Esc</kbd> close</span>
          <span><kbd className="px-1 py-0.5 rounded bg-secondary/50 text-[9px]">Space</kbd> close</span>
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
      className="fixed bottom-20 right-4 flex items-center gap-2 px-4 py-2.5 rounded-full bg-purple-500 hover:bg-purple-600 text-white shadow-lg transition-all hover:scale-105 z-40"
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
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(websiteUrl)}`
    window.open(linkedInUrl, '_blank', 'noopener,noreferrer,width=600,height=600')
    emitLinkedInShare('feedback_modal')
    onShare?.()
  }

  if (compact) {
    return (
      <button
        onClick={handleShare}
        className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-[#0A66C2]/20 hover:bg-[#0A66C2]/30 text-[#0A66C2] transition-colors"
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
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0A66C2] hover:bg-[#004182] text-white font-medium transition-colors"
    >
      <Linkedin className="w-4 h-4" />
      <span>{t('feedback.shareOnLinkedIn')}</span>
      <span className="text-xs px-1.5 py-0.5 rounded bg-white/20 text-white">
        +{REWARD_ACTIONS.linkedin_share.coins}
      </span>
    </button>
  )
}
