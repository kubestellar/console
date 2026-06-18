import { cn } from '../../lib/cn'
import { OVERLAYS } from './FlightPlanBlueprintConstants'
import type { MissionControlState } from './types'

interface FlightPlanBlueprintToolbarProps {
  state: MissionControlState
  healthyClusterCount: number
  onOverlayChange: (overlay: MissionControlState['overlay']) => void
  onSelectDeployMode: (mode: MissionControlState['deployMode']) => void
}

export function FlightPlanBlueprintToolbar({
  state,
  healthyClusterCount,
  onOverlayChange,
  onSelectDeployMode,
}: FlightPlanBlueprintToolbarProps) {
  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-border">
      <div>
        <h2 className="text-lg font-bold">
          Flight Plan{state.title ? `: ${state.title}` : ''}
        </h2>
        <p className="text-xs text-muted-foreground">
          {state.projects.length} projects across {healthyClusterCount} clusters
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center rounded-lg border border-border overflow-hidden">
          {OVERLAYS.map((overlay) => {
            const Icon = overlay.icon
            return (
              <button
                key={overlay.key}
                onClick={() => onOverlayChange(overlay.key)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors',
                  state.overlay === overlay.key
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
                )}
                title={overlay.label}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">{overlay.label}</span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center rounded-lg overflow-hidden">
          <button
            onClick={() => onSelectDeployMode('phased')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-all duration-150 border rounded-l-lg',
              state.deployMode === 'phased'
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-inner'
                : 'bg-secondary/30 text-muted-foreground border-border hover:text-foreground hover:bg-secondary/50',
            )}
          >
            phased
          </button>
          <button
            onClick={() => onSelectDeployMode('yolo')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-all duration-150 border -ml-px rounded-r-lg',
              state.deployMode === 'yolo'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-inner'
                : 'bg-secondary/30 text-muted-foreground border-border hover:text-foreground hover:bg-secondary/50',
            )}
          >
            yolo
          </button>
        </div>

        <div />
      </div>
    </div>
  )
}
