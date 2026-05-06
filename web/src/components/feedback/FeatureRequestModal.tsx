import { useState, useEffect, useRef, useCallback } from 'react'
import { X } from 'lucide-react'
import { StatusBadge } from '../ui/StatusBadge'
import { BaseModal } from '../../lib/modals'
import {
  useFeatureRequests,
  useNotifications,
  type RequestType,
  type TargetRepo,
} from '../../hooks/useFeatureRequests'
import { useAuth } from '../../lib/auth'
import { useRewards } from '../../hooks/useRewards'
import { BACKEND_DEFAULT_URL, STORAGE_KEY_TOKEN, DEMO_TOKEN_VALUE, FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { isDemoModeForced } from '../../lib/demoMode'
import { useToast } from '../ui/Toast'
import { useTranslation } from 'react-i18next'
import { SetupInstructionsDialog } from '../setup/SetupInstructionsDialog'
import { REWARD_ACTIONS } from '../../types/rewards'
import { useFeedbackDrafts } from '../../hooks/useFeedbackDrafts'
import type { FeedbackDraft } from '../../hooks/useFeedbackDrafts'

// Split sub-components
import type { FeatureRequestModalProps, TabType, ScreenshotItem, SuccessState } from './FeatureRequestTypes'
import { MIN_DRAFT_LENGTH, SUCCESS_DISPLAY_MS } from './FeatureRequestTypes'
import { DiscardConfirmDialog, LoginPromptDialog, FullscreenPreview, ScreenshotPreviewOverlay } from './FeedbackDialogs'
import { DraftsTab } from './DraftsTab'
import { UpdatesTab } from './UpdatesTab'
import { SubmitForm, SuccessView, SubmitFooter } from './SubmitTab'

export function FeatureRequestModal({ isOpen, onClose, initialTab, initialRequestType, initialContext }: FeatureRequestModalProps) {
  const { t } = useTranslation()
  const { user, isAuthenticated, token } = useAuth()
  const { showToast } = useToast()
  const currentGitHubLogin = user?.github_login || ''
  const { createRequest, isSubmitting, requests, isLoading: requestsLoading, isRefreshing: requestsRefreshing, refresh: refreshRequests, requestUpdate, closeRequest, isDemoMode: isInDemoMode } = useFeatureRequests(currentGitHubLogin)
  const { isRefreshing: notificationsRefreshing, refresh: refreshNotifications, getUnreadCountForRequest, markRequestNotificationsAsRead } = useNotifications()
  const { githubRewards, githubPoints, refreshGitHubRewards } = useRewards()
  const { drafts, draftCount, recentlyDeletedDrafts, recentlyDeletedCount, saveDraft, deleteDraft, permanentlyDeleteDraft, restoreDeletedDraft, clearAllDrafts, emptyRecentlyDeleted } = useFeedbackDrafts()
  const [isGitHubRefreshing, setIsGitHubRefreshing] = useState(false)
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [confirmDeleteDraft, setConfirmDeleteDraft] = useState<string | null>(null)
  const [showClearAllDrafts, setShowClearAllDrafts] = useState(false)
  const isRefreshing = requestsRefreshing || notificationsRefreshing

  // User can't perform actions if not authenticated or if using demo token
  const canPerformActions = isAuthenticated && token !== DEMO_TOKEN_VALUE
  const [activeTab, setActiveTab] = useState<TabType>(initialTab || 'submit')
  const [requestType, setRequestType] = useState<RequestType>(initialRequestType || 'bug')
  const [targetRepo, setTargetRepo] = useState<TargetRepo>('console')
  // Sync requestType when modal opens with a new initialRequestType (e.g. from /feature route)
  useEffect(() => {
    if (isOpen && initialRequestType) {
      setRequestType(initialRequestType)
    }
  }, [isOpen, initialRequestType])
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<SuccessState | null>(null)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [showLoginPrompt, setShowLoginPrompt] = useState(false)
  const [showSetupDialog, setShowSetupDialog] = useState(false)
  const [feedbackTokenMissing, setFeedbackTokenMissing] = useState(false)
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([])
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false)
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null)

  // Pre-fill description when opened from a card's bug button (only once on open)
  const prevOpenRef = useRef(false)
  useEffect(() => {
    if (isOpen && !prevOpenRef.current && initialContext) {
      const bugExample = `Card: ${initialContext.cardTitle} (${initialContext.cardType})\n\nDescribe the bug:\n`
      setDescription(bugExample)
      setRequestType('bug')
    }
    prevOpenRef.current = isOpen
  }, [isOpen, initialContext])

  // Check whether FEEDBACK_GITHUB_TOKEN is configured on the backend
  const tokenCheckedRef = useRef(false)
  useEffect(() => {
    if (!isOpen || tokenCheckedRef.current || isDemoModeForced) return
    tokenCheckedRef.current = true

    fetch(`${BACKEND_DEFAULT_URL}/api/github/token/status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && !data.hasToken) {
          setFeedbackTokenMissing(true)
        }
      })
      .catch(() => {
        // Silently ignore — backend may not be reachable (e.g. demo mode)
      })
  }, [isOpen, token])

  const handleRefreshGitHub = async () => {
    setIsGitHubRefreshing(true)
    try {
      await refreshGitHubRewards()
    } finally {
      setIsGitHubRefreshing(false)
    }
  }

  const handleLoginRedirect = () => {
    if (isDemoModeForced) {
      setShowLoginPrompt(false)
      setShowSetupDialog(true)
      return
    }
    localStorage.removeItem(STORAGE_KEY_TOKEN)
    window.location.href = `${BACKEND_DEFAULT_URL}/auth/github`
  }

  const handleSaveDraft = () => {
    if (description.trim().length < MIN_DRAFT_LENGTH) {
      showToast('Draft is too short to save', 'error')
      return
    }
    const screenshotDataURIs = screenshots.map(s => s.preview)
    const id = saveDraft(
      { requestType, targetRepo, description, screenshots: screenshotDataURIs },
      editingDraftId || undefined,
    )
    if (id) {
      setEditingDraftId(id)
      showToast(editingDraftId ? 'Draft updated' : 'Draft saved', 'success')
    }
  }

  const handleRestoreDraft = (draft: FeedbackDraft) => {
    setRequestType(draft.requestType)
    setTargetRepo(draft.targetRepo)
    setDescription(draft.description)
    setEditingDraftId(draft.id)
    const restoredScreenshots = (draft.screenshots || []).map((preview, idx) => ({
      file: new File([], `draft-screenshot-${idx + 1}.png`, { type: 'image/png' }),
      preview,
    }))
    setScreenshots(restoredScreenshots)
    setActiveTab('submit')
    showToast('Draft loaded into editor', 'success')
  }

  const handleDeleteDraft = (id: string) => {
    deleteDraft(id)
    if (editingDraftId === id) {
      setEditingDraftId(null)
    }
    setConfirmDeleteDraft(null)
    showToast('Draft deleted', 'success')
  }

  /** Ref to track the success display timeout so it can be cleared on unmount */
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear the success display timeout when the component unmounts
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
      }
    }
  }, [])

  const handleSubmitSuccess = (result: SuccessState) => {
    setSuccess(result)
    if (editingDraftId) {
      deleteDraft(editingDraftId)
      setEditingDraftId(null)
    }
    successTimeoutRef.current = setTimeout(() => {
      successTimeoutRef.current = null
      setDescription('')
      setRequestType('bug')
      setTargetRepo('console')
      setSuccess(null)
      setScreenshots([])
      setActiveTab('updates')
      refreshRequests()
      refreshNotifications()
    }, SUCCESS_DISPLAY_MS)
  }

  // Stable refs so handleClose/forceClose don't depend on every keystroke.
  // The previous unmemoized closures rebuilt on every render, churning
  // BaseModal's onClose prop and re-registering the keydown listener.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const descriptionRef = useRef(description)
  descriptionRef.current = description
  const isSubmittingRef = useRef(isSubmitting)
  isSubmittingRef.current = isSubmitting
  const showDiscardRef = useRef(showDiscardConfirm)
  showDiscardRef.current = showDiscardConfirm
  // Issue 9358: after a successful submission the form is showing the
  // "Request Submitted" confirmation view. The description/screenshots
  // state may still be populated (we clear it on the SUCCESS_DISPLAY_MS
  // timer), but the content has already been filed as a GitHub issue —
  // it is NOT unsaved. Close must skip the unsaved-changes prompt.
  const successRef = useRef(success)
  successRef.current = success

  const forceClose = useCallback(() => {
    // Hide the discard confirmation first so a stale ref can't cause
    // handleClose to re-open it on the next paint.
    setShowDiscardConfirm(false)
    setDescription('')
    setRequestType(initialRequestType || 'bug')
    setTargetRepo('console')
    setError(null)
    setSuccess(null)
    setScreenshots([])
    setEditingDraftId(null)
    setActiveTab(initialTab || 'submit')
    // Call parent's close last so all internal resets are batched into the
    // same render as the unmount. (Fixes #9152 — the unmemoized callbacks
    // and missing showDiscard guard let the parent modal stay open after
    // clicking Discard.)
    onCloseRef.current()
  }, [initialRequestType, initialTab])

  const handleSaveAndClose = useCallback(() => {
    handleSaveDraft()
    forceClose()
  }, [handleSaveDraft, forceClose])

  const handleClose = useCallback(() => {
    if (isSubmittingRef.current) return
    // If the discard dialog is already showing, an Esc/Space coming from
    // BaseModal's keydown handler must NOT just re-set the same flag —
    // that traps the user. Treat the second close attempt as Discard.
    if (showDiscardRef.current) {
      forceClose()
      return
    }
    // Issue 9358: once the submission succeeded, the form content has
    // been filed as a GitHub issue — it is not "unsaved". Close cleanly
    // without prompting, even if the description/screenshots state has
    // not yet been reset by the SUCCESS_DISPLAY_MS timer.
    if (successRef.current) {
      forceClose()
      return
    }
    if (descriptionRef.current.trim() !== '') {
      setShowDiscardConfirm(true)
      return
    }
    forceClose()
  }, [forceClose])

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      closeOnBackdrop={true}
      closeOnEscape={true}
      className="h-auto max-h-[min(90vh,calc(100vh-2rem))]! lg:h-[80vh]!"
    >
      {/* Discard/Save Draft confirmation */}
      {showDiscardConfirm && (
        <DiscardConfirmDialog
          onSaveAndClose={handleSaveAndClose}
          onDiscard={forceClose}
          onKeepEditing={() => setShowDiscardConfirm(false)}
        />
      )}

      {/* Login Prompt Dialog */}
      {showLoginPrompt && (
        <LoginPromptDialog
          onClose={() => setShowLoginPrompt(false)}
          onLoginRedirect={handleLoginRedirect}
          onSetupOAuth={() => {
            setShowLoginPrompt(false)
            setShowSetupDialog(true)
          }}
        />
      )}

      {/* Setup Instructions Dialog */}
      <SetupInstructionsDialog
        isOpen={showSetupDialog}
        onClose={() => setShowSetupDialog(false)}
      />

      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Contribute
            </h2>
            <p className="text-xs text-muted-foreground">
              Earn {REWARD_ACTIONS.bug_report.coins} coins for bugs, {REWARD_ACTIONS.feature_suggestion.coins} for features
            </p>
          </div>
          {!canPerformActions && (
            <StatusBadge color="yellow" size="xs" className="uppercase tracking-wider">{t('feedback.demo')}</StatusBadge>
          )}
        </div>
        <button
          onClick={handleClose}
          disabled={isSubmitting}
          className="p-1 rounded hover:bg-secondary/50 text-muted-foreground disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
            <button
              onClick={() => setActiveTab('submit')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'submit'
                  ? 'text-foreground border-b-2 border-purple-500'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('feedback.submit')}
            </button>
            <button
              onClick={() => setActiveTab('drafts')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'drafts'
                  ? 'text-foreground border-b-2 border-purple-500'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Drafts
              {draftCount > 0 && (
                <span className="min-w-5 h-5 px-1 text-xs rounded-full bg-orange-500 text-white flex items-center justify-center">
                  {draftCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('updates')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'updates'
                  ? 'text-foreground border-b-2 border-purple-500'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('feedback.updates')}
              {(requests || []).length > 0 && (
                <span className="min-w-5 h-5 px-1 text-xs rounded-full bg-purple-500 text-white flex items-center justify-center">
                  {(requests || []).length}
                </span>
              )}
            </button>
          </div>

      {/* Login banner for demo/unauthenticated users */}
      {!canPerformActions && (
        <button
          onClick={() => setShowLoginPrompt(true)}
          className="w-full px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20 flex items-center justify-between hover:bg-yellow-500/20 transition-colors cursor-pointer shrink-0"
        >
              <span className="text-xs text-yellow-400">
                {isDemoModeForced
                  ? t('feedback.loginBannerDemo')
                  : t('feedback.loginBannerLocal')}
              </span>
          <StatusBadge color="yellow">{isDemoModeForced ? t('feedback.loginWithGitHub') : t('feedback.setupOAuth')}</StatusBadge>
        </button>
      )}

      {/* Content - scrollable area with fixed flex layout */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {activeTab === 'drafts' ? (
          <DraftsTab
            drafts={drafts}
            draftCount={draftCount}
            recentlyDeletedDrafts={recentlyDeletedDrafts}
            recentlyDeletedCount={recentlyDeletedCount}
            editingDraftId={editingDraftId}
            confirmDeleteDraft={confirmDeleteDraft}
            showClearAllDrafts={showClearAllDrafts}
            onSetActiveTab={setActiveTab}
            onRestoreDraft={handleRestoreDraft}
            onDeleteDraft={handleDeleteDraft}
            onPermanentlyDeleteDraft={permanentlyDeleteDraft}
            onRestoreDeletedDraft={restoreDeletedDraft}
            onEmptyRecentlyDeleted={emptyRecentlyDeleted}
            onSetConfirmDeleteDraft={setConfirmDeleteDraft}
            onSetShowClearAllDrafts={setShowClearAllDrafts}
            onClearAllDrafts={clearAllDrafts}
            showToast={showToast}
          />
        ) : activeTab === 'updates' ? (
          <UpdatesTab
            requests={requests}
            requestsLoading={requestsLoading}
            isRefreshing={isRefreshing}
            isInDemoMode={isInDemoMode}
            canPerformActions={canPerformActions}
            currentGitHubLogin={currentGitHubLogin}
            githubRewards={githubRewards}
            githubPoints={githubPoints}
            token={token}
            showToast={showToast}
            onRefreshRequests={refreshRequests}
            onRefreshNotifications={refreshNotifications}
            onRefreshGitHub={handleRefreshGitHub}
            isGitHubRefreshing={isGitHubRefreshing}
            onRequestUpdate={requestUpdate}
            onCloseRequest={closeRequest}
            getUnreadCountForRequest={getUnreadCountForRequest}
            markRequestNotificationsAsRead={markRequestNotificationsAsRead}
            onShowLoginPrompt={() => setShowLoginPrompt(true)}
          />
        ) : success ? (
          <SuccessView
            success={success}
            screenshots={screenshots}
            onViewUpdates={() => {
              setSuccess(null)
              setActiveTab('updates')
              refreshNotifications()
            }}
          />
        ) : (
          <SubmitForm
            description={description}
            setDescription={setDescription}
            requestType={requestType}
            setRequestType={setRequestType}
            targetRepo={targetRepo}
            setTargetRepo={setTargetRepo}
            screenshots={screenshots}
            setScreenshots={setScreenshots}
            isSubmitting={isSubmitting}
            canPerformActions={canPerformActions}
            feedbackTokenMissing={feedbackTokenMissing}
            editingDraftId={editingDraftId}
            setEditingDraftId={setEditingDraftId}
            initialRequestType={initialRequestType}
            error={error}
            setError={setError}
            isPreviewFullscreen={isPreviewFullscreen}
            setIsPreviewFullscreen={setIsPreviewFullscreen}
            setPreviewImageSrc={setPreviewImageSrc}
            onSubmit={createRequest}
            onSuccess={handleSubmitSuccess}
            onShowSetupDialog={() => setShowSetupDialog(true)}
            onShowLoginPrompt={() => setShowLoginPrompt(true)}
            onReauthenticate={handleLoginRedirect}
          />
        )}
      </div>

      {/* Footer - always visible */}
      <div className="p-4 border-t border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 text-2xs text-muted-foreground/50">
          <span><kbd className="px-1 py-0.5 rounded bg-secondary/50 text-[9px]">Esc</kbd> close</span>
        </div>
        <SubmitFooter
          activeTab={activeTab}
          success={success}
          description={description}
          isSubmitting={isSubmitting}
          canPerformActions={canPerformActions}
          feedbackTokenMissing={feedbackTokenMissing}
          editingDraftId={editingDraftId}
          requestType={requestType}
          onClose={handleClose}
          onSaveDraft={handleSaveDraft}
          onShowLoginPrompt={() => setShowLoginPrompt(true)}
          onSetActiveTab={setActiveTab}
        />
      </div>

      {/* Fullscreen markdown preview overlay */}
      {isPreviewFullscreen && (
        <FullscreenPreview
          description={description}
          onClose={() => setIsPreviewFullscreen(false)}
        />
      )}

      {/* Screenshot image preview overlay */}
      {previewImageSrc && (
        <ScreenshotPreviewOverlay
          src={previewImageSrc}
          onClose={() => setPreviewImageSrc(null)}
        />
      )}
    </BaseModal>
  )
}
