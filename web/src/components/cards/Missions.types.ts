import type { LucideIcon } from 'lucide-react'
import type { DeployMission, DeployMissionStatus, DeployClusterStatus } from '../../hooks/useDeployMissions'

export interface OrbitStatus {
  cadence: string
  lastResult?: string
  overdue: boolean
}

export interface MissionStatusConfig {
  icon: LucideIcon
  color: string
  bg: string
  label: string
  animateClass?: string
}

export interface ClusterStatusConfig {
  color: string
  barColor: string
  label: string
}

export interface DependencyActionStyle {
  color: string
  label: string
}

export interface MissionRowProps {
  mission: DeployMission
  isExpanded: boolean
  onToggle: () => void
  isActive: boolean
  onDiagnose: (mission: DeployMission) => void
  onRepair: (mission: DeployMission) => void
  orbitStatus?: OrbitStatus
  statusConfig: Record<DeployMissionStatus, MissionStatusConfig>
  clusterStatusConfig: Record<DeployClusterStatus['status'], ClusterStatusConfig>
  depActionStyles: Record<string, DependencyActionStyle>
}
