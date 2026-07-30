import { useTranslation } from 'react-i18next'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { StatusBadge } from '../../ui/StatusBadge'
import { ChevronRight, Box, Network, HardDrive } from 'lucide-react'
import { DeploymentIssue, PodIssue, NamespaceEvent, Pod, Deployment, Service, PVC } from './useNamespaceDrillDown'

interface DeploymentIssueRowProps {
  issue: DeploymentIssue
  onClick: () => void
}

export function DeploymentIssueRow({ issue, onClick }: DeploymentIssueRowProps) {
  return (
    <div
      onClick={onClick}
      className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20 cursor-pointer hover:bg-orange-500/20 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-foreground">{issue.name}</span>
            <StatusBadge color="orange" size="xs">
              {issue.readyReplicas}/{issue.replicas} ready
            </StatusBadge>
          </div>
          {issue.reason && (
            <div className="text-sm text-muted-foreground">Reason: {issue.reason}</div>
          )}
          {issue.message && (
            <div className="text-xs text-orange-400 mt-1">{issue.message}</div>
          )}
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 ml-4" />
      </div>
    </div>
  )
}

interface PodIssueRowProps {
  issue: PodIssue
  onClick: () => void
}

export function PodIssueRow({ issue, onClick }: PodIssueRowProps) {
  return (
    <div
      onClick={onClick}
      className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-foreground">{issue.name}</span>
            <StatusBadge color="red" size="xs">
              {issue.status}
            </StatusBadge>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{issue.restarts} restarts</span>
            {issue.reason && <span>• {issue.reason}</span>}
          </div>
          {(issue.issues?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {issue.issues?.map((iss, j) => (
                <StatusBadge key={j} color="red" size="xs">
                  {iss}
                </StatusBadge>
              ))}
            </div>
          )}
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 ml-4" />
      </div>
    </div>
  )
}

interface EventRowProps {
  event: NamespaceEvent
}

export function EventRow({ event }: EventRowProps) {
  return (
    <div
      className={`p-3 rounded-lg border-l-4 ${
        event.type === 'Warning'
          ? 'bg-yellow-500/10 border-l-yellow-500'
          : 'bg-card/50 border-l-green-500'
      }`}
    >
      <div className="flex items-center gap-2">
        <StatusIndicator status={event.type === 'Warning' ? 'warning' : 'healthy'} size="sm" />
        <span className="font-medium text-foreground text-sm">{event.reason}</span>
        <span className="text-xs text-muted-foreground">on {event.object}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{event.message}</p>
    </div>
  )
}

interface PodRowProps {
  pod: Pod
  onClick: () => void
}

export function PodRow({ pod, onClick }: PodRowProps) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group"
    >
      <div className={`w-2 h-2 rounded-full ${pod.status === 'Running' ? 'bg-green-400' : pod.status === 'Pending' ? 'bg-yellow-400' : 'bg-red-400'}`} />
      <Box className="w-3 h-3 text-green-400" />
      <span className="text-sm text-foreground">{pod.name}</span>
      <StatusBadge
        color={pod.status === 'Running' ? 'green' : pod.status === 'Pending' ? 'yellow' : 'red'}
        size="xs"
      >
        {pod.status}
      </StatusBadge>
      <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
    </div>
  )
}

interface DeploymentRowProps {
  deployment: Deployment
  onClick: () => void
}

export function DeploymentRow({ deployment, onClick }: DeploymentRowProps) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group"
    >
      <Box className="w-3 h-3 text-blue-400" />
      <span className="text-sm text-foreground">{deployment.name}</span>
      <span className={`text-xs ${deployment.readyReplicas === deployment.replicas ? 'text-green-400' : 'text-yellow-400'}`}>
        {deployment.readyReplicas}/{deployment.replicas}
      </span>
      <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
    </div>
  )
}

interface ServiceRowProps {
  service: Service
}

export function ServiceRow({ service }: ServiceRowProps) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group">
      <Network className="w-3 h-3 text-blue-400" />
      <span className="text-sm text-foreground">{service.name}</span>
      <StatusBadge color="blue" size="xs">{service.type}</StatusBadge>
      <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
    </div>
  )
}

interface PVCRowProps {
  pvc: PVC
}

export function PVCRow({ pvc }: PVCRowProps) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group">
      <HardDrive className="w-3 h-3 text-green-400" />
      <span className="text-sm text-foreground">{pvc.name}</span>
      <StatusBadge
        color={pvc.status === 'Bound' ? 'green' : 'yellow'}
        size="xs"
      >
        {pvc.status}
      </StatusBadge>
      {pvc.capacity && <span className="text-xs text-muted-foreground">{pvc.capacity}</span>}
      <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
    </div>
  )
}

interface OverviewStatsProps {
  deploymentIssuesCount: number
  podIssuesCount: number
  eventsCount: number
}

export function OverviewStats({ deploymentIssuesCount, podIssuesCount, eventsCount }: OverviewStatsProps) {
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="p-4 rounded-lg bg-card/50 border border-border">
        <div className="text-sm text-muted-foreground mb-2">{t('drilldown.namespace.deploymentsWithIssues', 'Deployments with Issues')}</div>
        <div className="text-2xl font-bold text-foreground">{deploymentIssuesCount}</div>
      </div>
      <div className="p-4 rounded-lg bg-card/50 border border-border">
        <div className="text-sm text-muted-foreground mb-2">{t('drilldown.namespace.podsWithIssues', 'Pods with Issues')}</div>
        <div className="text-2xl font-bold text-foreground">{podIssuesCount}</div>
      </div>
      <div className="p-4 rounded-lg bg-card/50 border border-border">
        <div className="text-sm text-muted-foreground mb-2">{t('drilldown.fields.recentEvents')}</div>
        <div className="text-2xl font-bold text-foreground">{eventsCount}</div>
      </div>
    </div>
  )
}
