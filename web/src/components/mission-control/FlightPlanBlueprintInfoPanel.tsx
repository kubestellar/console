import { AnimatePresence, motion } from 'framer-motion'
import { Info } from 'lucide-react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { cn } from '../../lib/cn'
import {
  ClusterInfoPanel,
  DeployModeInfoPanel,
  ProjectInfoPanel,
} from './BlueprintInfoPanels'
import type { InfoPanelData } from './FlightPlanBlueprintConstants'
import type {
  DependencyEdge,
  MissionControlState,
  PayloadProject,
} from './types'

interface FlightPlanBlueprintInfoPanelProps {
  infoPanelCollapsed: boolean
  infoPanelWidth: number
  visiblePanel: InfoPanelData | null
  dependencyEdges?: DependencyEdge[]
  phases: MissionControlState['phases']
  projects: PayloadProject[]
  installedProjects: Set<string>
  onInfoPanelEnter: () => void
  onInfoPanelLeave: () => void
  onResizeStart: (event: ReactMouseEvent) => void
  onShowProject: (project: PayloadProject) => void
}

export function FlightPlanBlueprintInfoPanel({
  infoPanelCollapsed,
  infoPanelWidth,
  visiblePanel,
  dependencyEdges,
  phases,
  projects,
  installedProjects,
  onInfoPanelEnter,
  onInfoPanelLeave,
  onResizeStart,
  onShowProject,
}: FlightPlanBlueprintInfoPanelProps) {
  return (
    <div
      className={cn(
        'relative border-l border-border bg-card flex flex-col overflow-y-auto shrink-0 transition-[width] duration-200',
        infoPanelCollapsed && 'w-0 border-l-0 overflow-hidden',
      )}
      style={infoPanelCollapsed ? { width: 0 } : { width: infoPanelWidth }}
      onMouseEnter={onInfoPanelEnter}
      onMouseLeave={onInfoPanelLeave}
    >
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
              <ProjectInfoPanel info={visiblePanel.info} edges={dependencyEdges} />
            ) : visiblePanel.kind === 'cluster' ? (
              <ClusterInfoPanel info={visiblePanel.info} />
            ) : (
              <DeployModeInfoPanel
                mode={visiblePanel.mode}
                phases={phases}
                projects={projects}
                onShowProject={onShowProject}
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
