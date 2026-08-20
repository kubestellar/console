import type { ComponentProps, ReactNode } from 'react'
import type { MissionControlState, OverlayMode } from './types'
import type { ProjectHoverInfo } from './svg/ProjectNode'
import type { ClusterHoverInfo } from './svg/ClusterZone'

export interface FlightPlanBlueprintProps {
  state: MissionControlState
  onOverlayChange: (overlay: OverlayMode) => void
  onDeployModeChange: (mode: 'phased' | 'yolo') => void
  onMoveProject?: (projectName: string, fromCluster: string, toCluster: string) => void
  installedProjects?: Set<string>
}

export type InfoPanelData =
  | { kind: 'project'; info: ProjectHoverInfo }
  | { kind: 'cluster'; info: ClusterHoverInfo }
  | { kind: 'deployMode'; mode: 'phased' | 'yolo'; phases: MissionControlState['phases'] }

export interface BlueprintOverlayOption {
  key: OverlayMode
  icon: ReactNode
  label: string
}

export type ClusterHoverHandler = ComponentProps<typeof import('./svg/ClusterZone').ClusterZone>['onHover']
export type ProjectHoverHandler = ComponentProps<typeof import('./svg/ProjectNode').ProjectNode>['onHover']
