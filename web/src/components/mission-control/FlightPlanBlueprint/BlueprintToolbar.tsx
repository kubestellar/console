import { Layout, Zap, HardDrive, Network, Shield, ZoomIn, ZoomOut, Maximize2, PanelRightClose, PanelRightOpen, Pause, Play, Download, Tags } from 'lucide-react'
import { cn } from '../../../lib/cn'
import type { OverlayMode } from '../types'

const OVERLAYS: { key: OverlayMode; icon: React.ReactNode; label: string }[] = [
  { key: 'architecture', icon: <Layout className="w-3.5 h-3.5" />, label: 'Architecture' },
  { key: 'compute', icon: <Zap className="w-3.5 h-3.5" />, label: 'Compute' },
  { key: 'storage', icon: <HardDrive className="w-3.5 h-3.5" />, label: 'Storage' },
  { key: 'network', icon: <Network className="w-3.5 h-3.5" />, label: 'Network' },
  { key: 'security', icon: <Shield className="w-3.5 h-3.5" />, label: 'Security' },
]

interface BlueprintToolbarProps {
  title?: string
  projectCount: number
  clusterCount: number
  overlay: OverlayMode
  deployMode: 'phased' | 'yolo'
  infoPanelCollapsed: boolean
  animationsEnabled: boolean
  labelsVisible: boolean
  onOverlayChange: (overlay: OverlayMode) => void
  onDeployModeChange: (mode: 'phased' | 'yolo') => void
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void
  onToggleInfoPanel: () => void
  onToggleAnimations: () => void
  onToggleLabels: () => void
  onExportReport: () => void
}

export function BlueprintToolbar({
  title,
  projectCount,
  clusterCount,
  overlay,
  deployMode,
  infoPanelCollapsed,
  animationsEnabled,
  labelsVisible,
  onOverlayChange,
  onDeployModeChange,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onToggleInfoPanel,
  onToggleAnimations,
  onToggleLabels,
  onExportReport,
}: BlueprintToolbarProps) {
  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-border">
      <div>
        <h2 className="text-lg font-bold">
          Flight Plan{title ? `: ${title}` : ''}
        </h2>
        <p className="text-xs text-muted-foreground">
          {projectCount} projects across {clusterCount} clusters
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center rounded-lg border border-border overflow-hidden">
          {OVERLAYS.map((item) => (
            <button
              key={item.key}
              onClick={() => onOverlayChange(item.key)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors',
                overlay === item.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              )}
              title={item.label}
            >
              {item.icon}
              <span className="hidden lg:inline">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center rounded-lg overflow-hidden">
          <button
            onClick={() => onDeployModeChange('phased')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-all duration-150 border',
              'rounded-l-lg',
              deployMode === 'phased'
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-inner'
                : 'bg-secondary/30 text-muted-foreground border-border hover:text-foreground hover:bg-secondary/50'
            )}
          >
            phased
          </button>
          <button
            onClick={() => onDeployModeChange('yolo')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-all duration-150 border -ml-px',
              'rounded-r-lg',
              deployMode === 'yolo'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-inner'
                : 'bg-secondary/30 text-muted-foreground border-border hover:text-foreground hover:bg-secondary/50'
            )}
          >
            yolo
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={onZoomIn} className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Zoom in"><ZoomIn className="w-4 h-4" /></button>
          <button onClick={onZoomOut} className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Zoom out"><ZoomOut className="w-4 h-4" /></button>
          <button onClick={onResetZoom} className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Reset zoom"><Maximize2 className="w-4 h-4" /></button>
          <button onClick={onToggleInfoPanel} className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors ml-1" title={infoPanelCollapsed ? 'Show info panel' : 'Hide info panel'}>{infoPanelCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}</button>
          <button onClick={onToggleAnimations} className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title={animationsEnabled ? 'Pause animations' : 'Resume animations'}>{animationsEnabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</button>
          <button onClick={onToggleLabels} className={cn('p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors', !labelsVisible && 'opacity-50')} title={labelsVisible ? 'Hide line labels' : 'Show line labels'}><Tags className="w-4 h-4" /></button>
          <button onClick={onExportReport} className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Export full report (Print to PDF)"><Download className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  )
}
