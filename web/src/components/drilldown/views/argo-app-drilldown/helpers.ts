import { AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react'
import type { ArgoAIContext, ArgoResourceContextInput, HealthStatusStyle, SyncStatusStyle } from './types'

export const getSyncStatusStyle = (status: string): SyncStatusStyle => {
  const lower = status?.toLowerCase() || ''
  if (lower === 'synced') {
    return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', icon: CheckCircle }
  }
  if (lower === 'outofSync' || lower === 'out of sync' || lower === 'outofsync') {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', icon: AlertTriangle }
  }
  if (lower === 'unknown') {
    return { bg: 'bg-secondary', text: 'text-muted-foreground', border: 'border-border', icon: AlertTriangle }
  }
  return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', icon: RefreshCw }
}

export const getHealthStatusStyle = (status: string): HealthStatusStyle => {
  const lower = status?.toLowerCase() || ''
  if (lower === 'healthy') {
    return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' }
  }
  if (lower === 'degraded') {
    return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' }
  }
  if (lower === 'progressing') {
    return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' }
  }
  if (lower === 'suspended') {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' }
  }
  if (lower === 'missing') {
    return { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' }
  }
  return { bg: 'bg-secondary', text: 'text-muted-foreground', border: 'border-border' }
}

export const buildArgoAIContext = ({
  appName,
  cluster,
  namespace,
  syncStatus,
  healthStatus,
}: ArgoResourceContextInput): ArgoAIContext => {
  const resourceContext = {
    kind: 'ArgoApplication',
    name: appName,
    cluster,
    namespace,
    status: `${syncStatus} / ${healthStatus}`,
  } as const

  const hasIssues = syncStatus.toLowerCase() !== 'synced' ||
    healthStatus.toLowerCase() === 'degraded' ||
    healthStatus.toLowerCase() === 'missing'

  const issues = hasIssues
    ? [{ name: appName, message: `Sync: ${syncStatus}, Health: ${healthStatus}`, severity: (healthStatus.toLowerCase() === 'degraded' ? 'critical' : 'warning') as 'critical' | 'warning' }]
    : []

  return { resourceContext, issues }
}

export const buildRestartSnippet = (
  appName: string,
  namespace: string,
  restartTimestamp: string,
  fallbackName: string,
) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${appName || fallbackName}
  namespace: ${namespace}
spec:
  template:
    metadata:
      annotations:
        kubectl.kubernetes.io/restartedAt: "${restartTimestamp}"
`
