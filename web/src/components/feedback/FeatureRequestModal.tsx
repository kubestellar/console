import { useState } from 'react'
import { X } from 'lucide-react'
import { StatusBadge } from '../ui/StatusBadge'
import { BaseModal } from '../../lib/modals'
import { useFeatureRequests, useNotifications } from '../../hooks/useFeatureRequests'
import { useAuth } from '../../lib/auth'
import { useRewards } from '../../hooks/useRewards'
import { BACKEND_DEFAULT_URL, DEMO_TOKEN_VALUE } from '../../lib/constants'
import { clearStoredAuthToken } from '../../lib/authToken'
import { isDemoModeForced } from '../../lib/demoMode'
import { useTranslation } from 'react-i18next'
import { SetupInstructionsDialog } from '../setup/SetupInstructionsDialog'
import { REWARD_ACTIONS } from '../../types/rewards'

import type { FeatureRequestModalProps, TabType } from './FeatureRequestTypes'
import { DiscardConfirmDialog, LoginPromptDialog, FullscreenPreview, ScreenshotPreviewOverlay } from './FeedbackDialogs'
import { DraftsTab } from './DraftsTab'
import { UpdatesTab } from './UpdatesTab'
import { SubmitForm, SuccessView, SubmitFooter } from './SubmitTab'
import { useFeatureRequestForm } from './useFeatureRequestForm'
import { useFeatureRequestClose } from './useFeatureRequestClose'
import { useFeedbackToken } from './useFeedbackToken'

export function FeatureRequestModal({ isOpen, onClose, initialTab, initialRequestType, initialContext }: FeatureRequestModalProps) {
  const { t } = useTranslation()
  const { user, isAuthenticated, token } = useAuth()
  const currentGitHubLogin = user?.github_login || ''
  const {
    createRequest, isSubmitting, requests,
    isLoading: requestsLoading, isRefreshing: requestsRefreshing,
    refresh: refreshRequests, requestUpdate, closeRequest, reopenRequest,
    isDemoMode: isInDemoMode,
  } = useFeatureRequests(currentGitHubLogin)
  const {
    isRefreshing: notificationsRefreshing, refresh: refreshNotifications,
    getUnreadCountForRequest, markRequestNotificationsAsRead,
  } = useNotifications()
  const { githubRewards, githubPoints, refreshGitHubRewards } = useRewards()
  const [isGitHubRefreshing, setIsGitHubRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>(initialTab || 'submit')
  const [showLoginPrompt, setShowLoginPrompt] = useState(false)
  const [showSetupDialog, setShowSetupDialog] = useState(false)

  const isRefreshing = requestsRefreshing || notificationsRefreshing
  const canPerformActions = isAuthenticated && token !== DEMO_TOKEN_VALUE

  const form = useFeatureRequestForm({
    isOpen, initialRequestType, initialContext,
    onSetActiveTab: setActiveTab,
    onRefreshRequests: refreshRequests,
    onRefreshNotifications: refreshNotifications,
  })

  const feedbackTokenMissing = useFeedbackToken(isOpen, token)

  const close = useFeatureRequestClose({
    initialTab, initialRequestType, onClose, isSubmitting,
    hasUnsavedSubmitContent: form.hasUnsavedSubmitContent,
    success: form.success,
    activeTab, setActiveTab,
    handleSaveDraft: form.handleSaveDraft,
    resetForm: form.resetForm,
  })

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
    clearStoredAuthToken()
    window.location.href = `${BACKEND_DEFAULT_URL}/auth/github`
  }

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={close.handleClose}
      size="lg"
      closeOnBackdrop={true}
      closeOnEscape={true}
      className="h-auto max-h-[min(90vh,calc(100vh-2rem))]! lg:h-[80vh]!"
    >
      {/* Discard/Save Draft confirmation */}
      {close.showDiscardConfirm && (
        <DiscardConfirmDialog
          onSaveAndClose={close.handleSaveAndClose}
          onDiscard={close.forceClose}
          onKeepEditing={() => close.setShowDiscardConfirm(false)}
        />
      )}

      {close.pendingTabSwitch && (
        <DiscardConfirmDialog
          onSaveAndClose={close.handleSaveDraftAndSwitchTab}
          onDiscard={close.handleDiscardAndSwitchTab}
          onKeepEditing={() => close.setPendingTabSwitch(null)}
          message={t('feedback.unsavedTabSwitchPrompt', 'You have unsaved report content. Save it as a draft before switching tabs?')}
          saveLabel={t('feedback.saveDraftAndSwitch', 'Save Draft & Switch')}
          discardLabel={t('feedback.switchWithoutSaving', 'Switch Without Saving')}
          keepEditingLabel={t('common:common.keepEditing', 'Keep editing')}
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
          description={form.description}
          targetRepo={form.targetRepo}
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
          onClick={close.handleClose}
          disabled={isSubmitting}
          className="p-1 rounded hover:bg-secondary/50 text-muted-foreground disabled:opacity-50"
          aria-label={t('actions.close')}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        <button
          onClick={() => close.handleTabChange('submit')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'submit'
              ? 'text-foreground border-b-2 border-purple-500'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('feedback.submit')}
        </button>
        <button
          onClick={() => close.handleTabChange('drafts')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'drafts'
              ? 'text-foreground border-b-2 border-purple-500'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Drafts
          {form.draftCount > 0 && (
            <span className="min-w-5 h-5 px-1 text-xs rounded-full bg-orange-500 text-white flex items-center justify-center">
              {form.draftCount}
            </span>
          )}
        </button>
        <button
          onClick={() => close.handleTabChange('updates')}
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
            drafts={form.drafts}
            draftCount={form.draftCount}
            recentlyDeletedDrafts={form.recentlyDeletedDrafts}
            recentlyDeletedCount={form.recentlyDeletedCount}
            editingDraftId={form.editingDraftId}
            confirmDeleteDraft={form.confirmDeleteDraft}
            showClearAllDrafts={form.showClearAllDrafts}
            onSetActiveTab={close.handleTabChange}
            onRestoreDraft={form.handleRestoreDraft}
            onDeleteDraft={form.handleDeleteDraft}
            onPermanentlyDeleteDraft={form.permanentlyDeleteDraft}
            onRestoreDeletedDraft={form.restoreDeletedDraft}
            onEmptyRecentlyDeleted={form.emptyRecentlyDeleted}
            onSetConfirmDeleteDraft={form.setConfirmDeleteDraft}
            onSetShowClearAllDrafts={form.setShowClearAllDrafts}
            onClearAllDrafts={form.clearAllDrafts}
            showToast={form.showToast}
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
            showToast={form.showToast}
            onRefreshRequests={refreshRequests}
            onRefreshNotifications={refreshNotifications}
            onRefreshGitHub={handleRefreshGitHub}
            isGitHubRefreshing={isGitHubRefreshing}
            onRequestUpdate={requestUpdate}
            onCloseRequest={closeRequest}
            onReopenRequest={reopenRequest}
            getUnreadCountForRequest={getUnreadCountForRequest}
            markRequestNotificationsAsRead={markRequestNotificationsAsRead}
            onShowLoginPrompt={() => setShowLoginPrompt(true)}
          />
        ) : form.success ? (
          <SuccessView
            success={form.success}
            screenshots={form.screenshots}
            onViewUpdates={() => {
              form.setSuccess(null)
              setActiveTab('updates')
              refreshNotifications()
            }}
          />
        ) : (
          <SubmitForm
            description={form.description}
            setDescription={form.setDescription}
            requestType={form.requestType}
            setRequestType={form.setRequestType}
            targetRepo={form.targetRepo}
            setTargetRepo={form.setTargetRepo}
            screenshots={form.screenshots}
            setScreenshots={form.setScreenshots}
            isSubmitting={isSubmitting}
            canPerformActions={canPerformActions}
            feedbackTokenMissing={feedbackTokenMissing}
            editingDraftId={form.editingDraftId}
            setEditingDraftId={form.setEditingDraftId}
            initialRequestType={initialRequestType}
            error={form.error}
            setError={form.setError}
            isPreviewFullscreen={form.isPreviewFullscreen}
            setIsPreviewFullscreen={form.setIsPreviewFullscreen}
            setPreviewImageSrc={form.setPreviewImageSrc}
            onSubmit={createRequest}
            onSuccess={form.handleSubmitSuccess}
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
          success={form.success}
          description={form.description}
          isSubmitting={isSubmitting}
          canPerformActions={canPerformActions}
          feedbackTokenMissing={feedbackTokenMissing}
          editingDraftId={form.editingDraftId}
          requestType={form.requestType}
          onClose={close.handleClose}
          onSaveDraft={form.handleSaveDraft}
          onShowLoginPrompt={() => setShowLoginPrompt(true)}
          onSetActiveTab={close.handleTabChange}
        />
      </div>

      {/* Fullscreen markdown preview overlay */}
      {form.isPreviewFullscreen && (
        <FullscreenPreview
          description={form.description}
          onClose={() => form.setIsPreviewFullscreen(false)}
        />
      )}

      {/* Screenshot image preview overlay */}
      {form.previewImageSrc && (
        <ScreenshotPreviewOverlay
          src={form.previewImageSrc}
          onClose={() => form.setPreviewImageSrc(null)}
        />
      )}
    </BaseModal>
  )
}
