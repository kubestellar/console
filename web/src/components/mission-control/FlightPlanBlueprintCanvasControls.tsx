import { Download, Maximize2, PanelRightClose, PanelRightOpen, Pause, Play, Tags, ZoomIn, ZoomOut } from 'lucide-react'
import type { SetStateAction } from 'react'
import { cn } from '../../lib/cn'
import {
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from './FlightPlanBlueprintConstants'

interface FlightPlanBlueprintCanvasControlsProps {
  zoom: number
  setZoom: (value: SetStateAction<number>) => void
  infoPanelCollapsed: boolean
  setInfoPanelCollapsed: (value: SetStateAction<boolean>) => void
  animationsEnabled: boolean
  setAnimationsEnabled: (value: SetStateAction<boolean>) => void
  labelsVisible: boolean
  setLabelsVisible: (value: SetStateAction<boolean>) => void
  onExport: () => void
}

export function FlightPlanBlueprintCanvasControls({
  zoom,
  setZoom,
  infoPanelCollapsed,
  setInfoPanelCollapsed,
  animationsEnabled,
  setAnimationsEnabled,
  labelsVisible,
  setLabelsVisible,
  onExport,
}: FlightPlanBlueprintCanvasControlsProps) {
  return (
    <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
      <button
        onClick={() => setZoom(current => Math.min(current + ZOOM_STEP, ZOOM_MAX))}
        className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        title="Zoom in"
      >
        <ZoomIn className="w-4 h-4" />
      </button>
      <button
        onClick={() => setZoom(current => Math.max(current - ZOOM_STEP, ZOOM_MIN))}
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
        onClick={() => setInfoPanelCollapsed(current => !current)}
        className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors ml-1"
        title={infoPanelCollapsed ? 'Show info panel' : 'Hide info panel'}
      >
        {infoPanelCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
      </button>
      <button
        onClick={() => setAnimationsEnabled(current => !current)}
        className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        title={animationsEnabled ? 'Pause animations' : 'Resume animations'}
      >
        {animationsEnabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
      <button
        onClick={() => setLabelsVisible(current => !current)}
        className={cn(
          'p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors',
          !labelsVisible && 'opacity-50',
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
