import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart3 } from 'lucide-react'
import { isAnalyticsOptedOut, setAnalyticsOptOut } from '../../../lib/analytics'

export function AnalyticsSection() {
  const { t } = useTranslation()
  const [optedOut, setOptedOut] = useState(isAnalyticsOptedOut())

  const handleToggle = () => {
    const newValue = !optedOut
    setOptedOut(newValue)
    setAnalyticsOptOut(newValue)
  }

  return (
    <div id="analytics-settings" className="glass rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-secondary">
          <BarChart3 className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-foreground">
            {t('settings.analytics.title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('settings.analytics.subtitle')}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
        <div className="mr-4">
          <p className="text-sm font-medium text-foreground">
            {t('settings.analytics.collectData')}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('settings.analytics.privacyNote')}
          </p>
        </div>
        <button
          onClick={handleToggle}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${
            !optedOut ? 'bg-green-500' : 'bg-secondary'
          }`}
          role="switch"
          aria-checked={!optedOut}
          aria-label={t('settings.analytics.collectData')}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              !optedOut ? 'translate-x-5' : ''
            }`}
          />
        </button>
      </div>
    </div>
  )
}
