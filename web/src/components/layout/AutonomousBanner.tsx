import { ExternalLink, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { safeSetItem } from '../../lib/utils/localStorage'
import { STORAGE_KEY_AUTONOMOUS_BANNER_DISMISSED } from '../../lib/constants/storage'

const HIVE_DASHBOARD_URL = 'https://kubestellar.io/live/hive'

export function AutonomousBanner({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-2 py-1.5 px-3 md:px-4">
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <span className="shrink-0 text-sm" aria-hidden="true">🐝</span>
        <span className="min-w-0 truncate text-sm font-medium text-purple-300">
          {t('layout.autonomousBannerMessage')}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1 md:gap-2">
        <a
          href={HIVE_DASHBOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:inline-flex items-center gap-1 rounded bg-purple-500/20 px-2 py-1 text-xs text-purple-300 transition-colors whitespace-nowrap hover:bg-purple-500/30"
        >
          {t('layout.watchLive')}
          <ExternalLink className="w-3 h-3" aria-hidden="true" />
        </a>
        <a
          href={HIVE_DASHBOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-purple-300 underline underline-offset-2 whitespace-nowrap sm:hidden"
        >
          {t('layout.watchLiveMobile')}
        </a>
        <button
          onClick={() => {
            onDismiss()
            safeSetItem(STORAGE_KEY_AUTONOMOUS_BANNER_DISMISSED, 'true')
          }}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full p-2 transition-colors hover:bg-purple-500/20"
          aria-label={t('buttons.dismissBanner')}
          title={t('buttons.dismissBanner')}
        >
          <X className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
