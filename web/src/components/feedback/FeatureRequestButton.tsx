import { useEffect, useState, lazy, Suspense } from 'react'
import { Bug } from 'lucide-react'
import { useNotifications } from '../../hooks/useFeatureRequests'
import type { RequestType } from '../../hooks/useFeatureRequests'
import { useModalState } from '../../lib/modals'

// Lazy-load the modal (~67 KB) — only needed when the user clicks the bug icon
const FeatureRequestModal = lazy(() =>
  import('./FeatureRequestModal').then(m => ({ default: m.FeatureRequestModal }))
)

export function FeatureRequestButton() {
  const { isOpen: isModalOpen, open: openModal, close: closeModal } = useModalState()
  const [initialRequestType, setInitialRequestType] = useState<RequestType | undefined>()
  const { unreadCount } = useNotifications()

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
        <Bug className="w-5 h-5" />
        {unreadCount > 0 && (
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
