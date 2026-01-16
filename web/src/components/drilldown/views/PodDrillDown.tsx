import { useState } from 'react'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { RemediationConsole } from '../RemediationConsole'
import { Sparkles } from 'lucide-react'

interface Props {
  data: Record<string, unknown>
}

export function PodDrillDown({ data }: Props) {
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const podName = data.pod as string
  const { drillToLogs, drillToEvents, drillToYAML } = useDrillDownActions()
  const [showRemediation, setShowRemediation] = useState(false)

  // Pod data from the issue
  const status = data.status as string
  const restarts = (data.restarts as number) || 0
  const reason = data.reason as string
  const issues = (data.issues as string[]) || []

  const statusColor = status === 'Running' ? 'healthy' :
    status === 'Pending' ? 'warning' : 'error'

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <div className={`p-4 rounded-lg border ${
        statusColor === 'healthy' ? 'bg-green-500/10 border-green-500/20' :
        statusColor === 'warning' ? 'bg-yellow-500/10 border-yellow-500/20' :
        'bg-red-500/10 border-red-500/20'
      }`}>
        <div className="flex items-center gap-3">
          <StatusIndicator status={statusColor} size="lg" />
          <div>
            <div className="text-lg font-semibold text-foreground">{status}</div>
            {reason && <div className="text-sm text-muted-foreground">{reason}</div>}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">Namespace</div>
          <div className="text-lg font-semibold text-foreground">{namespace}</div>
        </div>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">Restarts</div>
          <div className={`text-lg font-semibold ${restarts > 0 ? 'text-yellow-400' : 'text-foreground'}`}>
            {restarts}
          </div>
        </div>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">Issues</div>
          <div className={`text-lg font-semibold ${issues.length > 0 ? 'text-red-400' : 'text-foreground'}`}>
            {issues.length}
          </div>
        </div>
      </div>

      {/* Issues List */}
      {issues.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">Active Issues</h3>
          <div className="space-y-2">
            {issues.map((issue, i) => (
              <div key={i} className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-sm text-foreground">{issue}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Remediation (only show if there are issues) */}
      {issues.length > 0 && (
        <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Sparkles className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">AI Remediation Available</h3>
                <p className="text-sm text-muted-foreground">
                  Let Claude analyze and help fix these issues
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowRemediation(true)}
              className="px-4 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-white transition-colors flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Remediate
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            onClick={() => drillToLogs(cluster, namespace, podName)}
            className="p-4 rounded-lg bg-card/50 border border-border hover:bg-card hover:border-primary/50 transition-colors text-left"
          >
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="font-medium text-foreground">Logs</span>
            </div>
            <p className="text-xs text-muted-foreground">View container logs</p>
          </button>

          <button
            onClick={() => drillToEvents(cluster, namespace, podName)}
            className="p-4 rounded-lg bg-card/50 border border-border hover:bg-card hover:border-primary/50 transition-colors text-left"
          >
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="font-medium text-foreground">Events</span>
            </div>
            <p className="text-xs text-muted-foreground">View pod events</p>
          </button>

          <button
            onClick={() => setShowRemediation(true)}
            className="p-4 rounded-lg bg-card/50 border border-border hover:bg-card hover:border-green-500/50 transition-colors text-left"
          >
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-medium text-foreground">Shell</span>
            </div>
            <p className="text-xs text-muted-foreground">Open shell console</p>
          </button>

          <button
            onClick={() => drillToYAML(cluster, namespace, 'pod', podName)}
            className="p-4 rounded-lg bg-card/50 border border-border hover:bg-card hover:border-primary/50 transition-colors text-left"
          >
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <span className="font-medium text-foreground">YAML</span>
            </div>
            <p className="text-xs text-muted-foreground">View resource definition</p>
          </button>
        </div>
      </div>

      {/* Remediation Console Modal */}
      <RemediationConsole
        isOpen={showRemediation}
        onClose={() => setShowRemediation(false)}
        resourceType="pod"
        resourceName={podName}
        namespace={namespace}
        cluster={cluster}
        issues={issues}
      />

      {/* Pod Details */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Details</h3>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Pod Name</dt>
              <dd className="font-mono text-foreground break-all">{podName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Namespace</dt>
              <dd className="font-mono text-foreground">{namespace}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cluster</dt>
              <dd className="font-mono text-foreground break-all">{cluster.split('/').pop()}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-mono text-foreground">{status}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
