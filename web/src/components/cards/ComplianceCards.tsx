/**
 * Compliance cards backed by live data hooks.
 *
 * Each card detects whether the corresponding tool is installed in connected
 * clusters. When installed, it displays real per-cluster data. When not
 * installed, it falls back to demo data and offers an AI mission install link.
 */

import { useMemo } from 'react'
import { AlertTriangle, AlertCircle, Shield } from 'lucide-react'
import { StatusBadge } from '../ui/StatusBadge'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useTrivy } from '../../hooks/useTrivy'
import { useKubescape } from '../../hooks/useKubescape'
import { useKyverno } from '../../hooks/useKyverno'
import { useMissions } from '../../hooks/useMissions'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'

interface CardConfig {
  config?: Record<string, unknown>
}

/** Maximum number of violation entries to display in PolicyViolations card */
const MAX_VIOLATION_ENTRIES = 10

// ── Falco (still static — no hook yet) ──────────────────────────────────

export function FalcoAlerts({ config: _config }: CardConfig) {
  useCardLoadingState({ isLoading: false, hasAnyData: true, isDemoData: true })
  const demoAlerts = [
    { severity: 'critical', message: 'Container escape attempt detected', time: '2m ago' },
    { severity: 'warning', message: 'Privileged pod spawned', time: '15m ago' },
    { severity: 'info', message: 'Shell spawned in container', time: '1h ago' },
  ]

  return (
    <div className="space-y-3">
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

// ── Trivy Vulnerability Scanner ─────────────────────────────────────────

export function TrivyScan({ config: _config }: CardConfig) {
  const { t } = useTranslation()
  const { statuses, aggregated, isLoading, installed, isDemoData } = useTrivy()
  const { startMission } = useMissions()
  const { selectedClusters } = useGlobalFilters()

  // Filter by selected clusters
  const filtered = useMemo(() => {
    if (selectedClusters.length === 0) return aggregated
    const agg = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 }
    for (const [name, s] of Object.entries(statuses)) {
      if (!s.installed || !selectedClusters.includes(name)) continue
      agg.critical += s.vulnerabilities.critical
      agg.high += s.vulnerabilities.high
      agg.medium += s.vulnerabilities.medium
      agg.low += s.vulnerabilities.low
      agg.unknown += s.vulnerabilities.unknown
    }
    return agg
  }, [statuses, aggregated, selectedClusters])

  useCardLoadingState({ isLoading, hasAnyData: installed || isDemoData, isDemoData })

  const handleInstall = () => {
    startMission({
      title: 'Install Trivy Operator',
      description: 'Install Trivy Operator for container vulnerability scanning',
      type: 'deploy',
      initialPrompt: `I want to install the Trivy Operator for vulnerability scanning on my clusters.

Please help me:
1. Install Trivy Operator via Helm (scan-only mode, no enforcement)
2. Verify the operator is running and scanning
3. Check for initial vulnerability reports

Use: helm install trivy-operator aquasecurity/trivy-operator --version 0.23.0 --namespace trivy --create-namespace

Please proceed step by step.`,
      context: {},
    })
  }

  return (
    <div className="space-y-3">
      {/* Install prompt when not detected */}
      {!installed && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-cyan-400 font-medium">Trivy Integration</p>
            <p className="text-muted-foreground">
              Install Trivy Operator for vulnerability scanning.{' '}
              <button onClick={handleInstall} className="text-cyan-400 hover:underline">
                Install with an AI Mission →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Per-cluster badges */}
      {installed && Object.values(statuses).filter(s => s.installed).length > 1 && (
        <div className="flex flex-wrap gap-1">
          {Object.values(statuses).filter(s => s.installed).map(s => (
            <StatusBadge key={s.cluster} color={s.vulnerabilities.critical > 0 ? 'red' : 'green'} size="xs">
              {s.cluster}: {s.vulnerabilities.critical}C/{s.vulnerabilities.high}H
            </StatusBadge>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 rounded-lg bg-red-500/10 text-center">
          <p className="text-xl font-bold text-red-400">{filtered.critical}</p>
          <p className="text-xs text-muted-foreground">{t('common.critical')}</p>
        </div>
        <div className="p-2 rounded-lg bg-orange-500/10 text-center">
          <p className="text-xl font-bold text-orange-400">{filtered.high}</p>
          <p className="text-xs text-muted-foreground">High</p>
        </div>
        <div className="p-2 rounded-lg bg-yellow-500/10 text-center">
          <p className="text-xl font-bold text-yellow-400">{filtered.medium}</p>
          <p className="text-xs text-muted-foreground">Medium</p>
        </div>
        <div className="p-2 rounded-lg bg-blue-500/10 text-center">
          <p className="text-xl font-bold text-blue-400">{filtered.low}</p>
          <p className="text-xs text-muted-foreground">Low</p>
        </div>
      </div>
    </div>
  )
}

// ── Kubescape Security Posture ──────────────────────────────────────────

export function KubescapeScan({ config: _config }: CardConfig) {
  const { statuses, aggregated, isLoading, installed, isDemoData } = useKubescape()
  const { startMission } = useMissions()
  const { selectedClusters } = useGlobalFilters()

  // Filter by selected clusters
  const filtered = useMemo(() => {
    if (selectedClusters.length === 0) return aggregated
    const clusterStatuses = Object.entries(statuses)
      .filter(([name, s]) => s.installed && selectedClusters.includes(name))
      .map(([, s]) => s)
    if (clusterStatuses.length === 0) return aggregated
    const totalScore = clusterStatuses.reduce((sum, s) => sum + s.overallScore, 0)
    return {
      overallScore: Math.round(totalScore / clusterStatuses.length),
      frameworks: clusterStatuses[0]?.frameworks || [],
      totalControls: clusterStatuses.reduce((sum, s) => sum + s.totalControls, 0),
      passedControls: clusterStatuses.reduce((sum, s) => sum + s.passedControls, 0),
      failedControls: clusterStatuses.reduce((sum, s) => sum + s.failedControls, 0),
    }
  }, [statuses, aggregated, selectedClusters])

  useCardLoadingState({ isLoading, hasAnyData: installed || isDemoData, isDemoData })

  const handleInstall = () => {
    startMission({
      title: 'Install Kubescape',
      description: 'Install Kubescape Operator for security posture management',
      type: 'deploy',
      initialPrompt: `I want to install the Kubescape Operator for security posture scanning on my clusters.

Please help me:
1. Install Kubescape Operator via Helm (scan-only, no enforcement)
2. Verify it's running and scanning
3. Check initial scan results

Use: helm install kubescape-operator kubescape/kubescape-operator --version 1.30.5 --namespace kubescape --create-namespace --set capabilities.continuousScan=enable

Please proceed step by step.`,
      context: {},
    })
  }

  const score = filtered.overallScore

  return (
    <div className="space-y-3">
      {/* Install prompt when not detected */}
      {!installed && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-green-400 font-medium">Kubescape Integration</p>
            <p className="text-muted-foreground">
              Install Kubescape for security posture management.{' '}
              <button onClick={handleInstall} className="text-green-400 hover:underline">
                Install with an AI Mission →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Per-cluster scores */}
      {installed && Object.values(statuses).filter(s => s.installed).length > 1 && (
        <div className="flex flex-wrap gap-1">
          {Object.values(statuses).filter(s => s.installed).map(s => (
            <StatusBadge key={s.cluster} color={s.overallScore >= 80 ? 'green' : s.overallScore >= 60 ? 'yellow' : 'red'} size="xs">
              {s.cluster}: {s.overallScore}%
            </StatusBadge>
          ))}
        </div>
      )}

      <div className="flex items-center justify-center py-2">
        <div className="relative w-20 h-20">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2" className="text-secondary" />
            <circle
              cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2"
              strokeDasharray={`${score}, 100`}
              className={score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-foreground">{score}%</span>
          </div>
        </div>
      </div>
      <div className="space-y-1">
        {(filtered.frameworks || []).map((fw, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{fw.name}</span>
            <span className="font-medium text-foreground">{fw.score}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Policy Violations Aggregated ────────────────────────────────────────

export function PolicyViolations({ config: _config }: CardConfig) {
  const { statuses: kyvernoStatuses, isLoading: kyvernoLoading, isDemoData: kyvernoDemoData } = useKyverno()
  const { selectedClusters } = useGlobalFilters()

  // Aggregate violations from Kyverno reports (policy.violations is always 0
  // because the hook doesn't back-populate per-policy counts from PolicyReports;
  // instead use totalViolations and reports for the real data)
  const violations = useMemo(() => {
    const result: Array<{ policy: string; count: number; tool: string; clusters: string[] }> = []
    const clusterViolations = new Map<string, { count: number; clusters: string[] }>()

    for (const [clusterName, status] of Object.entries(kyvernoStatuses)) {
      if (!status.installed) continue
      if (selectedClusters.length > 0 && !selectedClusters.includes(clusterName)) continue

      // Use reports for per-namespace breakdown when available
      if ((status.reports || []).length > 0) {
        for (const report of (status.reports || [])) {
          if (report.fail === 0) continue
          const key = report.namespace || 'cluster-scoped'
          if (!clusterViolations.has(key)) {
            clusterViolations.set(key, { count: 0, clusters: [] })
          }
          const entry = clusterViolations.get(key)!
          entry.count += report.fail
          if (!entry.clusters.includes(clusterName)) {
            entry.clusters.push(clusterName)
          }
        }
      } else if (status.totalViolations > 0) {
        // Fallback: aggregate totalViolations when reports array is empty
        const key = 'all-policies'
        if (!clusterViolations.has(key)) {
          clusterViolations.set(key, { count: 0, clusters: [] })
        }
        const entry = clusterViolations.get(key)!
        entry.count += status.totalViolations
        if (!entry.clusters.includes(clusterName)) {
          entry.clusters.push(clusterName)
        }
      }
    }

    for (const [key, data] of clusterViolations.entries()) {
      result.push({ policy: key, tool: 'Kyverno', ...data })
    }

    return result.sort((a, b) => b.count - a.count).slice(0, MAX_VIOLATION_ENTRIES)
  }, [kyvernoStatuses, selectedClusters])

  const hasData = violations.length > 0 || kyvernoDemoData
  useCardLoadingState({ isLoading: kyvernoLoading, hasAnyData: hasData, isDemoData: kyvernoDemoData })

  if (violations.length === 0 && !kyvernoDemoData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
        <Shield className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No policy violations detected</p>
        <p className="text-xs mt-1">All resources comply with active policies</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {(violations || []).map((v, i) => (
          <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30">
            <div>
              <p className="text-sm font-medium text-foreground">{v.policy}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{v.tool}</span>
                {v.clusters.length > 0 && (
                  <span>· {(v.clusters || []).join(', ')}</span>
                )}
              </div>
            </div>
            <StatusBadge color="orange" size="md">
              {v.count}
            </StatusBadge>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Compliance Score Gauge ──────────────────────────────────────────────

export function ComplianceScore({ config: _config }: CardConfig) {
  const { aggregated: kubescapeAgg, isLoading: ksLoading, isDemoData: ksDemoData } = useKubescape()
  const { statuses: kyvernoStatuses, isLoading: kyLoading, isDemoData: kyDemoData } = useKyverno()
  const { selectedClusters } = useGlobalFilters()

  const isLoading = ksLoading || kyLoading

  // Compute composite score from available tools
  const { score, breakdown, usingFallback } = useMemo(() => {
    const scores: Array<{ name: string; value: number }> = []

    // Kubescape score (filtered by cluster if needed)
    if (kubescapeAgg.overallScore > 0) {
      scores.push({ name: 'Kubescape', value: kubescapeAgg.overallScore })
    }

    // Kyverno compliance rate
    let totalPolicies = 0
    for (const [clusterName, status] of Object.entries(kyvernoStatuses)) {
      if (!status.installed) continue
      if (selectedClusters.length > 0 && !selectedClusters.includes(clusterName)) continue
      totalPolicies += status.totalPolicies
    }
    if (totalPolicies > 0) {
      // Compliance rate based on totalViolations from PolicyReports
      // (individual policy.violations is always 0 — hook doesn't back-populate)
      let totalViolations = 0
      for (const [clusterName, status] of Object.entries(kyvernoStatuses)) {
        if (!status.installed) continue
        if (selectedClusters.length > 0 && !selectedClusters.includes(clusterName)) continue
        totalViolations += status.totalViolations
      }
      // Score: 100% when no violations, clamped to 0% when violations >= totalPolicies.
      // Note: multiple resources can violate the same policy, so totalViolations
      // often exceeds totalPolicies — the score floors at 0% in that case.
      const rate = totalViolations === 0
        ? 100
        : Math.max(0, Math.round(100 - (totalViolations / totalPolicies) * 100))
      scores.push({ name: 'Kyverno', value: rate })
    }

    if (scores.length === 0) {
      // No real compliance data — show placeholder with demo indicator
      return {
        score: 85,
        breakdown: [
          { name: 'CIS', value: 82 },
          { name: 'NSA', value: 79 },
          { name: 'PCI', value: 71 },
        ],
        usingFallback: true,
      }
    }

    const avg = Math.round(scores.reduce((sum, s) => sum + s.value, 0) / scores.length)
    return { score: avg, breakdown: scores, usingFallback: false }
  }, [kubescapeAgg, kyvernoStatuses, selectedClusters])

  // Mark as demo data when hooks report demo OR when using hardcoded fallback values
  const isDemoData = ksDemoData || kyDemoData || usingFallback

  useCardLoadingState({ isLoading, hasAnyData: true, isDemoData })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center py-4">
        <div className="relative w-24 h-24">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="3" className="text-secondary" />
            <circle
              cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="3"
              strokeDasharray={`${score}, 100`}
              className={score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-foreground">{score}%</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {(breakdown || []).map((item, i) => (
          <div key={i}>
            <p className="font-medium text-foreground">{item.name}</p>
            <p className="text-muted-foreground">{item.value}%</p>
          </div>
        ))}
      </div>
    </div>
  )
}
