/**
 * NavigationSection — dashboard management within Dashboard Studio.
 *
 * Renders the SidebarCustomizer content inline (embedded mode) so users
 * can manage their dashboard list without opening a separate dialog.
 */
import { SidebarCustomizer } from '../../../layout/SidebarCustomizer'

interface NavigationSectionProps {
  onClose: () => void
  /** Name of the dashboard currently being customized */
  dashboardName?: string
}

export function NavigationSection({ onClose, dashboardName }: NavigationSectionProps) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {dashboardName && (
        <div className="px-4 pt-3 pb-0">
          <p className="text-xs text-muted-foreground">
            Currently editing: <span className="text-foreground font-medium">{dashboardName}</span>
          </p>
        </div>
      )}
      <SidebarCustomizer isOpen={true} onClose={onClose} embedded />
    </div>
  )
}
