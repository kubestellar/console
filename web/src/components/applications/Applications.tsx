import { useMemo } from 'react'
import { useClusters, useDeploymentIssues, usePodIssues } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { StatusIndicator } from '../charts/StatusIndicator'

interface AppSummary {
  namespace: string
  cluster: string
  deploymentCount: number
  podIssues: number
  deploymentIssues: number
  status: 'healthy' | 'warning' | 'critical'
}

export function Applications() {
  const { clusters } = useClusters()
  const { issues: podIssues } = usePodIssues()
  const { issues: deploymentIssues } = useDeploymentIssues()
  const { drillToNamespace } = useDrillDownActions()

  // Group applications by namespace
  const apps = useMemo(() => {
    const appMap = new Map<string, AppSummary>()

    // Group pod issues by namespace
    podIssues.forEach(issue => {
      const key = `${issue.cluster}/${issue.namespace}`
      if (!appMap.has(key)) {
        appMap.set(key, {
          namespace: issue.namespace,
          cluster: issue.cluster || 'unknown',
          deploymentCount: 0,
          podIssues: 0,
          deploymentIssues: 0,
          status: 'healthy',
        })
      }
      const app = appMap.get(key)!
      app.podIssues++
      app.status = app.podIssues > 3 ? 'critical' : 'warning'
    })

    // Group deployment issues by namespace
    deploymentIssues.forEach(issue => {
      const key = `${issue.cluster}/${issue.namespace}`
      if (!appMap.has(key)) {
        appMap.set(key, {
          namespace: issue.namespace,
          cluster: issue.cluster || 'unknown',
          deploymentCount: 0,
          podIssues: 0,
          deploymentIssues: 0,
          status: 'healthy',
        })
      }
      const app = appMap.get(key)!
      app.deploymentCount++
      app.deploymentIssues++
      if (app.status !== 'critical') {
        app.status = 'warning'
      }
    })

    return Array.from(appMap.values()).sort((a, b) => {
      // Sort by status (critical first), then by issue count
      const statusOrder = { critical: 0, warning: 1, healthy: 2 }
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status]
      }
      return (b.podIssues + b.deploymentIssues) - (a.podIssues + a.deploymentIssues)
    })
  }, [podIssues, deploymentIssues])

  const stats = useMemo(() => ({
    total: apps.length,
    healthy: apps.filter(a => a.status === 'healthy').length,
    warning: apps.filter(a => a.status === 'warning').length,
    critical: apps.filter(a => a.status === 'critical').length,
    totalPodIssues: podIssues.length,
    totalDeploymentIssues: deploymentIssues.length,
  }), [apps, podIssues, deploymentIssues])

  return (
    <div className="pt-16">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Applications</h1>
        <p className="text-muted-foreground">View and manage deployed applications across clusters</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-foreground">{stats.total}</div>
          <div className="text-sm text-muted-foreground">Active Namespaces</div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-red-400">{stats.critical}</div>
          <div className="text-sm text-muted-foreground">Critical</div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-yellow-400">{stats.warning}</div>
          <div className="text-sm text-muted-foreground">Warning</div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-foreground">{stats.totalPodIssues + stats.totalDeploymentIssues}</div>
          <div className="text-sm text-muted-foreground">Total Issues</div>
        </div>
      </div>

      {/* Applications List */}
      {apps.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">✨</div>
          <p className="text-lg text-foreground">All systems healthy!</p>
          <p className="text-sm text-muted-foreground">No application issues detected across your clusters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map((app, i) => (
            <div
              key={i}
              onClick={() => drillToNamespace(app.cluster, app.namespace)}
              className={`glass p-4 rounded-lg cursor-pointer transition-all hover:scale-[1.01] border-l-4 ${
                app.status === 'critical' ? 'border-l-red-500' :
                app.status === 'warning' ? 'border-l-yellow-500' :
                'border-l-green-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <StatusIndicator status={app.status} size="lg" />
                  <div>
                    <h3 className="font-semibold text-foreground">{app.namespace}</h3>
                    <p className="text-xs text-muted-foreground">
                      {app.cluster.split('/').pop() || app.cluster}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  {app.deploymentIssues > 0 && (
                    <div className="text-center">
                      <div className="text-lg font-bold text-orange-400">{app.deploymentIssues}</div>
                      <div className="text-xs text-muted-foreground">Deployment Issues</div>
                    </div>
                  )}
                  {app.podIssues > 0 && (
                    <div className="text-center">
                      <div className="text-lg font-bold text-red-400">{app.podIssues}</div>
                      <div className="text-xs text-muted-foreground">Pod Issues</div>
                    </div>
                  )}
                  <div className="text-primary text-sm">
                    Drill down →
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Clusters Summary */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">Clusters Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {clusters.map((cluster) => (
            <div key={cluster.name} className="glass p-3 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <StatusIndicator status={cluster.healthy ? 'healthy' : 'critical'} size="sm" />
                <span className="font-medium text-foreground text-sm truncate">
                  {cluster.context || cluster.name.split('/').pop()}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {cluster.podCount || 0} pods • {cluster.nodeCount || 0} nodes
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
