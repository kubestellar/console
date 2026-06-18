/**
 * FlightPlanBlueprintToolbar — Toolbar controls for FlightPlanBlueprint
 *
 * Extracted from FlightPlanBlueprint.tsx (#18875)
 */

import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Download,
  Tags,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { OVERLAYS, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from './FlightPlanBlueprintConstants'
import type { MissionControlState, OverlayMode } from './types'
import type { LayoutResult } from './BlueprintLayout'

interface ToolbarProps {
  state: MissionControlState
  onOverlayChange: (overlay: OverlayMode) => void
  onDeployModeChange: (mode: 'phased' | 'yolo') => void
  onPhaseChange: (phases: unknown[]) => void
}

export function FlightPlanToolbar({
  state,
  onOverlayChange,
  onDeployModeChange,
  onPhaseChange,
}: ToolbarProps) {
  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-border">
      <div>
        <h2 className="text-lg font-bold">
          Flight Plan{state.title ? `: ${state.title}` : ''}
        </h2>
        <p className="text-xs text-muted-foreground">
          {state.projects.length} projects across{' '}
          {state.assignments.filter((a) => a.projectNames.length > 0).length} clusters
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
              onPhaseChange(state.phases)
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
              onPhaseChange(state.phases)
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
      </div>
    </div>
  )
}

interface ControlsProps {
  zoom: number
  setZoom: (fn: (z: number) => number) => void
  infoPanelCollapsed: boolean
  setInfoPanelCollapsed: (fn: (c: boolean) => boolean) => void
  animationsEnabled: boolean
  setAnimationsEnabled: (fn: (a: boolean) => boolean) => void
  labelsVisible: boolean
  setLabelsVisible: (fn: (v: boolean) => boolean) => void
  onExport: () => void
}

export function FlightPlanControls({
  zoom,
  setZoom,
  infoPanelCollapsed,
  setInfoPanelCollapsed,
  animationsEnabled,
  setAnimationsEnabled,
  labelsVisible,
  setLabelsVisible,
  onExport,
}: ControlsProps) {
  return (
    <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
      <button
        onClick={() => setZoom((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX))}
        className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        title="Zoom in"
      >
        <ZoomIn className="w-4 h-4" />
      </button>
      <button
        onClick={() => setZoom((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN))}
        className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        title="Zoom out"
      >
        <ZoomOut className="w-4 h-4" />
      </button>
      <button
        onClick={() => setZoom(1)}
        className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        title="Reset zoom"
      >
        <Maximize2 className="w-4 h-4" />
      </button>
      <button
        onClick={() => setInfoPanelCollapsed((c) => !c)}
        className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors ml-1"
        title={infoPanelCollapsed ? 'Show info panel' : 'Hide info panel'}
      >
        {infoPanelCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
      </button>
      <button
        onClick={() => setAnimationsEnabled((a) => !a)}
        className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        title={animationsEnabled ? 'Pause animations' : 'Resume animations'}
      >
        {animationsEnabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
      <button
        onClick={() => setLabelsVisible((v) => !v)}
        className={cn(
          'p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors',
          !labelsVisible && 'opacity-50'
        )}
        title={labelsVisible ? 'Hide line labels' : 'Show line labels'}
      >
        <Tags className="w-4 h-4" />
      </button>
      <button
        onClick={onExport}
        className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        title="Export full report (Print to PDF)"
      >
        <Download className="w-4 h-4" />
      </button>
    </div>
  )
}
