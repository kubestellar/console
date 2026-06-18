import { useFeatureRequests } from './useFeatureRequests/useFeatureRequestsCore'
import { useNotifications } from './useFeatureRequests/useNotifications'

export {
  __resetDemoNotificationsForTests,
} from './useFeatureRequests/demoData'
export {
  isTriaged,
  STATUS_LABELS,
  STATUS_COLORS,
  STATUS_DESCRIPTIONS,
  getStatusDescription,
} from './useFeatureRequests/types'
export type {
  CloseRequestInput,
  ConsoleError,
  CreateFeatureRequestInput,
  DiagnosticInfo,
  FailedApiCall,
  FeatureRequest,
  FeedbackType,
  Notification,
  NotificationType,
  PRFeedback,
  ReopenRequestInput,
  RequestStatus,
  RequestType,
  SubmitFeedbackInput,
  TargetRepo,
} from './useFeatureRequests/types'
export type {
  FeatureRequestSummary,
  UseFeatureRequestsOptions,
} from './useFeatureRequests/useFeatureRequestsCore'
export { useFeatureRequests, useNotifications }

export function useFeedback() {
  const featureRequests = useFeatureRequests()
  const notifications = useNotifications()

  return {
    ...featureRequests,
    notifications: notifications.notifications,
    unreadCount: notifications.unreadCount,
    notificationsLoading: notifications.isLoading,
    notificationsRefreshing: notifications.isRefreshing,
    markNotificationAsRead: notifications.markAsRead,
    markAllNotificationsAsRead: notifications.markAllAsRead,
    refreshNotifications: notifications.refresh,
  }
}
