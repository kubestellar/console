import { useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import type { TabType } from '../UserManagement.types'
import { USER_MANAGEMENT_TABS } from '../UserManagement.utils'

export function UserManagementTabs({ activeTab, setActiveTab }: {
  activeTab: TabType
  setActiveTab: (tab: TabType) => void
}) {
  const { t } = useTranslation(['cards', 'common'])
  const tabRefs = useRef<Record<TabType, HTMLButtonElement | null>>({ clusterUsers: null, serviceAccounts: null, console: null })
  const focusTab = (tab: TabType) => {
    setActiveTab(tab)
    tabRefs.current[tab]?.focus()
  }

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, tab: TabType) => {
    const currentIndex = USER_MANAGEMENT_TABS.indexOf(tab)
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusTab(USER_MANAGEMENT_TABS[(currentIndex + 1) % USER_MANAGEMENT_TABS.length])
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusTab(USER_MANAGEMENT_TABS[(currentIndex - 1 + USER_MANAGEMENT_TABS.length) % USER_MANAGEMENT_TABS.length])
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusTab(USER_MANAGEMENT_TABS[0])
    } else if (event.key === 'End') {
      event.preventDefault()
      focusTab(USER_MANAGEMENT_TABS[USER_MANAGEMENT_TABS.length - 1])
    }
  }

  return (
    <div className="flex items-center gap-1 mb-3 shrink-0" role="tablist" aria-label={t('userManagement.consoleUsers')}>
      <button
        ref={node => { tabRefs.current.clusterUsers = node }}
        id="user-management-tab-clusterUsers"
        role="tab"
        aria-selected={activeTab === 'clusterUsers'}
        aria-controls="user-management-panel-clusterUsers"
        tabIndex={activeTab === 'clusterUsers' ? 0 : -1}
        onClick={() => setActiveTab('clusterUsers')}
        onKeyDown={(event) => handleTabKeyDown(event, 'clusterUsers')}
        className={cn(
          'px-2 py-1 rounded text-xs font-medium transition-colors',
          activeTab === 'clusterUsers'
            ? 'bg-purple-500/20 text-purple-400'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {t('userManagement.clusterUsers')}
      </button>
      <button
        ref={node => { tabRefs.current.serviceAccounts = node }}
        id="user-management-tab-serviceAccounts"
        role="tab"
        aria-selected={activeTab === 'serviceAccounts'}
        aria-controls="user-management-panel-serviceAccounts"
        tabIndex={activeTab === 'serviceAccounts' ? 0 : -1}
        onClick={() => setActiveTab('serviceAccounts')}
        onKeyDown={(event) => handleTabKeyDown(event, 'serviceAccounts')}
        className={cn(
          'px-2 py-1 rounded text-xs font-medium transition-colors',
          activeTab === 'serviceAccounts'
            ? 'bg-purple-500/20 text-purple-400'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {t('userManagement.serviceAccounts')}
      </button>
      <button
        ref={node => { tabRefs.current.console = node }}
        id="user-management-tab-console"
        role="tab"
        aria-selected={activeTab === 'console'}
        aria-controls="user-management-panel-console"
        tabIndex={activeTab === 'console' ? 0 : -1}
        onClick={() => setActiveTab('console')}
        onKeyDown={(event) => handleTabKeyDown(event, 'console')}
        className={cn(
          'px-2 py-1 rounded text-xs font-medium transition-colors',
          activeTab === 'console'
            ? 'bg-purple-500/20 text-purple-400'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {t('userManagement.consoleUsers')}
      </button>
    </div>
  )
}
