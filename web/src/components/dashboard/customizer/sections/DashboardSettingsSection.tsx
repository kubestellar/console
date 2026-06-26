/**
 * DashboardSettingsSection — export, import, and reset controls.
 *
 * Consolidates actions that were previously scattered across the FAB menu.
 */
import { useTranslation } from 'react-i18next'
import { Download, RotateCcw, Heart } from 'lucide-react'
import { DashboardHealthIndicator } from '../../DashboardHealthIndicator'

interface DashboardSettingsSectionProps {
  onExport?: () => void
  onReset?: () => void
  isCustomized?: boolean
}

export function DashboardSettingsSection({
  onExport,
  onReset,
  isCustomized = false,
}: DashboardSettingsSectionProps) {
  const { t } = useTranslation()

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      {/* Health */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <Heart className="w-4 h-4 text-muted-foreground" />
          {t('dashboard.studio.sections.health', 'Dashboard Health')}
        </h3>
        <div className="rounded-lg border border-border p-3 bg-secondary/20">
          <DashboardHealthIndicator />
        </div>
      </div>

      {/* Export */}
      {onExport && (
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <Download className="w-4 h-4 text-muted-foreground" />
            {t('dashboard.studio.sections.export', 'Export & Import')}
          </h3>
          <button
            onClick={onExport}
            className="px-4 py-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors text-sm flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {t('dashboard.export', 'Export dashboard as JSON')}
          </button>
        </div>
      )}

      {/* Reset */}
      {onReset && isCustomized && (
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-muted-foreground" />
            {t('dashboard.studio.sections.reset', 'Reset Options')}
          </h3>
          <button
            onClick={onReset}
            className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-sm flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            {t('dashboard.resetToDefaults', 'Reset to defaults')}
          </button>
          <p className="text-xs text-muted-foreground mt-2">
            {t('dashboard.resetDescription', 'This will restore the default card layout for this dashboard.')}
          </p>
        </div>
      )}
    </div>
  )
}
