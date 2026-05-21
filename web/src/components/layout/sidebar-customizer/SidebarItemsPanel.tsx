import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { SidebarItem } from '../../../hooks/useSidebarConfig'

interface SidebarItemsPanelProps {
  primaryNav: SidebarItem[]
  secondaryNav: SidebarItem[]
  renderItemList: (items: SidebarItem[], target: 'primary' | 'secondary') => ReactNode
}

export function SidebarItemsPanel({ primaryNav, secondaryNav, renderItemList }: SidebarItemsPanelProps) {
  const { t } = useTranslation(['common', 'cards'])

  return (
    <div className="mb-4">
      <h3 className="text-sm font-medium text-foreground mb-2">
        {t('sidebar.customizer.yourDashboards')} ({primaryNav.length + secondaryNav.length})
      </h3>
      {renderItemList(primaryNav, 'primary')}
      {secondaryNav.length > 0 && (
        <>
          <div className="my-2 border-t border-border/30" />
          {renderItemList(secondaryNav, 'secondary')}
        </>
      )}
    </div>
  )
}
