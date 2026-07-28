import { Calendar, Settings2, TrendingUp, Server, LayoutDashboard } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { StatusBadge } from '../ui/StatusBadge'

type ViewTab = 'overview' | 'calendar' | 'quotas' | 'inventory' | 'dashboard'

interface TabNavigationProps {
  activeTab: ViewTab
  onSetActiveTab: (tab: ViewTab) => void
  filteredReservationsCount: number
}

export function TabNavigation({
  activeTab,
  onSetActiveTab,
  filteredReservationsCount,
}: TabNavigationProps) {
  const { t } = useTranslation(['cards', 'common'])

  const tabs = [
    { id: 'overview' as const, label: t('gpuReservations.tabs.overview'), icon: TrendingUp },
    { id: 'calendar' as const, label: t('gpuReservations.tabs.calendar'), icon: Calendar },
    { id: 'quotas' as const, label: t('gpuReservations.tabs.reservations'), icon: Settings2, count: filteredReservationsCount },
    { id: 'inventory' as const, label: t('gpuReservations.tabs.inventory'), icon: Server },
    { id: 'dashboard' as const, label: t('gpuReservations.tabs.dashboard'), icon: LayoutDashboard },
  ]

  return (
    <div
      role="tablist"
      className="flex flex-wrap gap-1 border-b border-border"
      onKeyDown={(e) => {
        const ids = ['overview', 'calendar', 'quotas', 'inventory', 'dashboard'] as const
        const idx = ids.indexOf(activeTab)
        if (e.key === 'ArrowRight') onSetActiveTab(ids[Math.min(idx + 1, ids.length - 1)])
        else if (e.key === 'ArrowLeft') onSetActiveTab(ids[Math.max(idx - 1, 0)])
      }}
    >
      {tabs.map(tab => {
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => onSetActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 mb-[-2px] transition-colors',
              activeTab === tab.id
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <StatusBadge color="purple" rounded="full">
                {tab.count}
              </StatusBadge>
            )}
          </button>
        )
      })}
    </div>
  )
}
