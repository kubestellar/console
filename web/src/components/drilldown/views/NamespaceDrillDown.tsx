import { useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { usePodIssues, useDeploymentIssues, useEvents } from '../../../hooks/useMCP'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { useTranslation } from 'react-i18next'

interface Props {
  data: Record<string, unknown>
}

export function NamespaceDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const { drillToDeployment, drillToPod, drillToEvents } = useDrillDownActions()

  const { issues: allPodIssues } = usePodIssues(cluster)
  const { issues: allDeploymentIssues } = useDeploymentIssues()
  const { events } = useEvents(cluster, namespace, 20)

  const podIssues = useMemo(() =>
    allPodIssues.filter(p => p.namespace === namespace),
    [allPodIssues, namespace]
  )

  const deploymentIssues = useMemo(() =>
    allDeploymentIssues.filter(d => d.namespace === namespace &&
      (d.cluster === cluster || d.cluster?.includes(cluster.split('/')[0]))),
    [allDeploymentIssues, namespace, cluster]
  )

  const nsEvents = useMemo(() =>
    events.filter(e => e.namespace === namespace),
    [events, namespace]
  )

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">Deployments with Issues</div>
          <div className="text-2xl font-bold text-foreground">{deploymentIssues.length}</div>
        </div>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">Pods with Issues</div>
          <div className="text-2xl font-bold text-foreground">{podIssues.length}</div>
        </div>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">{t('drilldown.fields.recentEvents')}</div>
          <div className="text-2xl font-bold text-foreground">{nsEvents.length}</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => drillToEvents(cluster, namespace)}
          className="px-4 py-2 rounded-lg bg-card/50 border border-border text-sm text-foreground hover:bg-card transition-colors"
        >
          View All Events
        </button>
      </div>

      {/* Deployment Issues */}
      {deploymentIssues.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">Deployment Issues</h3>
          <div className="space-y-2">
            {deploymentIssues.map((issue, i) => (
              <div
                key={i}
                onClick={() => drillToDeployment(cluster, namespace, issue.name, { ...issue })}
                className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20 cursor-pointer hover:bg-orange-500/20 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground">{issue.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-orange-500/20 text-orange-400">
                        {issue.readyReplicas}/{issue.replicas} ready
                      </span>
                    </div>
                    {issue.reason && (
                      <div className="text-sm text-muted-foreground">Reason: {issue.reason}</div>
                    )}
                    {issue.message && (
                      <div className="text-xs text-orange-400 mt-1">{issue.message}</div>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0 ml-4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pod Issues */}
      {podIssues.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">Pod Issues</h3>
          <div className="space-y-2">
            {podIssues.map((issue, i) => (
              <div
                key={i}
                onClick={() => drillToPod(cluster, namespace, issue.name, { ...issue })}
                className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground">{issue.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400">
                        {issue.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{issue.restarts} restarts</span>
                      {issue.reason && <span>• {issue.reason}</span>}
                    </div>
                    {issue.issues.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {issue.issues.map((iss, j) => (
                          <span key={j} className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400">
                            {iss}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0 ml-4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Events */}
      {nsEvents.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">{t('drilldown.fields.recentEvents')}</h3>
          <div className="space-y-2">
            {nsEvents.slice(0, 10).map((event, i) => (
              <div
                key={i}
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
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {deploymentIssues.length === 0 && podIssues.length === 0 && nsEvents.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">✨</div>
          <p className="text-lg text-foreground">All clear!</p>
          <p className="text-sm text-muted-foreground">No issues found in this namespace</p>
        </div>
      )}
    </div>
  )
}
