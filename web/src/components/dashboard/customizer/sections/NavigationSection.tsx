/**
 * NavigationSection — dashboard management within Dashboard Studio.
 *
 * Renders the SidebarCustomizer content inline (embedded mode) so users
 * can manage their dashboard list without opening a separate dialog.
 */
import { SidebarCustomizer } from '../../../layout/SidebarCustomizer'

interface NavigationSectionProps {
  onClose: () => void
}

export function NavigationSection({ onClose }: NavigationSectionProps) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <SidebarCustomizer isOpen={true} onClose={onClose} embedded />
    </div>
  )
}
