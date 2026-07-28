import { DraftsTab } from './DraftsTab'
import { UpdatesTab } from './UpdatesTab'
import { SuccessView } from './SuccessView'
import { FeatureRequestDescriptionEditor } from './FeatureRequestDescriptionEditor'
import type { FeedbackDraft } from '../../hooks/useFeedbackDrafts'
import type { CloseRequestInput, FeatureRequest, ReopenRequestInput } from '../../hooks/useFeatureRequests'
import type { GitHubRewardsResponse } from '../../types/rewards'
import type { SubmitFormProps } from './submitTab.types'
import type { ScreenshotItem, SuccessState, TabType } from './FeatureRequestTypes'

interface FeatureRequestFormStepsProps {
  activeTab: TabType
  drafts: FeedbackDraft[]
  draftCount: number
  recentlyDeletedDrafts: FeedbackDraft[]
  recentlyDeletedCount: number
  editingDraftId: string | null
  confirmDeleteDraft: string | null
  showClearAllDrafts: boolean
  requests: FeatureRequest[]
  requestsLoading: boolean
  isRefreshing: boolean
  isInDemoMode: boolean
  canPerformActions: boolean
  currentGitHubLogin: string
  githubRewards: GitHubRewardsResponse | null
  githubPoints: number
  token: string | null
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void
  onRefreshRequests: () => void
  onRefreshNotifications: () => void
  onRefreshGitHub: () => Promise<void>
  isGitHubRefreshing: boolean
  onRequestUpdate: (id: string) => Promise<void>
  onCloseRequest: (id: string, input?: CloseRequestInput) => Promise<boolean>
  onReopenRequest: (id: string, input: ReopenRequestInput) => Promise<void>
  getUnreadCountForRequest: (id: string) => number
  markRequestNotificationsAsRead: (id: string) => void
  onShowLoginPrompt: () => void
  success: SuccessState | null
  screenshots: ScreenshotItem[]
  onViewUpdates: () => void
  submitFormProps: SubmitFormProps
  onSetActiveTab: (tab: TabType) => void
  onRestoreDraft: (draft: FeedbackDraft) => void
  onDeleteDraft: (id: string) => void
  onPermanentlyDeleteDraft: (id: string) => void
  onRestoreDeletedDraft: (id: string) => void
  onEmptyRecentlyDeleted: () => void
  onSetConfirmDeleteDraft: (id: string | null) => void
  onSetShowClearAllDrafts: (show: boolean) => void
  onClearAllDrafts: () => void
}

export function FeatureRequestFormSteps(props: FeatureRequestFormStepsProps) {
  const {
    activeTab,
    drafts,
    draftCount,
    recentlyDeletedDrafts,
    recentlyDeletedCount,
    editingDraftId,
    confirmDeleteDraft,
    showClearAllDrafts,
    requests,
    requestsLoading,
    isRefreshing,
    isInDemoMode,
    canPerformActions,
    currentGitHubLogin,
    githubRewards,
    githubPoints,
    token,
    showToast,
    onRefreshRequests,
    onRefreshNotifications,
    onRefreshGitHub,
    isGitHubRefreshing,
    onRequestUpdate,
    onCloseRequest,
    onReopenRequest,
    getUnreadCountForRequest,
    markRequestNotificationsAsRead,
    onShowLoginPrompt,
    success,
    screenshots,
    onViewUpdates,
    submitFormProps,
    onSetActiveTab,
    onRestoreDraft,
    onDeleteDraft,
    onPermanentlyDeleteDraft,
    onRestoreDeletedDraft,
    onEmptyRecentlyDeleted,
    onSetConfirmDeleteDraft,
    onSetShowClearAllDrafts,
    onClearAllDrafts,
  } = props

  if (activeTab === 'drafts') {
    return (
      <DraftsTab
        drafts={drafts}
        draftCount={draftCount}
        recentlyDeletedDrafts={recentlyDeletedDrafts}
        recentlyDeletedCount={recentlyDeletedCount}
        editingDraftId={editingDraftId}
        confirmDeleteDraft={confirmDeleteDraft}
        showClearAllDrafts={showClearAllDrafts}
        onSetActiveTab={onSetActiveTab}
        onRestoreDraft={onRestoreDraft}
        onDeleteDraft={onDeleteDraft}
        onPermanentlyDeleteDraft={onPermanentlyDeleteDraft}
        onRestoreDeletedDraft={onRestoreDeletedDraft}
        onEmptyRecentlyDeleted={onEmptyRecentlyDeleted}
        onSetConfirmDeleteDraft={onSetConfirmDeleteDraft}
        onSetShowClearAllDrafts={onSetShowClearAllDrafts}
        onClearAllDrafts={onClearAllDrafts}
        showToast={showToast}
      />
    )
  }

  if (activeTab === 'updates') {
    return (
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
        onRefreshRequests={onRefreshRequests}
        onRefreshNotifications={onRefreshNotifications}
        onRefreshGitHub={onRefreshGitHub}
        isGitHubRefreshing={isGitHubRefreshing}
        onRequestUpdate={onRequestUpdate}
        onCloseRequest={onCloseRequest}
        onReopenRequest={onReopenRequest}
        getUnreadCountForRequest={getUnreadCountForRequest}
        markRequestNotificationsAsRead={markRequestNotificationsAsRead}
        onShowLoginPrompt={onShowLoginPrompt}
      />
    )
  }

  if (success) {
    return (
      <SuccessView
        success={success}
        screenshots={screenshots}
        onViewUpdates={onViewUpdates}
      />
    )
  }

  return <FeatureRequestDescriptionEditor submitFormProps={submitFormProps} />
}
