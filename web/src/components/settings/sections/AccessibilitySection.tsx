import { useTranslation } from 'react-i18next'
import { Eye } from 'lucide-react'

interface AccessibilitySectionProps {
  colorBlindMode: boolean
  setColorBlindMode: (enabled: boolean) => void
  reduceMotion: boolean
  setReduceMotion: (enabled: boolean) => void
  highContrast: boolean
  setHighContrast: (enabled: boolean) => void
}

export function AccessibilitySection({
  colorBlindMode,
  setColorBlindMode,
  reduceMotion,
  setReduceMotion,
  highContrast,
  setHighContrast,
}: AccessibilitySectionProps) {
  const { t } = useTranslation()
  return (
    <div id="accessibility-settings" className="glass rounded-xl p-6 relative z-0">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-secondary">
          <Eye className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-foreground">{t('settings.accessibility.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('settings.accessibility.subtitle')}</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Color Blind Mode */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
          <div>
            <p className="text-sm font-medium text-foreground">{t('settings.accessibility.colorBlindMode')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('settings.accessibility.colorBlindModeDesc')}
            </p>
          </div>
          <button
            onClick={() => setColorBlindMode(!colorBlindMode)}
            role="switch"
            aria-checked={colorBlindMode}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              colorBlindMode ? 'bg-purple-500' : 'bg-secondary'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                colorBlindMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Reduce Motion */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
          <div>
            <p className="text-sm font-medium text-foreground">{t('settings.accessibility.reduceMotion')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('settings.accessibility.reduceMotionDesc')}
            </p>
          </div>
          <button
            onClick={() => setReduceMotion(!reduceMotion)}
            role="switch"
            aria-checked={reduceMotion}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              reduceMotion ? 'bg-purple-500' : 'bg-secondary'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                reduceMotion ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* High Contrast */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
          <div>
            <p className="text-sm font-medium text-foreground">{t('settings.accessibility.highContrast')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('settings.accessibility.highContrastDesc')}
            </p>
          </div>
          <button
            onClick={() => setHighContrast(!highContrast)}
            role="switch"
            aria-checked={highContrast}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              highContrast ? 'bg-purple-500' : 'bg-secondary'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                highContrast ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  )
}
