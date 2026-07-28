/**
 * BlueprintInfoPanels — right-hand info panels for FlightPlanBlueprint.
 *
 * Contains:
 *  - ProjectInfoPanel   — shown when hovering a project node
 *  - ClusterInfoPanel   — shown when hovering a cluster zone
 *  - DeployModeInfoPanel — shown when the deploy-mode toggle is active
 *
 * Also exports helper utilities:
 *  - GaugeRow           — labelled resource gauge bar
 *  - generateDefaultPhases — auto-derives deploy phases from dependencies
 *  - getDependencyNotes — human-readable integration notes for a project set
 */

export { STATUS_COLORS, STATUS_LABELS } from './blueprintInfoPanels/constants'
export { GaugeRow } from './blueprintInfoPanels/GaugeRow'
export { ProjectInfoPanel } from './blueprintInfoPanels/ProjectInfoPanel'
export { ClusterInfoPanel } from './blueprintInfoPanels/ClusterInfoPanel'
export { DeployModeInfoPanel } from './blueprintInfoPanels/DeployModeInfoPanel'
export { getDependencyNotes, generateDefaultPhases } from './blueprintInfoPanels/deployModeHelpers'
