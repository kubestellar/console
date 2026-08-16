import { AnimatePresence, motion } from 'framer-motion'
import { Info } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { ClusterInfoPanel, DeployModeInfoPanel, ProjectInfoPanel } from '../BlueprintInfoPanels'
import type { FlightPlanBlueprintProps, InfoPanelData } from '../FlightPlanBlueprint.types'

interface BlueprintInfoSidebarProps {
  infoPanelCollapsed: boolean
  infoPanelWidth: number
  visiblePanel: InfoPanelData | null
  layout: ReturnType<typeof import('../BlueprintLayout').computeLayout>
  phases: FlightPlanBlueprintProps['state']['phases']
  projects: FlightPlanBlueprintProps['state']['projects']
  installedProjects: Set<string>
  onMouseEnter: () => void
  onMouseLeave: () => void
  onResizeStart: (e: React.MouseEvent) => void
  onShowProject: (project: FlightPlanBlueprintProps['state']['projects'][number]) => void
}

export function BlueprintInfoSidebar({
  infoPanelCollapsed,
  infoPanelWidth,
  visiblePanel,
  layout,
  phases,
  projects,
  installedProjects,
  onMouseEnter,
  onMouseLeave,
  onResizeStart,
  onShowProject,
}: BlueprintInfoSidebarProps) {
  return (
    <div
      className={cn(
        'relative border-l border-border bg-card flex flex-col overflow-y-auto shrink-0 transition-[width] duration-200',
        infoPanelCollapsed && 'w-0 border-l-0 overflow-hidden'
      )}
      style={infoPanelCollapsed ? { width: 0 } : { width: infoPanelWidth }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
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
              <ProjectInfoPanel info={visiblePanel.info} edges={layout.dependencyEdges} />
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
