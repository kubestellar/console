import { useDroppable } from '@dnd-kit/core'
import { LayoutDashboard, Plus, Check } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Dashboard } from '../../hooks/useDashboards'

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
  // Filter out current dashboard (handle null/undefined dashboards)
  const otherDashboards = (dashboards || []).filter((d) => d.id !== currentDashboardId)

  if (!isDragging) return null

  return (
    <div className="fixed right-6 top-24 z-50 animate-fade-in-up">
      <div className="glass rounded-xl border border-border/50 p-4 w-64 shadow-2xl">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium text-white">
          <LayoutDashboard className="w-4 h-4 text-purple-400" />
          Move to Dashboard
        </div>

        {otherDashboards.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-3">
              No other dashboards available
            </p>
            {onCreateDashboard && (
              <button
                onClick={onCreateDashboard}
                className="flex items-center gap-2 mx-auto px-3 py-2 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 text-sm"
              >
                <Plus className="w-4 h-4" />
                Create New Dashboard
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {otherDashboards.map((dashboard) => (
              <DroppableDashboard
                key={dashboard.id}
                dashboard={dashboard}
              />
            ))}

            {onCreateDashboard && (
              <button
                onClick={onCreateDashboard}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-dashed border-border/50 text-muted-foreground hover:text-white hover:border-purple-500/50 text-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create New Dashboard
              </button>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-3 text-center">
          Drop card here to move it
        </p>
      </div>
    </div>
  )
}

interface DroppableDashboardProps {
  dashboard: Dashboard
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
          ? 'bg-purple-500/20 border-purple-500 text-white scale-105'
          : 'bg-secondary/30 border-border/50 text-muted-foreground hover:text-white hover:border-border'
      )}
    >
      <LayoutDashboard className={cn('w-4 h-4', isOver && 'text-purple-400')} />
      <span className="flex-1 text-sm truncate">{dashboard.name}</span>
      {isOver && <Check className="w-4 h-4 text-green-400" />}
    </div>
  )
}
