import { Box, Layers, Network, Activity, Briefcase, Lock, Settings, User, HardDrive } from 'lucide-react'

export type ResourceKind = 'Pod' | 'Deployment' | 'Service' | 'Job' | 'HPA' | 'ConfigMap' | 'Secret' | 'ServiceAccount' | 'PVC'

export interface ResourceItem {
  kind: ResourceKind
  name: string
  namespace?: string
  status?: string
  statusColor: string
  detail?: string
  data?: Record<string, unknown>
}

export function getKindIcon(kind: ResourceKind) {
  switch (kind) {
    case 'Pod': return <Box className="w-3.5 h-3.5 text-blue-400" />
    case 'Deployment': return <Layers className="w-3.5 h-3.5 text-purple-400" />
    case 'Service': return <Network className="w-3.5 h-3.5 text-cyan-400" />
    case 'Job': return <Briefcase className="w-3.5 h-3.5 text-yellow-400" />
    case 'HPA': return <Activity className="w-3.5 h-3.5 text-purple-400" />
    case 'ConfigMap': return <Settings className="w-3.5 h-3.5 text-orange-400" />
    case 'Secret': return <Lock className="w-3.5 h-3.5 text-purple-400" />
    case 'ServiceAccount': return <User className="w-3.5 h-3.5 text-cyan-400" />
    case 'PVC': return <HardDrive className="w-3.5 h-3.5 text-green-400" />
  }
}

export function getStatusBgColor(color: string): string {
  switch (color) {
    case 'green': return 'bg-green-500/20 text-green-400'
    case 'blue': return 'bg-blue-500/20 text-blue-400'
    case 'yellow': return 'bg-yellow-500/20 text-yellow-400'
    case 'red': return 'bg-red-500/20 text-red-400'
    case 'cyan': return 'bg-cyan-500/20 text-cyan-400'
    case 'purple': return 'bg-purple-500/20 text-purple-400'
    case 'orange': return 'bg-orange-500/20 text-orange-400'
    default: return 'bg-gray-500/20 text-muted-foreground dark:bg-gray-400/20'
  }
}
