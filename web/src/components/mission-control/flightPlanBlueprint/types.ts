import type { ClusterHoverInfo } from '../svg/ClusterZone'
import type { ProjectHoverInfo } from '../svg/ProjectNode'
import type { MissionControlState } from '../types'

export type InfoPanelData =
  | { kind: 'project'; info: ProjectHoverInfo }
  | { kind: 'cluster'; info: ClusterHoverInfo }
  | { kind: 'deployMode'; mode: 'phased' | 'yolo'; phases: MissionControlState['phases'] }
