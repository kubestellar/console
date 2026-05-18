import { ExternalLink, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { safeSetItem } from '../../lib/utils/localStorage'
import { STORAGE_KEY_AUTONOMOUS_BANNER_DISMISSED } from '../../lib/constants/storage'

const HIVE_DASHBOARD_URL = 'https://kubestellar.io/live/hive'

export function AutonomousBanner({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-center gap-2 md:gap-3 py-1.5 px-3 md:px-4">
      <span className="text-sm" aria-hidden="true">🐝</span>
      <span className="text-sm text-purple-300 font-medium">{t('layout.autonomousBannerMessage')}</span>
      <a
        href={HIVE_DASHBOARD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="hidden sm:inline-flex items-center gap-1 text-xs px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded transition-colors whitespace-nowrap"
      >
        {t('layout.watchLive')}
        <ExternalLink className="w-3 h-3" aria-hidden="true" />
      </a>
      <a
        href={HIVE_DASHBOARD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="sm:hidden text-xs text-purple-300 underline underline-offset-2 whitespace-nowrap"
      >
        {t('layout.watchLiveMobile')}
      </a>
      <button
        onClick={() => {
          onDismiss()
          safeSetItem(STORAGE_KEY_AUTONOMOUS_BANNER_DISMISSED, 'true')
        }}
        className="ml-1 md:ml-2 p-2 min-h-11 min-w-11 flex items-center justify-center hover:bg-purple-500/20 rounded-full transition-colors"
        aria-label={t('buttons.dismissBanner')}
        title={t('buttons.dismissBanner')}
      >
        <X className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" />
      </button>
    </div>
  )
}
