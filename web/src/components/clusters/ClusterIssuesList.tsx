import { AlertTriangle, ChevronRight, Box, Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../ui/StatusBadge'
import type { PodIssue, DeploymentIssue } from '../../hooks/mcp/types.workloads'

interface ClusterIssuesListProps {
  podIssues: PodIssue[]
  deploymentIssues: DeploymentIssue[]
  clusterName: string
  onDrillToPod: (cluster: string, namespace: string, name: string, data?: Record<string, unknown>) => void
  onDrillToDeployment: (cluster: string, namespace: string, name: string, data?: Record<string, unknown>) => void
  onClose: () => void
}

export function ClusterIssuesList({ podIssues, deploymentIssues, clusterName, onDrillToPod, onDrillToDeployment, onClose }: ClusterIssuesListProps) {
  const { t } = useTranslation()
  const totalCount = podIssues.length + deploymentIssues.length
  if (totalCount === 0) return null

  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-400" />
        {t('clusterDetail.issuesCount', { count: totalCount })}
      </h3>
      <div className="space-y-2">
        {podIssues.slice(0, 5).map((issue, i) => (
          <div
            key={`pod-${i}`}
            onClick={() => {
              onDrillToPod(clusterName, issue.namespace, issue.name, {
                status: issue.status,
                restarts: issue.restarts,
                issues: issue.issues,
                reason: issue.reason })
              onClose()
            }}
            className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <StatusBadge color="blue" size="xs" icon={<Box className="w-3 h-3" />} className="shrink-0">{t('clusterDetail.pod')}</StatusBadge>
                <span className="font-medium text-foreground truncate">{issue.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">({issue.namespace})</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <StatusBadge color="red" size="xs">{issue.status}</StatusBadge>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            {issue.restarts > 0 && (
              <div className="mt-1 text-xs text-muted-foreground pl-14">{t('clusterDetail.restarts', { count: issue.restarts })}</div>
            )}
          </div>
        ))}
        {deploymentIssues.slice(0, 3).map((issue, i) => (
          <div
            key={`dep-${i}`}
            onClick={() => {
              onDrillToDeployment(clusterName, issue.namespace, issue.name, {
                replicas: issue.replicas,
                readyReplicas: issue.readyReplicas,
                reason: issue.reason,
                message: issue.message })
              onClose()
            }}
            className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <StatusBadge color="purple" size="xs" icon={<Layers className="w-3 h-3" />} className="shrink-0">{t('clusterDetail.deploy')}</StatusBadge>
                <span className="font-medium text-foreground truncate">{issue.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">({issue.namespace})</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <StatusBadge color="red" size="xs">
                  {issue.readyReplicas}/{issue.replicas} ready
                </StatusBadge>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            {issue.message && (
              <div className="mt-1 text-xs text-red-400 pl-16 truncate">{issue.message}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
