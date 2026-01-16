import { useState, useMemo } from 'react'
import { useClusters } from '../../hooks/useMCP'
import { StatusIndicator } from '../charts/StatusIndicator'

// Mock security data - in production would come from klaude-ops check_security_issues
interface SecurityIssue {
  type: 'privileged' | 'root' | 'hostNetwork' | 'hostPID' | 'noSecurityContext'
  severity: 'high' | 'medium' | 'low'
  resource: string
  namespace: string
  cluster: string
  message: string
}

function getMockSecurityData(): SecurityIssue[] {
  return [
    {
      type: 'privileged',
      severity: 'high',
      resource: 'vllm-engine',
      namespace: 'default',
      cluster: 'vllm-d',
      message: 'Container runs in privileged mode',
    },
    {
      type: 'root',
      severity: 'medium',
      resource: 'metrics-collector',
      namespace: 'monitoring',
      cluster: 'ops',
      message: 'Container runs as root user',
    },
    {
      type: 'noSecurityContext',
      severity: 'low',
      resource: 'web-frontend',
      namespace: 'e5',
      cluster: 'vllm-d',
      message: 'No security context defined',
    },
  ]
}

export function Security() {
  const { clusters } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>('')
  const [severityFilter, setSeverityFilter] = useState<string>('all')

  // In production, fetch from API
  const securityIssues = useMemo(() => getMockSecurityData(), [])

  const filteredIssues = useMemo(() => {
    return securityIssues.filter(issue => {
      if (selectedCluster && !issue.cluster.includes(selectedCluster)) return false
      if (severityFilter !== 'all' && issue.severity !== severityFilter) return false
      return true
    })
  }, [securityIssues, selectedCluster, severityFilter])

  const stats = useMemo(() => ({
    total: securityIssues.length,
    high: securityIssues.filter(i => i.severity === 'high').length,
    medium: securityIssues.filter(i => i.severity === 'medium').length,
    low: securityIssues.filter(i => i.severity === 'low').length,
  }), [securityIssues])

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-400 bg-red-500/20'
      case 'medium': return 'text-yellow-400 bg-yellow-500/20'
      case 'low': return 'text-blue-400 bg-blue-500/20'
      default: return 'text-muted-foreground bg-card'
    }
  }

  const typeIcon = (type: string) => {
    switch (type) {
      case 'privileged':
        return (
          <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        )
      case 'root':
        return (
          <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        )
      default:
        return (
          <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        )
    }
  }

  return (
    <div className="pt-16">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Security</h1>
        <p className="text-muted-foreground">RBAC and security policies across your clusters</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-foreground">{stats.total}</div>
          <div className="text-sm text-muted-foreground">Total Issues</div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-red-400">{stats.high}</div>
          <div className="text-sm text-muted-foreground">High Severity</div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-yellow-400">{stats.medium}</div>
          <div className="text-sm text-muted-foreground">Medium Severity</div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-blue-400">{stats.low}</div>
          <div className="text-sm text-muted-foreground">Low Severity</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <select
          value={selectedCluster}
          onChange={(e) => setSelectedCluster(e.target.value)}
          className="px-4 py-2 rounded-lg bg-card/50 border border-border text-foreground text-sm"
        >
          <option value="">All Clusters</option>
          {clusters.map((cluster) => (
            <option key={cluster.name} value={cluster.name}>
              {cluster.context || cluster.name.split('/').pop()}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          {['all', 'high', 'medium', 'low'].map(sev => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                severityFilter === sev
                  ? sev === 'high' ? 'bg-red-500 text-white' :
                    sev === 'medium' ? 'bg-yellow-500 text-white' :
                    sev === 'low' ? 'bg-blue-500 text-white' :
                    'bg-primary text-primary-foreground'
                  : 'bg-card/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              {sev.charAt(0).toUpperCase() + sev.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Issues List */}
      {filteredIssues.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🔒</div>
          <p className="text-lg text-foreground">No security issues found!</p>
          <p className="text-sm text-muted-foreground">Your clusters are following security best practices</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredIssues.map((issue, i) => (
            <div
              key={i}
              className={`glass p-4 rounded-lg border-l-4 ${
                issue.severity === 'high' ? 'border-l-red-500' :
                issue.severity === 'medium' ? 'border-l-yellow-500' :
                'border-l-blue-500'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="mt-1">{typeIcon(issue.type)}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-foreground">{issue.resource}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${severityColor(issue.severity)}`}>
                      {issue.severity}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-card text-muted-foreground">
                      {issue.type}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">{issue.message}</p>
                  <div className="text-xs text-muted-foreground mt-2">
                    {issue.namespace} • {issue.cluster}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Security Recommendations */}
      <div className="mt-8 p-4 rounded-lg bg-card/30 border border-border">
        <h3 className="text-lg font-semibold text-foreground mb-3">Security Recommendations</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <StatusIndicator status="healthy" size="sm" />
            Use Pod Security Standards to enforce security contexts
          </li>
          <li className="flex items-center gap-2">
            <StatusIndicator status="healthy" size="sm" />
            Avoid privileged containers unless absolutely necessary
          </li>
          <li className="flex items-center gap-2">
            <StatusIndicator status="healthy" size="sm" />
            Run containers as non-root users
          </li>
          <li className="flex items-center gap-2">
            <StatusIndicator status="healthy" size="sm" />
            Enable network policies to restrict pod communication
          </li>
        </ul>
      </div>
    </div>
  )
}
