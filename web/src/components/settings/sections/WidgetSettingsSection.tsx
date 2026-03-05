import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Monitor } from 'lucide-react'
import { WidgetExportModal } from '../../widgets/WidgetExportModal'

export function WidgetSettingsSection() {
  const { t } = useTranslation()
  const [isExportOpen, setIsExportOpen] = useState(false)

  return (
    <div id="widget-settings" className="glass rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-secondary">
          <Monitor className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-foreground">{t('settings.widget.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('settings.widget.subtitle')}</p>
        </div>
      </div>

      <button
        onClick={() => setIsExportOpen(true)}
        className="w-full px-4 py-3 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-sm font-medium text-foreground transition-colors flex items-center justify-center gap-2"
      >
        <Monitor className="w-4 h-4" />
        {t('settings.widget.exportWidget', 'Export Desktop Widget')}
      </button>

      <WidgetExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />
    </div>
  )
}
