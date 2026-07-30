import { useState } from 'react'
import { Bell } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { isBrowserNotifVerified, setBrowserNotifVerified } from '../../lib/notificationStatus'

/** Notification verification flow state */
type NotifVerifyState = 'idle' | 'asked' | 'verified' | 'failed'

/**
 * Inline browser notification verification indicator for the ActiveAlerts card header.
 * Shows a bell icon with a dot when notifications aren't verified, and guides
 * the user through a send-test / confirm flow.
 */
export function NotificationVerifyIndicator() {
  const { t } = useTranslation('cards')
  const [notifVerifyState, setNotifVerifyState] = useState<NotifVerifyState>('idle')
  const [notifVerified, setNotifVerified] = useState(() => isBrowserNotifVerified())

  /** Whether the notification indicator should be visible */
  const showNotifIndicator =
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted' &&
    !notifVerified &&
    notifVerifyState !== 'verified'

  /** Send a test notification and ask user to confirm receipt */
  const handleSendTestNotif = () => {
    try {
      new Notification('KubeStellar Console', {
        body: t('activeAlerts.testNotificationBody'),
        icon: '/favicon.ico',
      })
    } catch {
      // Notification constructor may throw in some environments
    }
    setNotifVerifyState('asked')
  }

  /** User confirmed they saw the test notification */
  const handleNotifYes = () => {
    setBrowserNotifVerified(true)
    setNotifVerified(true)
    setNotifVerifyState('verified')
  }

  /** User did NOT see the test notification */
  const handleNotifNo = () => {
    setNotifVerifyState('failed')
  }

  // Don't render anything once verified or if not applicable
  if (!showNotifIndicator && notifVerifyState !== 'asked' && notifVerifyState !== 'failed') {
    return null
  }

  return (
    <>
      {showNotifIndicator && notifVerifyState === 'idle' && (
        <button
          onClick={handleSendTestNotif}
          title={t('activeAlerts.notifNotVerified')}
          className="relative flex items-center p-1 rounded hover:bg-secondary/60 transition-colors"
        >
          <Bell className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400" />
        </button>
      )}
      {notifVerifyState === 'asked' && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{t('activeAlerts.didYouSeeIt')}</span>
          <button
            onClick={handleNotifYes}
            className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors text-xs"
          >
            {t('activeAlerts.yes')}
          </button>
          <button
            onClick={handleNotifNo}
            className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground hover:text-foreground transition-colors text-xs"
          >
            {t('activeAlerts.no')}
          </button>
        </span>
      )}
      {notifVerifyState === 'failed' && (
        <span className="flex items-center gap-1 text-xs text-amber-400">
          <Bell className="w-3 h-3" />
          <span>{t('activeAlerts.checkSystemSettings')}</span>
        </span>
      )}
    </>
  )
}
