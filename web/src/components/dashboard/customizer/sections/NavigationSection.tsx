/**
 * NavigationSection — sidebar navigation customizer within Dashboard Studio.
 *
 * Opens the SidebarCustomizer modal from within the customizer.
 * The SidebarCustomizer renders its own BaseModal, keeping its full
 * functionality intact (DnD, route catalog, dashboard management).
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PanelLeft } from 'lucide-react'
import { SidebarCustomizer } from '../../../layout/SidebarCustomizer'

interface NavigationSectionProps {
  onClose: () => void
}

export function NavigationSection({ onClose: _onClose }: NavigationSectionProps) {
  const { t } = useTranslation()
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false)

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-md mx-auto text-center space-y-4 mt-12">
        <PanelLeft className="w-10 h-10 text-muted-foreground/40 mx-auto" />
        <h3 className="text-lg font-medium text-foreground">
          {t('sidebar.customizer.title', 'Customize Sidebar')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('sidebar.customizer.description', 'Add, remove, and reorder dashboards in your sidebar navigation.')}
        </p>
        <button
          onClick={() => setIsCustomizerOpen(true)}
          className="px-4 py-2 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg text-sm font-medium transition-colors"
        >
          {t('sidebar.customizer.openCustomizer', 'Open Sidebar Customizer')}
        </button>
      </div>

      <SidebarCustomizer
        isOpen={isCustomizerOpen}
        onClose={() => setIsCustomizerOpen(false)}
      />
    </div>
  )
}
