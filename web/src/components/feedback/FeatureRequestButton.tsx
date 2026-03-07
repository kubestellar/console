import { useEffect, useState } from 'react'
import { Bug } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { FeatureRequestModal } from './FeatureRequestModal'
import { useNotifications } from '../../hooks/useFeatureRequests'
import { useTranslation } from 'react-i18next'

export function FeatureRequestButton() {
  const { t: _t } = useTranslation()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { unreadCount } = useNotifications()
  const location = useLocation()

  // Auto-open modal when navigated from /issue route
  useEffect(() => {
    if ((location.state as { openFeedback?: boolean })?.openFeedback) {
      setIsModalOpen(true)
      // Clear the state so it doesn't re-trigger on re-renders
      window.history.replaceState({}, '', location.pathname)
    }
  }, [location.state, location.pathname])

  const handleClick = () => {
    setIsModalOpen(true)
  }

  return (
    <>
      <button
        onClick={handleClick}
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

      <FeatureRequestModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  )
}
