import { useTranslation } from 'react-i18next'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  EXPORT_PANEL_IDS,
  EXPORT_TAB_IDS,
  type ExportTab
} from './widgetExportConstants'

interface WidgetExportTabsProps {
  activeTab: ExportTab
  onSelectTab: (tab: ExportTab) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
}

export function WidgetExportTabs({
  activeTab,
  onSelectTab,
  onKeyDown
}: WidgetExportTabsProps) {
  const { t } = useTranslation('common')
  const tabs: ReadonlyArray<{ tab: ExportTab; label: string }> = [
    { tab: 'templates', label: t('widgets.templates') },
    { tab: 'card', label: t('widgets.singleCard') },
    { tab: 'stats', label: t('widgets.statBlocks') }
  ]

  return (
    <div
      className="flex border-b border-border mb-4 shrink-0"
      role="tablist"
      aria-label={t('widgets.exportDesktopWidget')}
      onKeyDown={onKeyDown}
    >
      {tabs.map(({ tab, label }) => (
        <button
          key={tab}
          onClick={() => onSelectTab(tab)}
          id={EXPORT_TAB_IDS[tab]}
          data-tab={tab}
          role="tab"
          tabIndex={activeTab === tab ? 0 : -1}
          aria-selected={activeTab === tab}
          aria-controls={EXPORT_PANEL_IDS[tab]}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === tab
              ? 'text-primary border-primary'
              : 'text-muted-foreground border-transparent hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
