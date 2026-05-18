import type { CloseRequestInput, FeatureRequest, ReopenRequestInput } from '../../hooks/useFeatureRequests'
import type { PreviewResult } from './FeatureRequestTypes'
import type { GitHubContribution } from '../../types/rewards'

export type RequestCardState = 'awaiting_verification' | FeatureRequest['status']

export interface RequestStatusInfo {
  label: string
  color: string
  bgColor: string
}

export interface UpdatesTabProps {
  requests: FeatureRequest[]
  requestsLoading: boolean
  isRefreshing: boolean
  isInDemoMode: boolean
  canPerformActions: boolean
  currentGitHubLogin: string
  githubRewards: {
    breakdown?: {
      prs_merged: number
      prs_opened: number
      bug_issues: number
      feature_issues: number
      other_issues: number
    }
    contributions?: GitHubContribution[]
    from_cache?: boolean
    cached_at: string
  } | null
  githubPoints: number
  token: string | null
  showToast: (message: string, type: 'success' | 'error' | 'info') => void
  onRefreshRequests: () => void
  onRefreshNotifications: () => void
  onRefreshGitHub: () => void
  isGitHubRefreshing: boolean
  onRequestUpdate: (id: string) => Promise<unknown>
  onCloseRequest: (id: string, input?: CloseRequestInput) => Promise<unknown>
  onReopenRequest: (id: string, input: ReopenRequestInput) => Promise<unknown>
  getUnreadCountForRequest: (id: string) => number
  markRequestNotificationsAsRead: (id: string) => void
  onShowLoginPrompt: () => void
}

export interface RequestItemProps {
  request: FeatureRequest
  currentGitHubLogin: string
  canPerformActions: boolean
  actionLoading: string | null
  confirmClose: string | null
  previewChecking: number | null
  previewResults: Record<number, PreviewResult>
  getUnreadCountForRequest: (id: string) => number
  markRequestNotificationsAsRead: (id: string) => void
  onRequestUpdate: (id: string) => Promise<void>
  onCloseRequest: (id: string, input?: CloseRequestInput) => Promise<boolean>
  onReopenRequest: (id: string, input: ReopenRequestInput) => Promise<void>
  onSetConfirmClose: (id: string | null) => void
  onCheckPreview: (prNumber: number) => Promise<void>
  onShowLoginPrompt: () => void
}

export interface GitHubContributionsSectionProps {
  currentGitHubLogin: string
  githubRewards: UpdatesTabProps['githubRewards']
  githubPoints: number
  isGitHubRefreshing: boolean
  onRefreshGitHub: () => void
  requests: FeatureRequest[]
  requestsLoading: boolean
}
