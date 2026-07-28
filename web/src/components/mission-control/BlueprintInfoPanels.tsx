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

export { STATUS_COLORS, STATUS_LABELS, GaugeRow } from './BlueprintInfoPanelsShared'
export { ProjectInfoPanel } from './ProjectInfoPanel'
export { ClusterInfoPanel } from './ClusterInfoPanel'
export { getDependencyNotes, generateDefaultPhases, DeployModeInfoPanel } from './DeployModeInfoPanel'

