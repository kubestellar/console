import { useState } from 'react'
import { useCardLoadingState } from './CardDataContext'

interface RBACFinding {
  id: string
  cluster: string
  subject: string
  subjectKind: 'User' | 'Group' | 'ServiceAccount'
  risk: 'critical' | 'high' | 'medium' | 'low'
  description: string
  binding: string
}

const DEMO_FINDINGS: RBACFinding[] = [
  { id: '1', cluster: 'prod-us-east', subject: 'dev-team', subjectKind: 'Group', risk: 'critical', description: 'cluster-admin binding — full cluster access', binding: 'ClusterRoleBinding/dev-admin' },
  { id: '2', cluster: 'prod-us-east', subject: 'ci-bot', subjectKind: 'ServiceAccount', risk: 'high', description: 'Wildcard verb on secrets — can read all secrets', binding: 'ClusterRoleBinding/ci-secrets' },
  { id: '3', cluster: 'staging', subject: 'default', subjectKind: 'ServiceAccount', risk: 'high', description: 'Default SA has elevated privileges', binding: 'ClusterRoleBinding/default-elevated' },
  { id: '4', cluster: 'prod-eu-west', subject: 'monitoring', subjectKind: 'ServiceAccount', risk: 'medium', description: 'Wide list/watch on all namespaces', binding: 'ClusterRoleBinding/monitoring-wide' },
  { id: '5', cluster: 'prod-us-east', subject: 'backup-operator', subjectKind: 'ServiceAccount', risk: 'medium', description: 'PV and PVC access across namespaces', binding: 'ClusterRoleBinding/backup-pvs' },
  { id: '6', cluster: 'staging', subject: 'developer', subjectKind: 'User', risk: 'low', description: 'Edit role in staging namespace', binding: 'RoleBinding/dev-edit' },
]

export function RBACExplorer() {
  useCardLoadingState({ isLoading: false, hasAnyData: true, isDemoData: true })
  const [riskFilter, setRiskFilter] = useState<string | null>(null)

  const findings = DEMO_FINDINGS
  const filtered = riskFilter ? findings.filter(f => f.risk === riskFilter) : findings

  const riskStyles = {
    critical: { bg: 'bg-red-500/10', text: 'text-red-400', count: findings.filter(f => f.risk === 'critical').length },
    high: { bg: 'bg-orange-500/10', text: 'text-orange-400', count: findings.filter(f => f.risk === 'high').length },
    medium: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', count: findings.filter(f => f.risk === 'medium').length },
    low: { bg: 'bg-blue-500/10', text: 'text-blue-400', count: findings.filter(f => f.risk === 'low').length },
  }

  return (
    <div className="space-y-2 p-1">
      {/* Risk summary chips */}
      <div className="flex gap-1 flex-wrap">
        {Object.entries(riskStyles).map(([risk, style]) => (
          <button
            key={risk}
            onClick={() => setRiskFilter(riskFilter === risk ? null : risk)}
            className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
              riskFilter === risk
                ? `${style.bg} ${style.text} ring-1 ring-current`
                : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {risk}: {style.count}
          </button>
        ))}
      </div>

      {/* Findings list */}
      <div className="space-y-1 max-h-[300px] overflow-y-auto">
        {filtered.map(finding => {
          const style = riskStyles[finding.risk]
          return (
            <div key={finding.id} className={`px-2 py-1.5 rounded-lg ${style.bg} border border-transparent hover:border-current/20 transition-colors`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${style.bg} ${style.text} font-medium`}>
                    {finding.risk.toUpperCase()}
                  </span>
                  <span className="text-sm font-medium truncate">{finding.subject}</span>
                  <span className="text-xs text-muted-foreground">({finding.subjectKind})</span>
                </div>
                <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 shrink-0">{finding.cluster}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{finding.description}</div>
              <div className="text-xs text-muted-foreground/60 mt-0.5 truncate">{finding.binding}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
