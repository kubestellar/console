import type { MouseEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Info, Loader2 } from 'lucide-react'

import { ProjectInfoPanel, ClusterInfoPanel, DeployModeInfoPanel } from './BlueprintInfoPanels'
import type { ClusterHoverInfo } from './svg/ClusterZone'
import type { ProjectHoverInfo } from './svg/ProjectNode'
import type {
  MissionControlState,
  BlueprintLayout,
  PayloadProject,
} from './types'
import type { MissionExport } from '../../lib/missions/types'
import { MissionDetailView } from '../missions/MissionDetailView'
import { cn } from '../../lib/cn'

export type InfoPanelData =
  | { kind: 'project'; info: ProjectHoverInfo }
  | { kind: 'cluster'; info: ClusterHoverInfo }
  | { kind: 'deployMode'; mode: 'phased' | 'yolo'; phases: MissionControlState['phases'] }

interface FlightPlanPanelsProps {
  visiblePanel: InfoPanelData | null
  layout: BlueprintLayout
  state: MissionControlState
  infoPanelCollapsed: boolean
  infoPanelWidth: number
  installedProjects: Set<string>
  onInfoPanelEnter: () => void
  onInfoPanelLeave: () => void
  onResizeStart: (e: MouseEvent) => void
  onShowProject: (proj: PayloadProject) => void
  previewMission: MissionExport | null
  previewRaw: boolean
  previewLoading: boolean
  onTogglePreviewRaw: () => void
  onClosePreview: () => void
}

export function FlightPlanPanels({
  visiblePanel,
  layout,
  state,
  infoPanelCollapsed,
  infoPanelWidth,
  installedProjects,
  onInfoPanelEnter,
  onInfoPanelLeave,
  onResizeStart,
  onShowProject,
  previewMission,
  previewRaw,
  previewLoading,
  onTogglePreviewRaw,
  onClosePreview,
}: FlightPlanPanelsProps) {
  return (
    <>
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
                <ProjectInfoPanel info={visiblePanel.info} edges={layout?.dependencyEdges} />
              ) : visiblePanel.kind === 'cluster' ? (
                <ClusterInfoPanel info={visiblePanel.info} />
              ) : (
                <DeployModeInfoPanel
                  mode={visiblePanel.mode}
                  phases={state.phases}
                  projects={state.projects}
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

      {(previewMission || previewLoading) && (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onClosePreview()
            }
          }}
          onKeyDown={(e) => {
            if (e.defaultPrevented || e.key !== 'Escape') return
            e.stopPropagation()
            e.nativeEvent.stopImmediatePropagation()
            onClosePreview()
          }}
          role="dialog"
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <div className="w-full max-w-4xl max-h-[85vh] overflow-y-auto bg-card rounded-xl border border-border shadow-2xl">
            {previewLoading ? (
              <div className="flex items-center justify-center py-24 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading mission...
              </div>
            ) : previewMission ? (
              <MissionDetailView
                mission={previewMission}
                rawContent={JSON.stringify(previewMission, null, 2)}
                showRaw={previewRaw}
                onToggleRaw={onTogglePreviewRaw}
                onImport={onClosePreview}
                onBack={onClosePreview}
                importLabel="Close"
                hideBackButton
              />
            ) : null}
          </div>
        </div>
      )}
    </>
  )
}
