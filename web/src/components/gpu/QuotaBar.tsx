import { Calendar, LayoutDashboard, Server, Settings2, TrendingUp } from 'lucide-react'
import { cn } from '../../lib/cn'
import { StatusBadge } from '../ui/StatusBadge'
import { FilterToolbar } from './FilterToolbar'
import type { ViewTab } from './useGPUReservations'

interface QuotaBarProps {
  activeTab: ViewTab
  filteredReservationsCount: number
  user: { github_login?: string } | null
  showOnlyMine: boolean
  onSetActiveTab: (tab: ViewTab) => void
  onToggleShowOnlyMine: () => void
  onCreateReservation: () => void
  overviewLabel: string
  calendarLabel: string
  reservationsLabel: string
  inventoryLabel: string
  dashboardLabel: string
  myReservationsLabel: string
  createReservationLabel: string
}

const TAB_IDS: readonly ViewTab[] = ['overview', 'calendar', 'quotas', 'inventory', 'dashboard'] as const

export function QuotaBar({
  activeTab,
  filteredReservationsCount,
  user,
  showOnlyMine,
  onSetActiveTab,
  onToggleShowOnlyMine,
  onCreateReservation,
  overviewLabel,
  calendarLabel,
  reservationsLabel,
  inventoryLabel,
  dashboardLabel,
  myReservationsLabel,
  createReservationLabel,
}: QuotaBarProps) {
  return (
    <div
      role="tablist"
      className="flex flex-wrap gap-1 mb-6 border-b border-border"
      onKeyDown={(event) => {
        const idx = TAB_IDS.indexOf(activeTab)
        if (event.key === 'ArrowRight') onSetActiveTab(TAB_IDS[Math.min(idx + 1, TAB_IDS.length - 1)])
        else if (event.key === 'ArrowLeft') onSetActiveTab(TAB_IDS[Math.max(idx - 1, 0)])
      }}
    >
      {[
        { id: 'overview' as const, label: overviewLabel, icon: TrendingUp },
        { id: 'calendar' as const, label: calendarLabel, icon: Calendar },
        { id: 'quotas' as const, label: reservationsLabel, icon: Settings2, count: filteredReservationsCount },
        { id: 'inventory' as const, label: inventoryLabel, icon: Server },
        { id: 'dashboard' as const, label: dashboardLabel, icon: LayoutDashboard },
      ].map((tab) => {
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
                : 'border-transparent text-muted-foreground hover:text-foreground',
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

      <FilterToolbar
        user={user}
        showOnlyMine={showOnlyMine}
        onToggleShowOnlyMine={onToggleShowOnlyMine}
        onCreateReservation={onCreateReservation}
        myReservationsLabel={myReservationsLabel}
        createReservationLabel={createReservationLabel}
      />
    </div>
  )
}
