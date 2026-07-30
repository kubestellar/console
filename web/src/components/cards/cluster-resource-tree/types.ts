import { Server, Box, Layers, Database, Network, HardDrive, Folder, FileKey, FileText, Gauge, User, Clock, Container, Copy, Shield, Globe } from 'lucide-react'

// Resource tree lens/view options
export type TreeLens = 'all' | 'issues' | 'nodes' | 'workloads' | 'storage' | 'network'

export type SortByOption = 'name' | 'nodes' | 'health'

export const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'nodes' as const, label: 'Nodes' },
  { value: 'health' as const, label: 'Health' },
]

export interface ClusterResourceTreeProps {
  config?: Record<string, unknown>
}

// Resource type icons mapping
export const ResourceIcon = {
  cluster: Server,
  namespace: Folder,
  deployment: Box,
  statefulset: Database,
  daemonset: Layers,
  job: Clock,
  cronjob: Clock,
  pod: Container,
  service: Network,
  configmap: FileText,
  secret: FileKey,
  pvc: HardDrive,
  serviceaccount: User,
  hpa: Gauge,
  replicaset: Copy,
  ingress: Globe,
  networkpolicy: Shield,
} as const

// Namespace resource structure
export interface NamespaceResources {
  deployments: Array<{ name: string; namespace: string; replicas: number; readyReplicas: number; status?: string }>
  services: Array<{ name: string; namespace: string; type: string }>
  pvcs: Array<{ name: string; namespace: string; status: string; capacity?: string }>
  pods: Array<{ name: string; namespace: string; status: string; restarts: number }>
  configmaps: Array<{ name: string; namespace: string; dataCount: number }>
  secrets: Array<{ name: string; namespace: string; type: string }>
  serviceaccounts: Array<{ name: string; namespace: string }>
  jobs: Array<{ name: string; namespace: string; status: string; completions: string; duration?: string }>
  hpas: Array<{ name: string; namespace: string; reference: string; minReplicas: number; maxReplicas: number; currentReplicas: number }>
  replicasets: Array<{ name: string; namespace: string; replicas: number; readyReplicas: number; ownerName?: string }>
  statefulsets: Array<{ name: string; namespace: string; replicas: number; readyReplicas: number; status: string }>
  daemonsets: Array<{ name: string; namespace: string; desiredScheduled: number; ready: number; status: string }>
  cronjobs: Array<{ name: string; namespace: string; schedule: string; suspend: boolean; active: number; lastSchedule?: string }>
  ingresses: Array<{ name: string; namespace: string; class?: string; hosts: string[]; address?: string }>
  networkpolicies: Array<{ name: string; namespace: string; policyTypes: string[]; podSelector: string }>
}

// Cache structure for per-cluster data
export interface ClusterDataCache {
  nodes: Array<{ name: string; status: string }>
  namespaces: string[]
  deployments: Array<{ name: string; namespace: string; replicas: number; readyReplicas: number; status?: string; image?: string }>
  services: Array<{ name: string; namespace: string; type: string }>
  pvcs: Array<{ name: string; namespace: string; status: string; capacity?: string }>
  pods: Array<{ name: string; namespace: string; status: string; restarts: number }>
  configmaps: Array<{ name: string; namespace: string; dataCount: number }>
  secrets: Array<{ name: string; namespace: string; type: string }>
  serviceaccounts: Array<{ name: string; namespace: string }>
  jobs: Array<{ name: string; namespace: string; status: string; completions: string; duration?: string }>
  hpas: Array<{ name: string; namespace: string; reference: string; minReplicas: number; maxReplicas: number; currentReplicas: number }>
  replicasets: Array<{ name: string; namespace: string; replicas: number; readyReplicas: number; ownerName?: string }>
  statefulsets: Array<{ name: string; namespace: string; replicas: number; readyReplicas: number; status: string }>
  daemonsets: Array<{ name: string; namespace: string; desiredScheduled: number; ready: number; status: string }>
  cronjobs: Array<{ name: string; namespace: string; schedule: string; suspend: boolean; active: number; lastSchedule?: string }>
  ingresses: Array<{ name: string; namespace: string; class?: string; hosts: string[]; address?: string }>
  networkpolicies: Array<{ name: string; namespace: string; policyTypes: string[]; podSelector: string }>
  podIssues: Array<{ name: string; namespace: string; status: string; reason?: string }>
}

// TreeNode component props
export interface TreeNodeProps {
  id: string
  label: string
  icon: typeof Server
  iconColor: string
  count?: number
  children?: React.ReactNode
  onClick?: () => void
  onToggle?: (expanding: boolean) => void
  badge?: string | number
  badgeColor?: string
  statusIndicator?: 'healthy' | 'error' | 'warning'
  indent?: number
}

// Issue counts structure
export interface IssueCounts {
  nodes: number
  deployments: number
  pods: number
  pvcs: number
  total: number
}
