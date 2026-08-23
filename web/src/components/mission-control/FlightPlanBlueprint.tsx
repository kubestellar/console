/**
 * FlightPlanBlueprint — Phase 3: Master SVG blueprint.
 *
 * SVG blueprint on left, info panel on right. Hover on any node or cluster
 * populates the right panel with details. Overlays toggle resource views.
 *
 * Sub-modules:
 *  - useFlightPlanBlueprint.ts        — stateful logic (hover, zoom, drag, preview)
 *  - FlightPlanToolbar.tsx            — header, overlay and deploy-mode toggles
 *  - FlightPlanCanvas.tsx             — SVG surface, zoom controls, drop zones
 *  - FlightPlanSidePanel.tsx          — resizable right info panel
 *  - FlightPlanMissionPreview.tsx     — mission preview modal
 *  - BlueprintLayout.ts               — layout computation (computeLayout)
 *  - BlueprintReport.ts               — PDF/print export (exportFullReport)
 *  - BlueprintInfoPanels.tsx          — ProjectInfoPanel, ClusterInfoPanel, DeployModeInfoPanel
 *  - FlightPlanBlueprint.types.ts     — prop/panel types
 *  - FlightPlanBlueprint.constants.ts — panel, zoom and label constants
 *  - FlightPlanBlueprint.utils.ts     — pure helpers (kb paths, glow sets, label placement)
 */

import { Shield } from 'lucide-react'

import type { FlightPlanBlueprintProps } from './FlightPlanBlueprint.types'
import { useFlightPlanBlueprint } from './useFlightPlanBlueprint'
import { FlightPlanToolbar } from './FlightPlanToolbar'
import { FlightPlanCanvas } from './FlightPlanCanvas'
import { FlightPlanSidePanel } from './FlightPlanSidePanel'
import { FlightPlanMissionPreview } from './FlightPlanMissionPreview'

export function FlightPlanBlueprint({
  state,
  onOverlayChange,
  onDeployModeChange,
  onMoveProject,
  installedProjects = new Set() }: FlightPlanBlueprintProps) {
  const controller = useFlightPlanBlueprint(state)
  const {
    clustersError, healthyState, layout, visiblePanel, setStickyPanel,
    infoPanelWidth, infoPanelCollapsed, handleResizeStart,
    handleInfoPanelEnter, handleInfoPanelLeave,
    previewMission, previewLoading, previewRaw, setPreviewRaw,
    handleShowMissionPreview, closeMissionPreview,
  } = controller

  return (
    <div className="h-full min-h-0 flex flex-col">
      <FlightPlanToolbar
        state={state}
        clusterCount={healthyState.assignments.filter((a) => a.projectNames.length > 0).length}
        onOverlayChange={onOverlayChange}
        onDeployModeChange={onDeployModeChange}
        onStickyPanelChange={setStickyPanel}
      />

      {/* Error banner when cluster data fails to load (issue 6772) */}
      {clustersError && (
        <div className="mx-6 mt-2 p-2 rounded-lg bg-red-500/20 border border-red-500/50 flex items-center gap-2 text-xs text-red-400">
          <Shield className="w-3.5 h-3.5 shrink-0" />
          <span>Cluster data unavailable: {clustersError}</span>
        </div>
      )}

      {/* Main content: SVG left + Info panel right */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        <FlightPlanCanvas
          state={state}
          controller={controller}
          installedProjects={installedProjects}
          onMoveProject={onMoveProject}
        />

        <FlightPlanSidePanel
          state={state}
          layout={layout}
          visiblePanel={visiblePanel}
          width={infoPanelWidth}
          collapsed={infoPanelCollapsed}
          installedProjects={installedProjects}
          onResizeStart={handleResizeStart}
          onMouseEnter={handleInfoPanelEnter}
          onMouseLeave={handleInfoPanelLeave}
          onShowProject={handleShowMissionPreview}
        />
      </div>

      <FlightPlanMissionPreview
        mission={previewMission}
        loading={previewLoading}
        showRaw={previewRaw}
        onToggleRaw={() => setPreviewRaw((p) => !p)}
        onClose={closeMissionPreview}
      />
    </div>
  )
}
