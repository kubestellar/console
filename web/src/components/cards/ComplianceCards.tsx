/**
 * Placeholder cards for compliance tools that will be populated with real data
 * when the respective tools are detected in the cluster.
 */

import { Shield, Eye, Bug, Target, AlertTriangle, CheckCircle2, ExternalLink, AlertCircle } from 'lucide-react'

interface CardConfig {
  config?: Record<string, unknown>
}

// Falco Runtime Security Card
export function FalcoAlerts({ config: _config }: CardConfig) {
  // TODO: Integrate with Falco when detected
  const demoAlerts = [
    { severity: 'critical', message: 'Container escape attempt detected', time: '2m ago' },
    { severity: 'warning', message: 'Privileged pod spawned', time: '15m ago' },
    { severity: 'info', message: 'Shell spawned in container', time: '1h ago' },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Eye className="w-4 h-4 text-purple-400" />
          <span>Falco</span>
        </div>
        <a
          href="https://falco.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-purple-400"
          title="Falco Documentation"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs">
        <AlertCircle className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-purple-400 font-medium">Falco Integration</p>
          <p className="text-muted-foreground">
            Install Falco for runtime security monitoring.{' '}
            <a
              href="https://falco.org/docs/install-operate/installation/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:underline"
            >
              Install guide →
            </a>
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {demoAlerts.map((alert, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 p-2 rounded-lg text-xs ${
              alert.severity === 'critical' ? 'bg-red-500/10 text-red-400' :
              alert.severity === 'warning' ? 'bg-yellow-500/10 text-yellow-400' :
              'bg-blue-500/10 text-blue-400'
            }`}
          >
            <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">{alert.message}</p>
              <p className="text-muted-foreground">{alert.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Trivy Vulnerability Scanner Card
export function TrivyScan({ config: _config }: CardConfig) {
  // TODO: Integrate with Trivy when detected
  const demoVulns = {
    critical: 3,
    high: 12,
    medium: 28,
    low: 45,
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Bug className="w-4 h-4 text-cyan-400" />
          <span>Trivy</span>
        </div>
        <a
          href="https://aquasecurity.github.io/trivy/"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-cyan-400"
          title="Trivy Documentation"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs">
        <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-cyan-400 font-medium">Trivy Integration</p>
          <p className="text-muted-foreground">
            Install Trivy Operator for vulnerability scanning.{' '}
            <a
              href="https://aquasecurity.github.io/trivy-operator/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:underline"
            >
              Install guide →
            </a>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 rounded-lg bg-red-500/10 text-center">
          <p className="text-xl font-bold text-red-400">{demoVulns.critical}</p>
          <p className="text-xs text-muted-foreground">Critical</p>
        </div>
        <div className="p-2 rounded-lg bg-orange-500/10 text-center">
          <p className="text-xl font-bold text-orange-400">{demoVulns.high}</p>
          <p className="text-xs text-muted-foreground">High</p>
        </div>
        <div className="p-2 rounded-lg bg-yellow-500/10 text-center">
          <p className="text-xl font-bold text-yellow-400">{demoVulns.medium}</p>
          <p className="text-xs text-muted-foreground">Medium</p>
        </div>
        <div className="p-2 rounded-lg bg-blue-500/10 text-center">
          <p className="text-xl font-bold text-blue-400">{demoVulns.low}</p>
          <p className="text-xs text-muted-foreground">Low</p>
        </div>
      </div>
    </div>
  )
}

// Kubescape Security Posture Card
export function KubescapeScan({ config: _config }: CardConfig) {
  // TODO: Integrate with Kubescape when detected
  const score = 78
  const frameworks = [
    { name: 'NSA-CISA', score: 82 },
    { name: 'MITRE ATT&CK', score: 75 },
    { name: 'CIS Benchmark', score: 79 },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Target className="w-4 h-4 text-green-400" />
          <span>Kubescape</span>
        </div>
        <a
          href="https://kubescape.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-green-400"
          title="Kubescape Documentation"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-xs">
        <AlertCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-green-400 font-medium">Kubescape Integration</p>
          <p className="text-muted-foreground">
            Install Kubescape for security posture management.{' '}
            <a
              href="https://kubescape.io/docs/install-operator/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-400 hover:underline"
            >
              Install guide →
            </a>
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center py-2">
        <div className="relative w-20 h-20">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2" className="text-secondary" />
            <circle
              cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2"
              strokeDasharray={`${score}, 100`}
              className="text-green-400"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-foreground">{score}%</span>
          </div>
        </div>
      </div>
      <div className="space-y-1">
        {frameworks.map((fw, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{fw.name}</span>
            <span className="font-medium text-foreground">{fw.score}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Policy Violations Aggregated Card
export function PolicyViolations({ config: _config }: CardConfig) {
  const violations = [
    { policy: 'require-labels', count: 12, tool: 'Gatekeeper' },
    { policy: 'disallow-privileged', count: 5, tool: 'Kyverno' },
    { policy: 'require-resource-limits', count: 23, tool: 'Gatekeeper' },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Shield className="w-4 h-4 text-orange-400" />
        <span>Policy Violations</span>
      </div>
      <div className="space-y-2">
        {violations.map((v, i) => (
          <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30">
            <div>
              <p className="text-sm font-medium text-foreground">{v.policy}</p>
              <p className="text-xs text-muted-foreground">{v.tool}</p>
            </div>
            <span className="px-2 py-1 rounded bg-orange-500/20 text-orange-400 text-xs font-medium">
              {v.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Compliance Score Gauge Card
export function ComplianceScore({ config: _config }: CardConfig) {
  const score = 85
  const trend = '+3%'

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="w-4 h-4 text-green-400" />
        <span>Overall Compliance</span>
      </div>
      <div className="flex items-center justify-center py-4">
        <div className="relative w-24 h-24">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="3" className="text-secondary" />
            <circle
              cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="3"
              strokeDasharray={`${score}, 100`}
              className="text-green-400"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-foreground">{score}%</span>
            <span className="text-xs text-green-400">{trend}</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <p className="font-medium text-foreground">CIS</p>
          <p className="text-muted-foreground">82%</p>
        </div>
        <div>
          <p className="font-medium text-foreground">NSA</p>
          <p className="text-muted-foreground">79%</p>
        </div>
        <div>
          <p className="font-medium text-foreground">PCI</p>
          <p className="text-muted-foreground">71%</p>
        </div>
      </div>
    </div>
  )
}
