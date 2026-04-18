import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, Check, X, Moon } from 'lucide-react'
import { isBrowserNotifVerified, setBrowserNotifVerified } from '../../../lib/notificationStatus'
import { useDoNotDisturb } from '../../../hooks/useDoNotDisturb'

/** Browser notification verification flow state */
type BrowserNotifState = 'idle' | 'asked' | 'verified' | 'failed'

/**
 * Pick browser-specific instruction key. The OS-level notification center
 * labels the browser differently depending on which one is installed, so
 * showing "Google Chrome → Allow Notifications" to a Firefox user is wrong
 * (#8305). Edge must match before Chrome because its UA contains "Chrome".
 */
export function detectInstructionKey(ua: string): string {
  const u = ua.toLowerCase()
  if (u.includes('edg/') || u.includes('edge/')) return 'settings.notifications.browser.enableInstructionsEdge'
  if (u.includes('firefox/')) return 'settings.notifications.browser.enableInstructionsFirefox'
  if (u.includes('safari/') && !u.includes('chrome/') && !u.includes('chromium/') && !u.includes('android')) {
    return 'settings.notifications.browser.enableInstructionsSafari'
  }
  if (u.includes('chrome/') || u.includes('chromium/')) return 'settings.notifications.browser.enableInstructionsChrome'
  return 'settings.notifications.browser.enableInstructionsGeneric'
}

/**
 * Browser notification settings sub-section.
 * Handles permission requests, test notifications, and verification flow.
 */
export function BrowserNotificationSettings() {
  const { t } = useTranslation()
  const instructionKey = detectInstructionKey(
    typeof navigator !== 'undefined' ? navigator.userAgent : '',
  )
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
                  {t(instructionKey as never)}
                </p>
                <p className="text-xs text-amber-400/80">
                  {t('settings.notifications.browser.dndHint')}
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

      {/* Quiet Hours */}
      <QuietHoursConfig />
    </div>
  )
}

/** Quiet hours configuration — recurring daily window where notifications are suppressed */
function QuietHoursConfig() {
  const dnd = useDoNotDisturb()
  const { t } = useTranslation()

  return (
    <div className="space-y-3 pt-4 border-t border-border">
      <div className="flex items-center gap-2">
        <Moon className="w-4 h-4 text-muted-foreground" />
        <h4 className="text-sm font-medium text-foreground">
          {t('settings.notifications.browser.quietHoursTitle')}
        </h4>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('settings.notifications.browser.quietHoursDesc')}
      </p>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={dnd.quietHoursEnabled}
          onChange={(e) => dnd.setQuietHours(e.target.checked)}
          className="rounded border-border accent-primary"
        />
        <span className="text-sm text-foreground">
          {t('settings.notifications.browser.quietHoursDontNotifyBetween')}
        </span>
      </label>

      {dnd.quietHoursEnabled && (
        <div className="flex items-center gap-2 pl-6">
          <input
            type="time"
            value={dnd.quietHoursStart}
            onChange={(e) => dnd.setQuietHours(true, e.target.value)}
            className="px-2 py-1 text-sm bg-secondary border border-border rounded text-foreground"
          />
          <span className="text-xs text-muted-foreground">
            {t('settings.notifications.browser.quietHoursAnd')}
          </span>
          <input
            type="time"
            value={dnd.quietHoursEnd}
            onChange={(e) => dnd.setQuietHours(true, undefined, e.target.value)}
            className="px-2 py-1 text-sm bg-secondary border border-border rounded text-foreground"
          />
        </div>
      )}
    </div>
  )
}
