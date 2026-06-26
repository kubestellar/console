import type { ReactNode } from 'react'
import type { ClusterInfo } from '../../../hooks/useMCP'

export interface GPUInfo {
  total: number
  allocated: number
}

export type ClusterLayoutMode = 'grid' | 'list' | 'compact' | 'wide'

export interface ClusterGridProps {
  clusters: ClusterInfo[]
  gpuByCluster: Record<string, GPUInfo>
  isConnected: boolean
  permissionsLoading: boolean
  isClusterAdmin: (clusterName: string) => boolean
  onSelectCluster: (clusterName: string) => void
  onRenameCluster: (clusterName: string) => void
  onRefreshCluster?: (clusterName: string) => void
  onRemoveCluster?: (clusterName: string) => void
  onReorder?: (clusterNames: string[]) => void
  layoutMode?: ClusterLayoutMode
}

export interface ClusterCardProps {
  cluster: ClusterInfo
  gpuInfo?: GPUInfo
  isConnected: boolean
  permissionsLoading: boolean
  isClusterAdmin: boolean
  onSelectCluster: () => void
  onRenameCluster: () => void
  onRefreshCluster?: () => void
  onRemoveCluster?: () => void
  dragHandle?: ReactNode
}
