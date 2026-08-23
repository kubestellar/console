/**
 * FlightPlanToolbar — header row of the blueprint: title, overlay toggles and
 * the phased/yolo deploy-mode switch.
 */

import type { ReactNode } from 'react'
import {
  Zap,
  Network,
  Shield,
  Layout,
  HardDrive } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { MissionControlState, OverlayMode } from './types'
import type { InfoPanelData } from './FlightPlanBlueprint.types'

const OVERLAYS: { key: OverlayMode; icon: ReactNode; label: string }[] = [
  { key: 'architecture', icon: <Layout className="w-3.5 h-3.5" />, label: 'Architecture' },
  { key: 'compute', icon: <Zap className="w-3.5 h-3.5" />, label: 'Compute' },
  { key: 'storage', icon: <HardDrive className="w-3.5 h-3.5" />, label: 'Storage' },
  { key: 'network', icon: <Network className="w-3.5 h-3.5" />, label: 'Network' },
  { key: 'security', icon: <Shield className="w-3.5 h-3.5" />, label: 'Security' },
]

interface FlightPlanToolbarProps {
  state: MissionControlState
  clusterCount: number
  onOverlayChange: (overlay: OverlayMode) => void
  onDeployModeChange: (mode: 'phased' | 'yolo') => void
  onStickyPanelChange: (data: InfoPanelData) => void
}

export function FlightPlanToolbar({
  state,
  clusterCount,
  onOverlayChange,
  onDeployModeChange,
  onStickyPanelChange }: FlightPlanToolbarProps) {
  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-border">
      <div>
        <h2 className="text-lg font-bold">
          Flight Plan{state.title ? `: ${state.title}` : ''}
        </h2>
        <p className="text-xs text-muted-foreground">
          {state.projects.length} projects across{' '}
          {clusterCount} clusters
        </p>
      </div>

      <div className="flex items-center gap-3">
        {/* Overlay toggles */}
        <div className="hidden md:flex items-center rounded-lg border border-border overflow-hidden">
          {OVERLAYS.map((o) => (
            <button
              key={o.key}
              onClick={() => onOverlayChange(o.key)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors',
                state.overlay === o.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              )}
              title={o.label}
            >
              {o.icon}
              <span className="hidden lg:inline">{o.label}</span>
            </button>
          ))}
        </div>

        {/* Deploy mode toggle */}
        <div className="flex items-center rounded-lg overflow-hidden">
          <button
            onClick={() => {
              onDeployModeChange('phased')
              onStickyPanelChange({ kind: 'deployMode', mode: 'phased', phases: state.phases })
            }}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-all duration-150 border',
              'rounded-l-lg',
              state.deployMode === 'phased'
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-inner'
                : 'bg-secondary/30 text-muted-foreground border-border hover:text-foreground hover:bg-secondary/50'
            )}
          >
            phased
          </button>
          <button
            onClick={() => {
              onDeployModeChange('yolo')
              onStickyPanelChange({ kind: 'deployMode', mode: 'yolo', phases: state.phases })
            }}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-all duration-150 border -ml-px',
              'rounded-r-lg',
              state.deployMode === 'yolo'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-inner'
                : 'bg-secondary/30 text-muted-foreground border-border hover:text-foreground hover:bg-secondary/50'
            )}
          >
            yolo
          </button>
        </div>

        {/* Spacer — action buttons moved to footer */}
        <div />
      </div>
    </div>
  )
}
