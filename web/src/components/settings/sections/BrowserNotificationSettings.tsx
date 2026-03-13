import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, Check, X } from 'lucide-react'
import { isBrowserNotifVerified, setBrowserNotifVerified } from '../../../lib/notificationStatus'

/** Browser notification verification flow state */
type BrowserNotifState = 'idle' | 'asked' | 'verified' | 'failed'

/**
 * Browser notification settings sub-section.
 * Handles permission requests, test notifications, and verification flow.
 */
export function BrowserNotificationSettings() {
  const { t } = useTranslation()
  const [browserNotifState, setBrowserNotifState] = useState<BrowserNotifState>(
    () => (isBrowserNotifVerified() ? 'verified' : 'idle'),
  )

  const browserPermission =
    typeof Notification !== 'undefined' ? Notification.permission : 'default'

  const handleRequestPermission = async () => {
    if (typeof Notification === 'undefined') return
    try {
      const result = await Notification.requestPermission()
      if (result === 'granted') {
        setBrowserNotifState('idle')
      }
    } catch {
      // Permission request may fail in some environments
    }
  }

  const handleSendBrowserTest = () => {
    try {
      new Notification('KubeStellar Console Test', {
        body: t('settings.notifications.browser.testBody'),
        requireInteraction: true,
        icon: '/favicon.ico',
      })
    } catch {
      // Notification constructor may throw in some environments
    }
    setBrowserNotifState('asked')
  }

  const handleBrowserNotifYes = () => {
    setBrowserNotifVerified(true)
    setBrowserNotifState('verified')
  }

  const handleBrowserNotifNo = () => {
    setBrowserNotifVerified(false)
    setBrowserNotifState('failed')
  }

  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <Globe className="w-4 h-4 text-foreground" />
        <h3 className="text-sm font-medium text-foreground">{t('settings.notifications.browser.title')}</h3>
      </div>

      {/* Permission status */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{t('settings.notifications.browser.permissionStatus')}</span>
        <span
          className={`px-2 py-0.5 text-xs rounded-full border ${
            browserPermission === 'granted'
              ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : browserPermission === 'denied'
                ? 'bg-red-500/10 border-red-500/20 text-red-400'
                : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
          }`}
        >
          {browserPermission}
        </span>
      </div>

      {browserPermission === 'granted' ? (
        <>
          {browserNotifState === 'idle' && (
            <button
              onClick={handleSendBrowserTest}
              className="px-4 py-2 text-sm rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors"
            >
              {t('settings.notifications.browser.sendTest')}
            </button>
          )}

          {browserNotifState === 'asked' && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{t('settings.notifications.browser.didYouSeeIt')}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBrowserNotifYes}
                  className="px-3 py-1.5 text-sm rounded-lg bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors"
                >
                  {t('settings.notifications.browser.yes')}
                </button>
                <button
                  onClick={handleBrowserNotifNo}
                  className="px-3 py-1.5 text-sm rounded-lg bg-secondary text-muted-foreground border border-border hover:text-foreground transition-colors"
                >
                  {t('settings.notifications.browser.no')}
                </button>
              </div>
            </div>
          )}

          {browserNotifState === 'verified' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-400">
                {t('settings.notifications.browser.verified')}
              </p>
            </div>
          )}

          {browserNotifState === 'failed' && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <X className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-400">
                  {t('settings.notifications.browser.enableInstructions')}
                </p>
              </div>
              <button
                onClick={handleSendBrowserTest}
                className="px-4 py-2 text-sm rounded-lg bg-secondary text-muted-foreground border border-border hover:text-foreground transition-colors"
              >
                {t('settings.notifications.browser.tryAgain')}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          {browserPermission === 'denied' ? (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <X className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">
                {t('settings.notifications.browser.blocked')}
              </p>
            </div>
          ) : (
            <button
              onClick={handleRequestPermission}
              className="px-4 py-2 text-sm rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors"
            >
              {t('settings.notifications.browser.requestPermission')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
