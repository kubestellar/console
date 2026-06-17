import { ChevronRight } from 'lucide-react'
import type { PodIssue, DeploymentIssue } from '../../../hooks/useMCP'
import { StatusBadge } from '../../ui/StatusBadge'

interface ClusterIssuesSectionProps {
  podIssues: PodIssue[]
  clusterDeploymentIssues: DeploymentIssue[]
  namespaces: string[]
  effectiveClusterName: string
  drillToPod: (cluster: string, ns: string, pod: string, extra: object) => void
  drillToNamespace: (cluster: string, ns: string) => void
}

export function ClusterIssuesSection({
  podIssues,
  clusterDeploymentIssues,
  namespaces,
  effectiveClusterName,
  drillToPod,
  drillToNamespace,
}: ClusterIssuesSectionProps) {
  return (
    <>
      {/* Issues Section */}
      {(podIssues.length > 0 || clusterDeploymentIssues.length > 0) && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Issues ({podIssues.length + clusterDeploymentIssues.length})
          </h3>

          {/* Pod Issues */}
          {podIssues.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Pod Issues</h4>
              <div className="space-y-2">
                {podIssues.map((issue, i) => (
                  <div
                    key={i}
                    onClick={() => drillToPod(effectiveClusterName, issue.namespace, issue.name, { ...issue })}
                    className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-foreground">{issue.name}</span>
                        <div className="text-xs text-muted-foreground mt-1">
                          {issue.namespace} • {issue.restarts} restarts
                        </div>
                        {(issue.issues || []).length > 0 && (
                          <div className="text-xs text-red-400 mt-1">{(issue.issues || []).join(', ')}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <StatusBadge color="red" size="xs">{issue.status}</StatusBadge>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deployment Issues */}
          {clusterDeploymentIssues.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Deployment Issues</h4>
              <div className="space-y-2">
                {clusterDeploymentIssues.map((issue, i) => (
                  <div
                    key={i}
                    onClick={() => drillToNamespace(effectiveClusterName, issue.namespace)}
                    className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 cursor-pointer hover:bg-orange-500/20 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-foreground">{issue.name}</span>
                        <div className="text-xs text-muted-foreground mt-1">{issue.namespace}</div>
                        {issue.message && (
                          <div className="text-xs text-orange-400 mt-1">{issue.message}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <StatusBadge color="orange" size="xs">
                          {issue.readyReplicas}/{issue.replicas} ready
                        </StatusBadge>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Namespaces with Activity */}
      {namespaces.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">Namespaces with Activity</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {namespaces.map(ns => {
              const nsIssues = podIssues.filter(p => p.namespace === ns).length +
                clusterDeploymentIssues.filter(d => d.namespace === ns).length
              return (
                <button
                  key={ns}
                  onClick={() => drillToNamespace(effectiveClusterName, ns)}
                  className="p-3 rounded-lg bg-card/50 border border-border text-left hover:bg-card hover:border-primary/50 transition-colors"
                >
                  <div className="font-medium text-foreground text-sm truncate">{ns}</div>
                  {nsIssues > 0 && (
                    <div className="text-xs text-red-400 mt-1">{nsIssues} issues</div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
