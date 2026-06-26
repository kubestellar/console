import { useDroppable } from '@dnd-kit/core'
import { useTranslation } from 'react-i18next'
import { LayoutDashboard, Plus, Check } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Dashboard } from '../../hooks/useDashboards'
import { DashboardHealthIndicator } from './DashboardHealthIndicator'

interface DashboardDropZoneProps {
  dashboards: Dashboard[]
  currentDashboardId: string | undefined
  isDragging: boolean
  onCreateDashboard?: () => void
}

export function DashboardDropZone({
  dashboards,
  currentDashboardId,
  isDragging,
  onCreateDashboard,
}: DashboardDropZoneProps) {
  const { t } = useTranslation()
  // Filter out current dashboard (handle null/undefined dashboards)
  const otherDashboards = (dashboards || []).filter((d) => d.id !== currentDashboardId)

  if (!isDragging) return null

  return (
    <div className="fixed right-6 top-24 z-dropdown animate-fade-in-up">
      <div className="glass rounded-xl border border-border/50 p-4 w-64 shadow-2xl">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium text-foreground">
          <LayoutDashboard className="w-4 h-4 text-purple-400" />
          {t('dashboard.dropZone.moveToDashboard')}
          <DashboardHealthIndicator size="sm" className="ml-auto" />
        </div>

        {otherDashboards.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-3">
              {t('dashboard.dropZone.noOtherDashboards')}
            </p>
            <DroppableCreateDashboard onClick={onCreateDashboard} />
          </div>
        ) : (
          <div className="space-y-2">
            {otherDashboards.map((dashboard) => (
              <DroppableDashboard
                key={dashboard.id}
                dashboard={dashboard}
              />
            ))}
            <DroppableCreateDashboard onClick={onCreateDashboard} />
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-3 text-center">
          {t('dashboard.dropZone.dropCardHere')}
        </p>
      </div>
    </div>
  )
}

interface DroppableDashboardProps {
  dashboard: Dashboard
}

/** Droppable "Create New Dashboard" target — cards can be dropped here to create + move */
function DroppableCreateDashboard({ onClick }: { onClick?: () => void }) {
  const { t } = useTranslation()
  const { isOver, setNodeRef } = useDroppable({
    id: 'create-new-dashboard',
    data: { type: 'create-new-dashboard' },
  })

  if (!onClick && !isOver) return null

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-dashed text-sm transition-all cursor-pointer',
        isOver
          ? 'bg-green-500/20 border-green-500 text-green-400 scale-105'
          : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-purple-500/50'
      )}
    >
      <Plus className={cn('w-4 h-4', isOver && 'text-green-400')} />
      {t('dashboard.dropZone.createNewDashboard')}
      {isOver && <Check className="w-4 h-4 text-green-400 ml-auto" />}
    </div>
  )
}

function DroppableDashboard({ dashboard }: DroppableDashboardProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `dashboard-drop-${dashboard.id}`,
    data: {
      type: 'dashboard',
      dashboardId: dashboard.id,
      dashboardName: dashboard.name,
    },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center gap-3 px-3 py-3 rounded-lg border transition-all cursor-pointer',
        isOver
          ? 'bg-purple-500/20 border-purple-500 text-foreground scale-105'
          : 'bg-secondary/30 border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
      )}
    >
      <LayoutDashboard className={cn('w-4 h-4', isOver && 'text-purple-400')} />
      <span className="flex-1 text-sm truncate">{dashboard.name}</span>
      {isOver && <Check className="w-4 h-4 text-green-400" />}
    </div>
  )
}
