import {
  HardDrive,
  Layout,
  Network,
  Shield,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { ClusterHoverInfo } from './svg/ClusterZone'
import type { ProjectHoverInfo } from './svg/ProjectNode'
import type {
  MissionControlState,
  OverlayMode,
} from './types'

export interface FlightPlanBlueprintProps {
  state: MissionControlState
  onOverlayChange: (overlay: OverlayMode) => void
  onDeployModeChange: (mode: MissionControlState['deployMode']) => void
  onMoveProject?: (projectName: string, fromCluster: string, toCluster: string) => void
  installedProjects?: Set<string>
}

export type InfoPanelData =
  | { kind: 'project'; info: ProjectHoverInfo }
  | { kind: 'cluster'; info: ClusterHoverInfo }
  | { kind: 'deployMode'; mode: MissionControlState['deployMode']; phases: MissionControlState['phases'] }

export interface OverlayOption {
  key: OverlayMode
  icon: LucideIcon
  label: string
}

export const OVERLAYS: OverlayOption[] = [
  { key: 'architecture', icon: Layout, label: 'Architecture' },
  { key: 'compute', icon: Zap, label: 'Compute' },
  { key: 'storage', icon: HardDrive, label: 'Storage' },
  { key: 'network', icon: Network, label: 'Network' },
  { key: 'security', icon: Shield, label: 'Security' },
]

export const INFO_PANEL_MIN = 280
export const INFO_PANEL_MAX = 600
export const INFO_PANEL_DEFAULT = 416
export const INFO_PANEL_LS_KEY = 'mission-control-info-panel-width'

export const ZOOM_MIN = 0.3
export const ZOOM_MAX = 3
export const ZOOM_STEP = 0.2

export const MIN_LABEL_GAP = 14
export const NODE_RADIUS = 18
export const LABEL_OFFSET_Y = 12
