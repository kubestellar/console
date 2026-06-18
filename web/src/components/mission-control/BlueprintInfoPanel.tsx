import { type MouseEvent as ReactMouseEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Info } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { MissionControlState, BlueprintLayout, InfoPanelData } from './types'
import type { PayloadProject } from './types'
import {
  ProjectInfoPanel,
  ClusterInfoPanel,
  DeployModeInfoPanel } from './BlueprintInfoPanels'

/** Minimum info-panel width (px) */
const INFO_PANEL_MIN = 280
/** Maximum info-panel width (px) */
const INFO_PANEL_MAX = 600

interface BlueprintInfoPanelProps {
  visiblePanel: InfoPanelData | null
  infoPanelWidth: number
  infoPanelCollapsed: boolean
  onResizeStart: (e: ReactMouseEvent) => void
  onPanelEnter: () => void
  onPanelLeave: () => void
  layout: BlueprintLayout | null
  state: MissionControlState
  installedProjects: Set<string>
  onShowProject: (proj: PayloadProject) => void
}

export function BlueprintInfoPanel({
  visiblePanel,
  infoPanelWidth,
  infoPanelCollapsed,
  onResizeStart,
  onPanelEnter,
  onPanelLeave,
  layout,
  state,
  installedProjects,
  onShowProject,
}: BlueprintInfoPanelProps) {
  return (
    <div
      className={cn(
        'relative border-l border-border bg-card flex flex-col overflow-y-auto shrink-0 transition-[width] duration-200',
        infoPanelCollapsed && 'w-0 border-l-0 overflow-hidden'
      )}
      style={infoPanelCollapsed ? { width: 0 } : { width: infoPanelWidth }}
      onMouseEnter={onPanelEnter}
      onMouseLeave={onPanelLeave}
    >
      {/* Resize drag handle */}
      <div
        className="absolute top-0 left-0 w-[3px] h-full cursor-col-resize z-10 hover:bg-primary/40 active:bg-primary/60 transition-colors"
        onMouseDown={onResizeStart}
      />
      <AnimatePresence mode="wait">
        {visiblePanel ? (
          <motion.div
            key={visiblePanel.kind === 'deployMode' ? `dm-${visiblePanel.mode}` : `${visiblePanel.kind}-${visiblePanel.info.name}`}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.12 }}
            className="p-4 space-y-4 flex-1 flex flex-col min-h-0"
          >
            {visiblePanel.kind === 'project' ? (
              <ProjectInfoPanel info={visiblePanel.info} edges={layout?.dependencyEdges} />
            ) : visiblePanel.kind === 'cluster' ? (
              <ClusterInfoPanel info={visiblePanel.info} />
            ) : (
              <DeployModeInfoPanel
                mode={visiblePanel.mode}
                phases={state.phases}
                projects={state.projects}
                onShowProject={(proj) => onShowProject(proj)}
                installedProjects={installedProjects}
              />
            )}
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6"
          >
            <Info className="w-8 h-8 mb-3 opacity-30" />
            <p className="text-sm text-center">Hover a project or cluster for details</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export { INFO_PANEL_MIN, INFO_PANEL_MAX }
