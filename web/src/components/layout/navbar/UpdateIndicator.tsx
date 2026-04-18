import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Loader2, Check, AlertTriangle } from 'lucide-react'
import { useVersionCheck } from '../../../hooks/useVersionCheck'
import { useUpgradeState } from '../../../hooks/useUpgradeState'
import { useFeatureHints } from '../../../hooks/useFeatureHints'
import { FeatureHintTooltip } from '../../ui/FeatureHintTooltip'
import { WhatsNewModal, isUpdateSnoozed } from '../../updates/WhatsNewModal'
import { isDemoMode } from '../../../lib/demoMode'
import { useToast } from '../../ui/Toast'
import { emitWhatsNewModalOpened } from '../../../lib/analytics'
import { cn } from '../../../lib/cn'

const UPDATE_TOAST_SESSION_KEY = 'kc-update-toast-seen'

/** Icon size class shared across all upgrade phase icons */
const ICON_SIZE = 'w-4 h-4'

/** Dot indicator size class */
const DOT_SIZE = 'w-2 h-2'

export function UpdateIndicator() {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const { hasUpdate, latestRelease, channel, autoUpdateStatus, latestMainSHA } = useVersionCheck()
  const upgradeState = useUpgradeState()
  const [showModal, setShowModal] = useState(false)
  const updateHint = useFeatureHints('update-available')
  const prevHasUpdate = useRef(false)

  const isUpgrading = upgradeState.phase === 'triggering' || upgradeState.phase === 'restarting'
  const isUpgradeComplete = upgradeState.phase === 'complete'
  const isUpgradeError = upgradeState.phase === 'error'

  useEffect(() => {
    if (hasUpdate && !prevHasUpdate.current) {
      try {
        const sessionSeen = sessionStorage.getItem(UPDATE_TOAST_SESSION_KEY)
        if (!sessionSeen && !isUpdateSnoozed()) {
          const tag = latestRelease?.tag ?? 'update'
          showToast(`Version ${tag} available — click the green icon to see what's new`, 'info')
          sessionStorage.setItem(UPDATE_TOAST_SESSION_KEY, '1')
        }
      } catch {
        // sessionStorage unavailable
      }
    }
    prevHasUpdate.current = hasUpdate
  }, [hasUpdate, latestRelease?.tag, showToast])

  // Show indicator when there's an update available OR an upgrade is in progress/complete/error
  const showIndicator = hasUpdate || isUpgrading || isUpgradeComplete || isUpgradeError
  if (!showIndicator || isDemoMode() || (isUpdateSnoozed() && !isUpgrading && !isUpgradeComplete && !isUpgradeError)) {
    return null
  }

  const isDeveloperUpdate = channel === 'developer' && hasUpdate
  const devSHA = autoUpdateStatus?.latestSHA ?? latestMainSHA

  if (!isDeveloperUpdate && !latestRelease && !isUpgrading && !isUpgradeComplete && !isUpgradeError) {
    return null
  }

  /** Resolve the button style based on upgrade phase */
  const buttonClassName = cn(
    'flex items-center gap-2 px-2 py-1.5 h-9 rounded-lg transition-colors',
    isUpgradeError && 'bg-red-500/10 text-red-400 hover:bg-red-500/20',
    isUpgradeComplete && 'bg-green-500/10 text-green-400 hover:bg-green-500/20',
    isUpgrading && 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20',
    !isUpgrading && !isUpgradeComplete && !isUpgradeError && 'bg-green-500/10 text-green-400 hover:bg-green-500/20',
  )

  /** Resolve the tooltip title based on upgrade phase */
  const buttonTitle = isUpgradeError
    ? t('update.upgradeFailed', 'Upgrade failed')
    : isUpgradeComplete
      ? t('update.upgradeComplete', 'Upgrade complete — reloading...')
      : isUpgrading
        ? t('update.upgrading', 'Upgrading...')
        : isDeveloperUpdate
          ? `New commit: ${devSHA?.slice(0, 7) ?? 'unknown'}`
          : t('update.availableTag', { tag: latestRelease?.tag ?? '' })

  return (
    <>
      <div className="relative">
        <button
          onClick={() => {
            setShowModal(true)
            updateHint.action()
            emitWhatsNewModalOpened(latestRelease?.tag ?? devSHA?.slice(0, 7) ?? 'unknown')
          }}
          className={buttonClassName}
          title={buttonTitle}
        >
          {isUpgradeError ? (
            <AlertTriangle className={ICON_SIZE} />
          ) : isUpgradeComplete ? (
            <Check className={ICON_SIZE} />
          ) : isUpgrading ? (
            <Loader2 className={cn(ICON_SIZE, 'animate-spin')} />
          ) : (
            <Download className={ICON_SIZE} />
          )}

          {/* Dot indicator: pulsing green for available, spinning cyan for upgrading, none for complete/error */}
          {isUpgrading && (
            <span className={cn(DOT_SIZE, 'bg-cyan-400 rounded-full animate-pulse')} />
          )}
          {!isUpgrading && !isUpgradeComplete && !isUpgradeError && (
            <span className={cn(DOT_SIZE, 'bg-green-400 rounded-full animate-pulse')} />
          )}
        </button>

        {updateHint.isVisible && !showModal && !isUpgrading && !isUpgradeComplete && !isUpgradeError && (
          <FeatureHintTooltip
            message="An update is available — click here to see what's new and how to update"
            onDismiss={updateHint.dismiss}
            placement="bottom-right"
          />
        )}
      </div>

      <WhatsNewModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  )
}
