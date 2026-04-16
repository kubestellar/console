import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { useVersionCheck } from '../../../hooks/useVersionCheck'
import { useFeatureHints } from '../../../hooks/useFeatureHints'
import { FeatureHintTooltip } from '../../ui/FeatureHintTooltip'
import { WhatsNewModal, isUpdateSnoozed } from '../../updates/WhatsNewModal'
import { isDemoMode } from '../../../lib/demoMode'
import { useToast } from '../../ui/Toast'
import { emitWhatsNewModalOpened } from '../../../lib/analytics'

const UPDATE_TOAST_SESSION_KEY = 'kc-update-toast-seen'

export function UpdateIndicator() {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const { hasUpdate, latestRelease, channel, autoUpdateStatus, latestMainSHA } = useVersionCheck()
  const [showModal, setShowModal] = useState(false)
  const updateHint = useFeatureHints('update-available')
  const prevHasUpdate = useRef(false)

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

  if (!hasUpdate || isDemoMode() || isUpdateSnoozed()) {
    return null
  }

  const isDeveloperUpdate = channel === 'developer' && hasUpdate
  const devSHA = autoUpdateStatus?.latestSHA ?? latestMainSHA

  if (!isDeveloperUpdate && !latestRelease) {
    return null
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={() => {
            setShowModal(true)
            updateHint.action()
            emitWhatsNewModalOpened(latestRelease?.tag ?? devSHA?.slice(0, 7) ?? 'unknown')
          }}
          className="flex items-center gap-2 px-2 py-1.5 h-9 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
          title={isDeveloperUpdate
            ? `New commit: ${devSHA?.slice(0, 7) ?? 'unknown'}`
            : t('update.availableTag', { tag: latestRelease?.tag ?? '' })}
        >
          <Download className="w-4 h-4" />
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        </button>

        {updateHint.isVisible && !showModal && (
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
