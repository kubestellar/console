/**
 * Compliance cards backed by live data hooks.
 *
 * Each card detects whether the corresponding tool is installed in connected
 * clusters. When installed, it displays real per-cluster data. When not
 * installed, it falls back to demo data and offers an AI mission install link.
 */

import { useState, useMemo } from 'react'
import { AlertTriangle, AlertCircle, Shield, ExternalLink, Info, Loader2, ChevronRight } from 'lucide-react'
import { StatusBadge } from '../ui/StatusBadge'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useTrivy } from '../../hooks/useTrivy'
import { useKubescape } from '../../hooks/useKubescape'
import { useKyverno } from '../../hooks/useKyverno'
import { useMissions } from '../../hooks/useMissions'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { TrivyDetailModal } from './trivy/TrivyDetailModal'
import { KubescapeDetailModal } from './kubescape/KubescapeDetailModal'
import { KyvernoDetailModal } from './kyverno/KyvernoDetailModal'
import { getFrameworkInfo, getScoreContext, TRIVY_SEVERITY, CARD_DESCRIPTIONS } from '../../lib/constants/compliance'
import { ComplianceScoreBreakdownModal } from './compliance/ComplianceScoreBreakdownModal'
import { PolicyViolationDetailModal } from './compliance/PolicyViolationDetailModal'

interface CardConfig {
  config?: Record<string, unknown>
}

/** Maximum number of violation entries to display in PolicyViolations card */
const MAX_VIOLATION_ENTRIES = 10

/** Troubleshoot mission definitions for tools that are installed but not producing data */
const TROUBLESHOOT_MISSIONS: Record<string, { title: string; description: string; prompt: string }> = {
  trivy: {
    title: 'Troubleshoot Trivy Operator',
    description: 'Trivy is installed but not producing vulnerability reports',
    prompt: `Trivy Operator is installed on my cluster but no VulnerabilityReports are being generated.

Please help me diagnose and fix the issue:
1. Check the trivy-operator pod status: kubectl get pods -n trivy-system -n trivy
2. Check operator logs for errors: kubectl logs -n trivy-system -l app.kubernetes.io/name=trivy-operator --tail=50
3. Check if any VulnerabilityReports exist: kubectl get vulnerabilityreports -A
4. Check if the operator's scan jobs are running or failing: kubectl get jobs -n trivy-system -n trivy
5. If pods are crashing, check resource limits and node capacity
6. If scans are stuck, try restarting the operator: kubectl rollout restart deployment -n trivy-system trivy-operator

Please diagnose step by step and fix any issues found.` },
  kubescape: {
    title: 'Troubleshoot Kubescape Operator',
    description: 'Kubescape is installed but not producing scan results',
    prompt: `Kubescape Operator is installed on my cluster but no scan data is being generated (0 controls scanned).

Please help me diagnose and fix the issue:
1. Check all pods in the kubescape namespace: kubectl get pods -n kubescape
2. Look for crashing pods (especially kubevuln, operator, storage): kubectl get pods -n kubescape | grep -v Running
3. Check logs of failing pods: kubectl logs -n kubescape <pod-name> --tail=50
4. Verify the storage pod is running (required for scan data): kubectl get pods -n kubescape -l app=storage
5. Check if workloadconfigurationscans exist: kubectl get workloadconfigurationscans -A
6. If kubevuln or other pods are OOMKilled, increase resource limits
7. If storage pod is failing, check PVC status: kubectl get pvc -n kubescape
8. Try triggering a fresh scan: kubectl annotate ns default kubescape.io/scan=true --overwrite

Please diagnose step by step and fix any issues found.` },
  kyverno: {
    title: 'Troubleshoot Kyverno',
    description: 'Kyverno is installed but no policies are configured',
    prompt: `Kyverno is installed on my cluster but no policies are configured or producing reports.

Please help me diagnose and fix the issue:
1. Check Kyverno pod status: kubectl get pods -n kyverno
2. Check for any existing policies: kubectl get clusterpolicies,policies -A
3. Check Kyverno controller logs: kubectl logs -n kyverno -l app.kubernetes.io/component=admission-controller --tail=50
4. If no policies exist, install a basic audit policy set:
   - disallow-privileged-containers (audit mode)
   - require-labels (audit mode)
   - restrict-image-registries (audit mode)
5. Check PolicyReports are being generated: kubectl get policyreports -A
6. If pods are crashing, check resource limits and webhook configuration

Please diagnose step by step and fix any issues found.` } }

/** Install mission prompt for compliance tools (Kubescape + Kyverno) */
const COMPLIANCE_INSTALL_PROMPT = `I want to set up compliance monitoring on my Kubernetes clusters.

Please help me install one or both of these tools:

1. **Kubescape** — security posture scoring (CIS, NSA, MITRE frameworks)
   - Install via Helm: helm repo add kubescape https://kubescape.github.io/helm-charts && helm install kubescape kubescape/kubescape-operator -n kubescape --create-namespace

2. **Kyverno** — policy enforcement with compliance reports
   - Install via Helm: helm repo add kyverno https://kyverno.github.io/kyverno && helm install kyverno kyverno/kyverno -n kyverno --create-namespace

Please install at least one tool and verify it is producing scan results.`

// ── Falco (static demo data — no live hook yet) ───────────────────────

export function FalcoAlerts({ config: _config }: CardConfig) {
  const { t } = useTranslation(['common', 'cards'])
  const { isDemoMode } = useDemoMode()

  // Falco has no live data hook yet so isDemoData is always true.
  // However, we still gate the demo content on isDemoMode so the card
  // correctly shows an empty / install-prompt state when a real agent
  // is connected but Falco is not installed.
  const showDemo = isDemoMode
  useCardLoadingState({ isLoading: false, hasAnyData: showDemo, isDemoData: showDemo })

  const demoAlerts = [
    { severity: 'critical', message: 'Container escape attempt detected', time: '2m ago' },
    { severity: 'warning', message: 'Privileged pod spawned', time: '15m ago' },
    { severity: 'info', message: 'Shell spawned in container', time: '1h ago' },
  ]

  if (!showDemo) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-purple-400 font-medium">{t('cards:falcoAlerts.integration')}</p>
            <p className="text-muted-foreground">
              {t('cards:falcoAlerts.installDescription')}{' '}
              <a
                href="https://falco.org/docs/install-operate/installation/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline"
              >
                {t('cards:falcoAlerts.installGuide')} &rarr;
              </a>
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-4 text-muted-foreground text-sm">
          <Shield className="w-6 h-6 mb-2 text-purple-400" />
          <p>{t('cards:falcoAlerts.noAlertsAvailable')}</p>
          <p className="text-xs mt-1">{t('cards:falcoAlerts.installToSee')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
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
  const { t } = useTranslation(['common', 'cards'])
  const { statuses, aggregated, isLoading, isRefreshing, installed, hasErrors, isDemoData, clustersChecked, totalClusters, refetch } = useTrivy()
  const { startMission } = useMissions()
  const { selectedClusters } = useGlobalFilters()
  const [modalCluster, setModalCluster] = useState<string | null>(null)

  /** Whether all clusters have been checked */
  const allChecked = clustersChecked >= totalClusters && totalClusters > 0

  // Filter by selected clusters
  const filtered = (() => {
    if (selectedClusters.length === 0) return aggregated
    const agg = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 }
    for (const [name, s] of Object.entries(statuses)) {
      if (!s.installed || !selectedClusters.includes(name)) continue
      const vuln = s.vulnerabilities
      if (!vuln) continue
      agg.critical += vuln.critical
      agg.high += vuln.high
      agg.medium += vuln.medium
      agg.low += vuln.low
      agg.unknown += vuln.unknown
    }
    return agg
  })()

  const hasData = installed || isDemoData
  // #6219: surface failure state. `hasErrors` from useTrivy means at least
  // one cluster's scan errored — wire it through as isFailed so CardWrapper
  // can show the error path immediately instead of a stale-data fallthrough.
  useCardLoadingState({ isLoading: isLoading && !hasData, isRefreshing, hasAnyData: hasData, isDemoData, isFailed: hasErrors })

  // Detect degraded state: installed but no reports generated (excludes clusters with errors)
  const isDegraded = (() => {
    if (!installed || isLoading) return false
    const installedClusters = Object.values(statuses).filter(s => s.installed && !s.error)
    return installedClusters.length > 0 && installedClusters.every(s => s.totalReports === 0)
  })()

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
      context: {} })
  }

  const handleTroubleshoot = () => {
    const mission = TROUBLESHOOT_MISSIONS.trivy
    startMission({
      title: mission.title,
      description: mission.description,
      type: 'troubleshoot',
      initialPrompt: mission.prompt,
      context: {} })
  }

  // Only show full-screen spinner on very first load with zero data
  if (isLoading && Object.keys(statuses).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        {totalClusters > 0 && (
          <span className="text-xs text-muted-foreground">
            {t('cards:trivyScan.checkingClusters', { checked: clustersChecked, total: totalClusters })}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Progressive streaming indicator */}
      {!allChecked && totalClusters > 0 && !isRefreshing && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{t('cards:trivyScan.checkingClusters', { checked: clustersChecked, total: totalClusters })}</span>
        </div>
      )}

      {/* Fetch error state: one or more clusters failed to return scanner data */}
      {hasErrors && !isDemoData && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-400 font-medium">{t('cards:trivyScan.failedToFetch')}</p>
            <p className="text-muted-foreground">
              {t('cards:trivyScan.checkConnectivity')}{' '}
              <button onClick={() => refetch()} className="text-red-400 hover:underline">
                {t('cards:trivyScan.retry')} →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Install prompt when not detected and no errors (only after scanning completes) */}
      {!installed && !isLoading && !isRefreshing && !hasErrors && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-cyan-400 font-medium">{t('cards:trivyScan.integration')}</p>
            <p className="text-muted-foreground">
              {t('cards:trivyScan.installDescription')}{' '}
              <button onClick={handleInstall} className="text-cyan-400 hover:underline">
                {t('cards:trivyScan.installWithMission')} →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Degraded state: installed but no scan data */}
      {isDegraded && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-400 font-medium">{t('cards:trivyScan.noScanData')}</p>
            <p className="text-muted-foreground">
              {t('cards:trivyScan.installedNoReports')}{' '}
              <button onClick={handleTroubleshoot} className="text-amber-400 hover:underline">
                {t('cards:trivyScan.fixWithMission')} →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Per-cluster badges — click to open detail modal */}
      {installed && Object.values(statuses).some(s => s.installed) && (
        <div className="flex flex-wrap gap-1">
          {Object.values(statuses).filter(s => s.installed).map(s => (
            <button key={s.cluster} onClick={() => setModalCluster(s.cluster)} className="cursor-pointer">
              <StatusBadge color={(s.vulnerabilities?.critical ?? 0) > 0 ? 'red' : 'green'} size="xs">
                {s.cluster}: {s.vulnerabilities?.critical ?? 0}C/{s.vulnerabilities?.high ?? 0}H
              </StatusBadge>
            </button>
          ))}
        </div>
      )}

      <div
        className="grid grid-cols-2 gap-2 cursor-pointer"
        onClick={() => {
          // Open modal for first installed cluster matching filter
          const first = Object.values(statuses).find(s =>
            s.installed && (selectedClusters.length === 0 || selectedClusters.includes(s.cluster))
          )
          if (first) setModalCluster(first.cluster)
        }}
        role="button"
        aria-label={t('cards:trivyScan.viewDetailsAria')}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            const first = Object.values(statuses).find(s =>
              s.installed && (selectedClusters.length === 0 || selectedClusters.includes(s.cluster))
            )
            if (first) setModalCluster(first.cluster)
          }
        }}
      >
        <div className="p-2 rounded-lg bg-red-500/10 text-center hover:bg-red-500/20 transition-colors group/sev relative">
          <p className="text-xl font-bold text-red-400">{filtered.critical}</p>
          <p className="text-xs text-muted-foreground">{t('common.critical')}</p>
          <p className="text-[9px] text-red-400/70 mt-0.5 leading-tight">{TRIVY_SEVERITY.critical.description}</p>
        </div>
        <div className="p-2 rounded-lg bg-orange-500/10 text-center hover:bg-orange-500/20 transition-colors group/sev relative">
          <p className="text-xl font-bold text-orange-400">{filtered.high}</p>
          <p className="text-xs text-muted-foreground">{t('cards:trivyScan.high')}</p>
          <p className="text-[9px] text-orange-400/70 mt-0.5 leading-tight">{TRIVY_SEVERITY.high.description}</p>
        </div>
        <div className="p-2 rounded-lg bg-yellow-500/10 text-center hover:bg-yellow-500/20 transition-colors group/sev relative">
          <p className="text-xl font-bold text-yellow-400">{filtered.medium}</p>
          <p className="text-xs text-muted-foreground">{t('cards:trivyScan.medium')}</p>
          <p className="text-[9px] text-yellow-400/70 mt-0.5 leading-tight">{TRIVY_SEVERITY.medium.description}</p>
        </div>
        <div className="p-2 rounded-lg bg-blue-500/10 text-center hover:bg-blue-500/20 transition-colors group/sev relative">
          <p className="text-xl font-bold text-blue-400">{filtered.low}</p>
          <p className="text-xs text-muted-foreground">{t('cards:trivyScan.low')}</p>
          <p className="text-[9px] text-blue-400/70 mt-0.5 leading-tight">{TRIVY_SEVERITY.low.description}</p>
        </div>
      </div>

      {/* Action guidance */}
      {filtered.critical > 0 && (
        <div className="flex items-start gap-1.5 px-1 text-[10px] text-red-400/80">
          <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
          <span>{TRIVY_SEVERITY.critical.action}</span>
        </div>
      )}

      {/* Detail Modal */}
      {modalCluster && statuses[modalCluster] && (
        <TrivyDetailModal
          isOpen={!!modalCluster}
          onClose={() => setModalCluster(null)}
          clusterName={modalCluster}
          status={statuses[modalCluster]}
          onRefresh={() => refetch()}
          isRefreshing={isRefreshing}
        />
      )}
    </div>
  )
}

// ── Kubescape Security Posture ──────────────────────────────────────────

export function KubescapeScan({ config: _config }: CardConfig) {
  const { t } = useTranslation(['common', 'cards'])
  const { statuses, aggregated, isLoading, isRefreshing, installed, hasErrors, isDemoData, clustersChecked, totalClusters, refetch } = useKubescape()
  const { startMission } = useMissions()
  const { selectedClusters } = useGlobalFilters()
  const [modalCluster, setModalCluster] = useState<string | null>(null)

  /** Whether all clusters have been checked */
  const allChecked = clustersChecked >= totalClusters && totalClusters > 0

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
      failedControls: clusterStatuses.reduce((sum, s) => sum + s.failedControls, 0) }
  }, [statuses, aggregated, selectedClusters])

  const ksHasData = installed || isDemoData
  // #6219: surface failure state via the same `hasErrors` field useKubescape exposes.
  useCardLoadingState({ isLoading: isLoading && !ksHasData, isRefreshing, hasAnyData: ksHasData, isDemoData, isFailed: hasErrors })

  // Detect degraded state: installed but no scan data produced (excludes clusters with errors)
  const isDegraded = (() => {
    if (!installed || isLoading) return false
    const installedClusters = Object.values(statuses).filter(s => s.installed && !s.error)
    return installedClusters.length > 0 && installedClusters.every(s => s.totalControls === 0)
  })()

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
      context: {} })
  }

  const handleTroubleshoot = () => {
    const mission = TROUBLESHOOT_MISSIONS.kubescape
    startMission({
      title: mission.title,
      description: mission.description,
      type: 'troubleshoot',
      initialPrompt: mission.prompt,
      context: {} })
  }

  const score = filtered.overallScore

  // Only show full-screen spinner on very first load with zero data
  if (isLoading && Object.keys(statuses).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        {totalClusters > 0 && (
          <span className="text-xs text-muted-foreground">
            {t('cards:kubescapeScan.checkingClusters', { checked: clustersChecked, total: totalClusters })}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Progressive streaming indicator */}
      {!allChecked && totalClusters > 0 && !isRefreshing && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{t('cards:kubescapeScan.checkingClusters', { checked: clustersChecked, total: totalClusters })}</span>
        </div>
      )}

      {/* Fetch error state: one or more clusters failed to return scanner data */}
      {hasErrors && !isDemoData && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-400 font-medium">{t('cards:kubescapeScan.failedToFetch')}</p>
            <p className="text-muted-foreground">
              {t('cards:kubescapeScan.checkConnectivity')}{' '}
              <button onClick={() => refetch()} className="text-red-400 hover:underline">
                {t('cards:kubescapeScan.retry')} →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Install prompt when not detected and no errors (only after scanning completes) */}
      {!installed && !isLoading && !isRefreshing && !hasErrors && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-green-400 font-medium">{t('cards:kubescapeScan.integration')}</p>
            <p className="text-muted-foreground">
              {t('cards:kubescapeScan.installDescription')}{' '}
              <button onClick={handleInstall} className="text-green-400 hover:underline">
                {t('cards:kubescapeScan.installWithMission')} →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Degraded state: installed but no scan data */}
      {isDegraded && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-400 font-medium">{t('cards:kubescapeScan.noScanData')}</p>
            <p className="text-muted-foreground">
              {t('cards:kubescapeScan.installedNoResults')}{' '}
              <button onClick={handleTroubleshoot} className="text-amber-400 hover:underline">
                {t('cards:kubescapeScan.fixWithMission')} →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Per-cluster scores — click to open detail modal */}
      {installed && Object.values(statuses).some(s => s.installed) && (
        <div className="flex flex-wrap gap-1">
          {Object.values(statuses).filter(s => s.installed).map(s => (
            <button key={s.cluster} onClick={() => setModalCluster(s.cluster)} className="cursor-pointer">
              <StatusBadge color={s.overallScore >= 80 ? 'green' : s.overallScore >= 60 ? 'yellow' : 'red'} size="xs">
                {s.cluster}: {s.overallScore}%
              </StatusBadge>
            </button>
          ))}
        </div>
      )}

      <div
        className="cursor-pointer"
        onClick={() => {
          const first = Object.values(statuses).find(s =>
            s.installed && (selectedClusters.length === 0 || selectedClusters.includes(s.cluster))
          )
          if (first) setModalCluster(first.cluster)
        }}
        role="button"
        aria-label={t('cards:kubescapeScan.viewDetailsAria')}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            const first = Object.values(statuses).find(s =>
              s.installed && (selectedClusters.length === 0 || selectedClusters.includes(s.cluster))
            )
            if (first) setModalCluster(first.cluster)
          }
        }}
      >
        {/* Score gauge with context */}
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

        {/* Score context label */}
        {(() => {
          const ctx = getScoreContext(score)
          return (
            <div className="text-center mb-2">
              <span className={`text-xs font-semibold ${ctx.color}`}>{ctx.label}</span>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{ctx.description}</p>
            </div>
          )
        })()}

        {/* Controls summary */}
        <div className="flex items-center justify-center gap-3 mb-2 text-[10px] text-muted-foreground">
          <span>{filtered.passedControls} {t('cards:kubescapeScan.passed')}</span>
          <span className="text-muted-foreground/30">|</span>
          <span className={filtered.failedControls > 0 ? 'text-red-400' : ''}>{filtered.failedControls} {t('cards:kubescapeScan.failed')}</span>
          <span className="text-muted-foreground/30">|</span>
          <span>{filtered.totalControls} {t('cards:kubescapeScan.total')}</span>
        </div>

        {/* Framework list with descriptions */}
        <div className="space-y-1.5">
          {(filtered.frameworks || []).map((fw, i) => {
            const info = getFrameworkInfo(fw.name)
            return (
              <div key={i} className="rounded-md px-2 py-1.5 hover:bg-secondary/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-medium text-foreground truncate">
                      {info?.label || fw.name}
                    </span>
                    {info?.url && (
                      <a
                        href={info.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-muted-foreground/50 hover:text-blue-400 transition-colors flex-shrink-0"
                        title={t('cards:kubescapeScan.viewFrameworkSpec')}
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                  <span className={`text-xs font-bold ${fw.score >= 80 ? 'text-green-400' : fw.score >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {fw.score}%
                  </span>
                </div>
                {info && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{info.description}</p>
                )}
                {/* Score bar */}
                <div className="mt-1 h-1 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${fw.score >= 80 ? 'bg-green-400/60' : fw.score >= 60 ? 'bg-yellow-400/60' : 'bg-red-400/60'}`}
                    style={{ width: `${fw.score}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail Modal */}
      {modalCluster && statuses[modalCluster] && (
        <KubescapeDetailModal
          isOpen={!!modalCluster}
          onClose={() => setModalCluster(null)}
          clusterName={modalCluster}
          status={statuses[modalCluster]}
          onRefresh={() => refetch()}
          isRefreshing={isRefreshing}
        />
      )}
    </div>
  )
}

// ── Policy Violations Aggregated ────────────────────────────────────────

export function PolicyViolations({ config: _config }: CardConfig) {
  const { t } = useTranslation(['common', 'cards'])
  const { statuses: kyvernoStatuses, isLoading: kyvernoLoading, isRefreshing: kyvernoRefreshing, isDemoData: kyvernoDemoData, installed: kyvernoInstalled, hasErrors: kyvernoHasErrors, clustersChecked: kyvernoChecked, totalClusters: kyvernoTotal, refetch: kyvernoRefetch } = useKyverno()
  const { startMission } = useMissions()
  const { selectedClusters } = useGlobalFilters()
  const [modalCluster, setModalCluster] = useState<string | null>(null)
  const [selectedViolation, setSelectedViolation] = useState<{ policy: string; count: number; tool: string; clusters: string[] } | null>(null)

  /** Whether all clusters have been checked */
  const kyvernoAllChecked = kyvernoChecked >= kyvernoTotal && kyvernoTotal > 0

  // Aggregate violations from Kyverno reports. Per-policy violation counts are
  // back-populated from PolicyReport results in the hook, but we also use
  // reports for namespace-level breakdown since some policies may lack result data.
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

  // Detect degraded state: installed but no policies configured
  const isDegraded = (() => {
    if (!kyvernoInstalled || kyvernoLoading) return false
    const installedClusters = Object.values(kyvernoStatuses).filter(s => s.installed)
    return installedClusters.length > 0 && installedClusters.every(s => s.totalPolicies === 0)
  })()

  const handleTroubleshoot = () => {
    const mission = TROUBLESHOOT_MISSIONS.kyverno
    startMission({
      title: mission.title,
      description: mission.description,
      type: 'troubleshoot',
      initialPrompt: mission.prompt,
      context: {} })
  }

  // Clusters contributing Kyverno data (must be before early returns to satisfy hooks rules)
  const participatingClusters = Object.values(kyvernoStatuses).filter(s => s.installed).map(s => s.cluster)

  const hasData = violations.length > 0 || kyvernoDemoData
  // #6219: surface kyverno fetch failures.
  useCardLoadingState({ isLoading: kyvernoLoading && !hasData, isRefreshing: kyvernoRefreshing, hasAnyData: hasData, isDemoData: kyvernoDemoData, isFailed: kyvernoHasErrors })

  if (violations.length === 0 && !kyvernoDemoData) {
    // Still scanning — show loading state instead of definitive empty state
    if (kyvernoLoading || kyvernoRefreshing) {
      return (
        <div className="space-y-3">
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
            <Loader2 className="w-8 h-8 mb-2 opacity-50 animate-spin" />
            <p className="text-sm">{t('cards:policyViolations.scanning')}</p>
            {kyvernoTotal > 0 ? (
              <p className="text-xs mt-1">{t('cards:policyViolations.checkingClusters', { checked: kyvernoChecked, total: kyvernoTotal })}</p>
            ) : (
              <p className="text-xs mt-1">{t('cards:policyViolations.checkingReports')}</p>
            )}
          </div>
        </div>
      )
    }
    // Fetch error state: one or more clusters failed to return scanner data
    if (kyvernoHasErrors) {
      return (
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-400 font-medium">{t('cards:policyViolations.failedToFetch')}</p>
              <p className="text-muted-foreground">
                {t('cards:policyViolations.checkConnectivity')}{' '}
                <button onClick={() => kyvernoRefetch()} className="text-red-400 hover:underline">
                  {t('cards:policyViolations.retry')} →
                </button>
              </p>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="space-y-3">
        {/* Degraded state: installed but no policies */}
        {isDegraded && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-400 font-medium">{t('cards:policyViolations.noPoliciesConfigured')}</p>
              <p className="text-muted-foreground">
                {t('cards:policyViolations.kyvernoNoPolicies')}{' '}
                <button onClick={handleTroubleshoot} className="text-amber-400 hover:underline">
                  {t('cards:policyViolations.fixWithMission')} →
                </button>
              </p>
            </div>
          </div>
        )}
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
          <Shield className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm">{t('cards:policyViolations.noViolationsDetected')}</p>
          <p className="text-xs mt-1">{t('cards:policyViolations.allResourcesComply')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Progressive streaming indicator */}
      {!kyvernoAllChecked && kyvernoTotal > 0 && !kyvernoRefreshing && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{t('cards:policyViolations.checkingClusters', { checked: kyvernoChecked, total: kyvernoTotal })}</span>
        </div>
      )}

      {/* Participating clusters */}
      {participatingClusters.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {participatingClusters.map(cluster => (
            <StatusBadge key={cluster} color="purple" size="xs">{cluster}</StatusBadge>
          ))}
        </div>
      )}

      {/* Context banner */}
      <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground bg-secondary/20 rounded-md px-2 py-1.5">
        <Info className="w-3 h-3 flex-shrink-0 mt-0.5 text-muted-foreground/60" />
        <span>{CARD_DESCRIPTIONS.policy_violations.description}</span>
      </div>

      <div className="space-y-2">
        {(violations || []).map((v, i) => (
          <div
            key={i}
            className="group flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer"
            onClick={() => setSelectedViolation(v)}
            role="button"
            aria-label={t('cards:policyViolations.viewViolationAria', { policy: v.policy })}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setSelectedViolation(v)
              }
            }}
          >
            <div>
              <p className="text-sm font-medium text-foreground">{v.policy}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{v.tool}</span>
                {v.clusters.length > 0 && (
                  <span>· {(v.clusters || []).join(', ')}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge color="orange" size="md">
                {v.count}
              </StatusBadge>
              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        ))}
      </div>

      {/* Kyverno Detail Modal */}
      {modalCluster && kyvernoStatuses[modalCluster] && (
        <KyvernoDetailModal
          isOpen={!!modalCluster}
          onClose={() => setModalCluster(null)}
          clusterName={modalCluster}
          status={kyvernoStatuses[modalCluster]}
          onRefresh={() => kyvernoRefetch()}
          isRefreshing={kyvernoRefreshing}
        />
      )}

      {/* Policy Violation Detail Modal */}
      <PolicyViolationDetailModal
        isOpen={!!selectedViolation}
        onClose={() => setSelectedViolation(null)}
        violation={selectedViolation}
      />
    </div>
  )
}

// ── Compliance Score Gauge ──────────────────────────────────────────────

export function ComplianceScore({ config: _config }: CardConfig) {
  const { t } = useTranslation(['common', 'cards'])
  const { statuses: kubescapeStatuses, aggregated: kubescapeAgg, isLoading: ksLoading, isDemoData: ksDemoData, installed: ksInstalled, hasErrors: ksHasErrors, clustersChecked: ksChecked, totalClusters: ksTotal } = useKubescape()
  const { statuses: kyvernoStatuses, isLoading: kyLoading, isDemoData: kyDemoData, installed: kyInstalled, hasErrors: kyHasErrors, clustersChecked: kyChecked, totalClusters: kyTotal } = useKyverno()
  const { selectedClusters } = useGlobalFilters()
  const { startMission } = useMissions()
  const [showBreakdown, setShowBreakdown] = useState(false)

  const isLoading = ksLoading || kyLoading

  /** Combined progress: use the slower of the two tools' cluster checks */
  const totalChecking = Math.max(ksTotal, kyTotal)
  const minChecked = Math.min(ksChecked, kyChecked)
  const allChecked = minChecked >= totalChecking && totalChecking > 0

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
        usingFallback: true }
    }

    const avg = Math.round(scores.reduce((sum, s) => sum + s.value, 0) / scores.length)
    return { score: avg, breakdown: scores, usingFallback: false }
  }, [kubescapeAgg, kyvernoStatuses, selectedClusters])

  // Kyverno aggregation for breakdown modal
  const kyvernoBreakdownData = useMemo(() => {
    let totalPolicies = 0
    let totalViolations = 0
    let enforcingCount = 0
    let auditCount = 0
    for (const [clusterName, status] of Object.entries(kyvernoStatuses)) {
      if (!status.installed) continue
      if (selectedClusters.length > 0 && !selectedClusters.includes(clusterName)) continue
      totalPolicies += status.totalPolicies
      totalViolations += status.totalViolations
      enforcingCount += status.enforcingCount
      auditCount += status.auditCount
    }
    return totalPolicies > 0 ? { totalPolicies, totalViolations, enforcingCount, auditCount } : undefined
  }, [kyvernoStatuses, selectedClusters])

  // Mark as demo data only when hooks report demo mode (explicit demo or forced Netlify).
  // When compliance tools are not installed, show an install prompt instead of a fake demo score.
  const isDemoData = ksDemoData || kyDemoData

  const handleInstallCompliance = () => {
    startMission({
      title: 'Install Compliance Tools',
      description: 'Install Kubescape and/or Kyverno for compliance score tracking',
      type: 'deploy',
      initialPrompt: COMPLIANCE_INSTALL_PROMPT,
      context: {} })
  }

  const scoreHasData = !usingFallback || isDemoData
  // #6219: card is failed when both Kubescape and Kyverno had errors
  // (single-tool failure still produces a meaningful partial score).
  const scoreFailed = ksHasErrors && kyHasErrors
  useCardLoadingState({ isLoading: isLoading && !scoreHasData, hasAnyData: scoreHasData, isDemoData, isFailed: scoreFailed })

  const scoreCtx = getScoreContext(score)

  // Clusters contributing to the composite score
  const scoreClusters = useMemo(() => {
    const clusters = new Set<string>()
    for (const s of Object.values(kubescapeStatuses)) {
      if (s.installed) clusters.add(s.cluster)
    }
    for (const s of Object.values(kyvernoStatuses)) {
      if (s.installed) clusters.add(s.cluster)
    }
    return Array.from(clusters)
  }, [kubescapeStatuses, kyvernoStatuses])

  // Whether no compliance tools are installed (and we've finished loading)
  const noToolsInstalled = !isLoading && !ksInstalled && !kyInstalled && !isDemoData

  return (
    <div className="space-y-3">
      {/* Progressive streaming indicator */}
      {!allChecked && totalChecking > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{t('cards:complianceScore.checkingClusters', { checked: minChecked, total: totalChecking })}</span>
        </div>
      )}

      {/* Participating clusters */}
      {scoreClusters.length > 0 && !isDemoData && (
        <div className="flex flex-wrap gap-1">
          {scoreClusters.map(cluster => (
            <StatusBadge key={cluster} color="purple" size="xs">{cluster}</StatusBadge>
          ))}
        </div>
      )}

      {/* Context description */}
      <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground bg-secondary/20 rounded-md px-2 py-1.5">
        <Info className="w-3 h-3 flex-shrink-0 mt-0.5 text-muted-foreground/60" />
        <span>{CARD_DESCRIPTIONS.compliance_score.description}</span>
      </div>

      {/* Partial coverage warning — not all clusters are reporting */}
      {!isDemoData && !usingFallback && allChecked && totalChecking > 0 && scoreClusters.length < totalChecking && (
        <div className="flex items-center gap-1.5 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-md px-2 py-1.5">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          <span>
            {t('cards:complianceScore.partialCoverage', { reporting: scoreClusters.length, total: totalChecking })}
          </span>
        </div>
      )}

      {/* No compliance tools installed — show install prompt instead of fake demo score */}
      {noToolsInstalled && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-cyan-400 font-medium">{t('cards:complianceScore.noToolsDetected')}</p>
            <p className="text-muted-foreground">
              {t('cards:complianceScore.installDescription')}{' '}
              <button onClick={handleInstallCompliance} className="text-cyan-400 hover:underline">
                {t('cards:complianceScore.installWithMission')} →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Score chart — only shown when real data exists or in demo mode */}
      {!noToolsInstalled && (
        <>
          <div
            className="flex items-center justify-center py-4 cursor-pointer group"
            onClick={() => setShowBreakdown(true)}
            role="button"
            aria-label={t('cards:complianceScore.viewBreakdownAria')}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setShowBreakdown(true)
              }
            }}
            title={t('cards:complianceScore.clickForBreakdown')}
          >
            <div className="relative w-24 h-24 group-hover:scale-105 transition-transform">
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

          {/* Score context */}
          <div className="text-center">
            <span className={`text-xs font-semibold ${scoreCtx.color}`}>{scoreCtx.label}</span>
            <p className="text-[10px] text-muted-foreground mt-0.5">{scoreCtx.description}</p>
          </div>

          {/* Breakdown by tool */}
          <div className="space-y-1.5">
            {(breakdown || []).map((item, i) => (
              <div key={i} className="flex items-center gap-2 px-1">
                <span className="text-xs text-muted-foreground w-20 truncate">{item.name}</span>
                <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${item.value >= 80 ? 'bg-green-400/60' : item.value >= 60 ? 'bg-yellow-400/60' : 'bg-red-400/60'}`}
                    style={{ width: `${item.value}%` }}
                  />
                </div>
                <span className={`text-xs font-medium w-10 text-right ${item.value >= 80 ? 'text-green-400' : item.value >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {item.value}%
                </span>
              </div>
            ))}
          </div>

          {/* Breakdown Modal */}
          <ComplianceScoreBreakdownModal
            isOpen={showBreakdown}
            onClose={() => setShowBreakdown(false)}
            score={score}
            breakdown={breakdown}
            kubescapeData={kubescapeAgg.totalControls > 0 ? {
              totalControls: kubescapeAgg.totalControls,
              passedControls: kubescapeAgg.passedControls,
              failedControls: kubescapeAgg.failedControls,
              frameworks: kubescapeAgg.frameworks || [] } : undefined}
            kyvernoData={kyvernoBreakdownData}
          />
        </>
      )}
    </div>
  )
}
