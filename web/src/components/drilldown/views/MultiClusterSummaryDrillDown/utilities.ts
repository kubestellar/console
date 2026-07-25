import { AlertCircle, Layers, Rocket, Box, Settings as SettingsIcon, HardDrive, Cpu, Ship, Zap, CheckCircle, XCircle, AlertTriangle, Activity, Server } from 'lucide-react'
import type { DrillDownViewType } from '../../../../hooks/useDrillDown'

interface ViewConfig {
  icon: typeof Server
  color: string
  bgColor: string
  dataKey: string
  nameKey: string
  getStatus: (item: Record<string, unknown>) => string
}

export function getViewConfig(viewType: DrillDownViewType): ViewConfig {
  switch (viewType) {
    case 'all-clusters':
      return {
        icon: Server,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/20',
        dataKey: 'clusters',
        nameKey: 'name',
        getStatus: (item: { healthy?: boolean; status?: string }) => item.healthy ? 'healthy' : (item.status || 'unknown')
      }
    case 'all-namespaces':
      return {
        icon: Layers,
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/20',
        dataKey: 'namespaces',
        nameKey: 'namespace',
        getStatus: () => 'active'
      }
    case 'all-deployments':
      return {
        icon: Rocket,
        color: 'text-green-400',
        bgColor: 'bg-green-500/20',
        dataKey: 'deployments',
        nameKey: 'name',
        getStatus: (item: { readyReplicas?: number; replicas?: number }) =>
          item.readyReplicas === item.replicas ? 'healthy' : 'unhealthy'
      }
    case 'all-pods':
      return {
        icon: Box,
        color: 'text-cyan-400',
        bgColor: 'bg-cyan-500/20',
        dataKey: 'pods',
        nameKey: 'name',
        getStatus: (item: { status?: string; phase?: string }) => item.status || item.phase || 'unknown'
      }
    case 'all-services':
      return {
        icon: Activity,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/20',
        dataKey: 'services',
        nameKey: 'name',
        getStatus: () => 'active'
      }
    case 'all-nodes':
      return {
        icon: Server,
        color: 'text-orange-400',
        bgColor: 'bg-orange-500/20',
        dataKey: 'nodes',
        nameKey: 'name',
        getStatus: (item: { status?: string; ready?: boolean }) =>
          item.ready !== false && item.status !== 'NotReady' ? 'Ready' : 'NotReady'
      }
    case 'all-events':
      return {
        icon: Zap,
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/20',
        dataKey: 'events',
        nameKey: 'reason',
        getStatus: (item: { type?: string }) => item.type || 'Normal'
      }
    case 'all-alerts':
      return {
        icon: AlertCircle,
        color: 'text-red-400',
        bgColor: 'bg-red-500/20',
        dataKey: 'alerts',
        nameKey: 'name',
        getStatus: (item: { status?: string; severity?: string; state?: string }) =>
          item.status || item.severity || item.state || 'unknown'
      }
    case 'all-helm':
      return {
        icon: Ship,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/20',
        dataKey: 'helmReleases',
        nameKey: 'name',
        getStatus: (item: { status?: string }) => item.status || 'deployed'
      }
    case 'all-operators':
      return {
        icon: Box,
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/20',
        dataKey: 'operators',
        nameKey: 'name',
        getStatus: (item: { pendingUpgrade?: boolean }) => item.pendingUpgrade ? 'PendingUpgrade' : 'Running'
      }
    case 'all-security':
      return {
        icon: AlertTriangle,
        color: 'text-red-400',
        bgColor: 'bg-red-500/20',
        dataKey: 'securityIssues',
        nameKey: 'name',
        getStatus: (item: { severity?: string }) => item.severity || 'warning'
      }
    case 'all-gpu':
      return {
        icon: Cpu,
        color: 'text-cyan-400',
        bgColor: 'bg-cyan-500/20',
        dataKey: 'gpus',
        nameKey: 'name',
        getStatus: () => 'active'
      }
    case 'all-storage':
      return {
        icon: HardDrive,
        color: 'text-green-400',
        bgColor: 'bg-green-500/20',
        dataKey: 'pvcs',
        nameKey: 'name',
        getStatus: (item: { status?: string }) => item.status || 'Unknown'
      }
    case 'all-jobs':
      return {
        icon: SettingsIcon,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/20',
        dataKey: 'jobs',
        nameKey: 'name',
        getStatus: (item: { status?: string }) => item.status || 'Running'
      }
    default:
      return {
        icon: Server,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/20',
        dataKey: 'items',
        nameKey: 'name',
        getStatus: () => 'unknown'
      }
  }
}

interface StatusBadge {
  icon: typeof CheckCircle
  color: string
  bg: string
}

export function getStatusBadge(status: string): StatusBadge {
  const lower = status?.toLowerCase() || ''
  if (['running', 'healthy', 'ready', 'active', 'deployed', 'succeeded', 'available', 'normal'].includes(lower)) {
    return { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20' }
  }
  if (['pending', 'progressing', 'waiting', 'busy', 'warning'].includes(lower)) {
    return { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/20' }
  }
  if (['failed', 'error', 'unhealthy', 'notready', 'critical', 'crashloopbackoff', 'imagepullbackoff'].includes(lower)) {
    return { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20' }
  }
  return { icon: AlertCircle, color: 'text-muted-foreground', bg: 'bg-secondary' }
}
