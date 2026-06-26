/**
 * NavigationSection — dashboard management within Dashboard Studio.
 *
 * Renders the SidebarCustomizer content inline (embedded mode) so users
 * can manage their dashboard list without opening a separate dialog.
 */
import { useTranslation } from 'react-i18next'
import { SidebarCustomizer } from '../../../layout/SidebarCustomizer'
import { CompactErrorBoundary } from '../../../CompactErrorBoundary'

interface NavigationSectionProps {
  onClose: () => void
  /** Name of the dashboard currently being customized */
  dashboardName?: string
}

export function NavigationSection({ onClose, dashboardName }: NavigationSectionProps) {
  const { t } = useTranslation()

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {dashboardName && (
        <div className="px-4 pt-3 pb-0">
          <p className="text-xs text-muted-foreground">
            Currently editing: <span className="text-foreground font-medium">{dashboardName}</span>
          </p>
        </div>
      )}
      <CompactErrorBoundary
        context="dashboard-studio-sidebar-customizer"
        fallback={(
          <div className="m-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {t('sidebar.customizer.unavailable', 'Navigation customization is temporarily unavailable.')}
          </div>
        )}
      >
        <SidebarCustomizer isOpen={true} onClose={onClose} embedded />
      </CompactErrorBoundary>
    </div>
  )
}
