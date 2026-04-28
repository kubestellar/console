import { useEffect, useState, lazy, Suspense } from 'react'
import { Bug, Loader2 } from 'lucide-react'
import { useFeatureRequests } from '../../hooks/useFeatureRequests'
import type { RequestType } from '../../hooks/useFeatureRequests'
import { useModalState } from '../../lib/modals'
import { useTranslation } from 'react-i18next'

// Lazy-load the modal (~67 KB) — only needed when the user clicks the bug icon
const FeatureRequestModal = lazy(() =>
  import('./FeatureRequestModal').then(m => ({ default: m.FeatureRequestModal }))
)

/** Badge displays "99+" for counts above this threshold. */
const MAX_BADGE_DISPLAY = 99

export function FeatureRequestButton() {
  const { t } = useTranslation()
  const { isOpen: isModalOpen, open: openModal, close: closeModal } = useModalState()
  const [initialRequestType, setInitialRequestType] = useState<RequestType | undefined>()
  // issue #10681 — Sync the navbar badge with "Your Requests" count shown in
  // the Updates tab. Previously the badge showed unread *notifications*
  // (a different data source), so the two numbers never agreed. Now we use
  // summaries.length — the total request count from the same endpoint that
  // backs "Your Requests ({n})".
  const { summaries, isLoading: summariesLoading, error: summariesError } = useFeatureRequests(undefined, { countOnly: true })
  const requestCount = (summaries || []).length

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
        className={`relative p-2 w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary/50 transition-colors ${
          summariesError ? 'text-red-400' : requestCount > 0 ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
        title={
          summariesError
            ? t('feedback.couldNotLoadStatus', { error: summariesError })
            : requestCount > 0
              ? t('feedback.yourRequestsCount', { count: requestCount })
              : t('feedback.reportBugOrFeature')
        }
      >
        {summariesLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Bug className="w-5 h-5" />}
        {!summariesLoading && requestCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-2xs font-bold text-white rounded-full bg-purple-500">
            {requestCount > MAX_BADGE_DISPLAY ? `${MAX_BADGE_DISPLAY}+` : requestCount}
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
