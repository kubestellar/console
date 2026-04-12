import { useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { Bug, Loader2 } from 'lucide-react'
import { useFeatureRequests, useNotifications } from '../../hooks/useFeatureRequests'
import type { RequestType } from '../../hooks/useFeatureRequests'
import { useModalState } from '../../lib/modals'

// Lazy-load the modal (~67 KB) — only needed when the user clicks the bug icon
const FeatureRequestModal = lazy(() =>
  import('./FeatureRequestModal').then(m => ({ default: m.FeatureRequestModal }))
)

export function FeatureRequestButton() {
  const { isOpen: isModalOpen, open: openModal, close: closeModal } = useModalState()
  const [initialRequestType, setInitialRequestType] = useState<RequestType | undefined>()
  const { notifications, isLoading: notificationsLoading } = useNotifications()
  // PR #6518 item G — this navbar button only needs the closed-request IDs
  // to filter notifications for the badge count; it does not render any
  // queue items, titles, or descriptions. Pass { countOnly: true } so the
  // hook fetches the lean `?count_only=true` payload ({id, status} pairs).
  // Consumers that render the full queue (FeatureRequestModal, Updates tab)
  // must NOT pass this flag.
  // PR #6573 item B — use the lean `summaries` return (typed as
  // FeatureRequestSummary[]) instead of `requests`. The count_only endpoint
  // only sends {id, status}, so the full FeatureRequest[] type was a lie.
  const { summaries, isLoading: summariesLoading } = useFeatureRequests(undefined, { countOnly: true })
  const isLoadingFeedback = notificationsLoading || summariesLoading

  // issue 6475 — Unify the navbar badge count with the Updates tab.
  // Previously the navbar used the raw `unreadCount` returned by
  // useNotifications(), which counts notifications for ALL feature requests
  // including closed ones. The Updates tab (FeatureRequestModal) computes
  // its own badge by excluding notifications whose `feature_request_id`
  // points at a closed request. The two displays disagreed whenever the
  // user had unread activity on a closed issue. Reuse the modal's filter
  // here so the navbar matches.
  const unreadCount = useMemo(() => {
    const closedIds = new Set(
      (summaries || []).filter(r => r.status === 'closed').map(r => r.id)
    )
    return (notifications || [])
      .filter(n => !closedIds.has(n.feature_request_id || ''))
      .filter(n => !n.read)
      .length
  }, [notifications, summaries])

  // Auto-open modal when navigated from /issue, /feedback, /feature routes
  useEffect(() => {
    const handler = () => { setInitialRequestType(undefined); openModal() }
    const featureHandler = () => { setInitialRequestType('feature'); openModal() }
    window.addEventListener('open-feedback', handler)
    window.addEventListener('open-feedback-feature', featureHandler)
    return () => {
      window.removeEventListener('open-feedback', handler)
      window.removeEventListener('open-feedback-feature', featureHandler)
    }
  }, [openModal])

  return (
    <>
      <button
        onClick={openModal}
        data-tour="feedback"
        className={`relative p-2 rounded-lg hover:bg-secondary/50 transition-colors ${
          unreadCount > 0 ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
        title={unreadCount > 0 ? `${unreadCount} updates on your feedback` : 'Report a bug or request a feature'}
      >
        {isLoadingFeedback ? <Loader2 className="w-5 h-5 animate-spin" /> : <Bug className="w-5 h-5" />}
        {!isLoadingFeedback && unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-2xs font-bold text-white rounded-full bg-purple-500">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isModalOpen && (
        <Suspense fallback={null}>
          <FeatureRequestModal
            isOpen={isModalOpen}
            onClose={() => { closeModal(); setInitialRequestType(undefined) }}
            initialRequestType={initialRequestType}
          />
        </Suspense>
      )}
    </>
  )
}
