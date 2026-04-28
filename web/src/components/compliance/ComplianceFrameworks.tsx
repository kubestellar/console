/**
 * ComplianceFrameworks — Named regulatory compliance framework evaluation page.
 *
 * Shows PCI-DSS 4.0, SOC 2 Type II, and other frameworks with per-control
 * pass/fail results and an overall compliance score.
 *
 * NOTE (#9769): This component previously called `useClusters()` directly
 * just to populate the cluster dropdown. That heavyweight hook subscribes
 * to the shared cluster cache and triggers re-renders on every cache update
 * (health checks, WS pings, etc.). Combined with VersionCheckProvider
 * cascading re-renders through EnterpriseLayout, this produced React error
 * #185 ("Cannot update a component while rendering a different component").
 * Fix: replaced useClusters() with a lightweight `useClusterNames()` hook
 * that subscribes via useSyncExternalStore and only re-renders when the
 * actual list of cluster names changes.
 */
import { useState, useMemo, useEffect, useCallback, useSyncExternalStore, memo } from 'react'
import { Shield, ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertTriangle, MinusCircle, Loader2 } from 'lucide-react'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { complianceFrameworksDashboardConfig } from '../../config/dashboards/compliance-frameworks'
import { useComplianceFrameworks, useFrameworkEvaluation, type Framework, type ControlResult, type ComplianceCheck } from '../../hooks/useComplianceFrameworks'
import { clusterCache, subscribeClusterData } from '../../hooks/mcp/shared'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'

/* ────────── status badge helpers ────────── */

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  pass:    { icon: CheckCircle2,  color: 'text-emerald-400', label: 'Pass' },
  fail:    { icon: XCircle,       color: 'text-red-400',     label: 'Fail' },
  partial: { icon: AlertTriangle, color: 'text-yellow-400',  label: 'Partial' },
  error:   { icon: MinusCircle,   color: 'text-orange-400',  label: 'Error' },
  skipped: { icon: MinusCircle,   color: 'text-zinc-500',    label: 'Skipped' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.skipped
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  )
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-500/20 text-red-300 border-red-500/30',
    high:     'bg-orange-500/20 text-orange-300 border-orange-500/30',
    medium:   'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    low:      'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
  }
  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${colors[severity] ?? colors.low}`}>
      {severity.toUpperCase()}
    </span>
  )
}

/* ────────── score ring ────────── */

function ScoreRing({ score }: { score: number }) {
  const r = 36
  const c = 2 * Math.PI * r
  const pct = Math.min(Math.max(score, 0), 100)
  const offset = c - (pct / 100) * c
  const ringColor = pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400'

  return (
    <div className="relative inline-flex items-center justify-center w-28 h-28">
      <svg className="transform -rotate-90" width={80} height={80}>
        <circle cx={40} cy={40} r={r} className="stroke-zinc-800" strokeWidth={6} fill="none" />
        <circle
          cx={40} cy={40} r={r}
          stroke="currentColor"
          strokeWidth={6}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`transition-all duration-700 ${ringColor}`}
        />
      </svg>
      <span className="absolute text-lg font-bold text-white">{pct.toFixed(0)}%</span>
    </div>
  )
}

/* ────────── check row ────────── */

function CheckRow({ check }: { check: ComplianceCheck }) {
  return (
    <div className="flex items-start gap-3 py-2 px-3 rounded-md bg-zinc-900/50 hover:bg-zinc-800/50 transition-colors">
      <StatusBadge status={check.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-200 truncate">{check.name}</span>
          <SeverityBadge severity={check.severity} />
        </div>
        {check.message && <p className="text-[11px] text-muted-foreground mt-0.5">{check.message}</p>}
        {check.status !== 'pass' && check.remediation && (
          <p className="text-[11px] text-blue-400 mt-0.5">💡 {check.remediation}</p>
        )}
      </div>
    </div>
  )
}

/* ────────── control accordion ────────── */

function ControlAccordion({ control }: { control: ControlResult }) {
  const [open, setOpen] = useState(control.status !== 'pass')
  const Icon = open ? ChevronDown : ChevronRight

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-900/70 hover:bg-zinc-800/50 transition-colors text-left"
        onClick={() => setOpen(v => !v)}
        type="button"
      >
        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
        <StatusBadge status={control.status} />
        <span className="text-sm font-medium text-zinc-200 flex-1 truncate">{control.id}: {control.name}</span>
        <span className="text-xs text-zinc-500">{control.checks.length} checks</span>
      </button>
      {open && (
        <div className="px-4 py-2 space-y-1.5 bg-zinc-950/50">
          {control.checks.map(ch => <CheckRow key={ch.id} check={ch} />)}
        </div>
      )}
    </div>
  )
}

/* ────────── framework card ────────── */

function FrameworkCard({ fw, selected, onSelect }: { fw: Framework; selected: boolean; onSelect: () => void }) {
  return (
    <button
      className={`text-left p-4 rounded-lg border transition-all ${
        selected
          ? 'border-blue-500/60 bg-blue-500/10 shadow-lg shadow-blue-500/5'
          : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
      }`}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-center gap-2 mb-1">
        <Shield className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-semibold text-zinc-100">{fw.name}</span>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{fw.description}</p>
      <div className="flex gap-3 text-[11px] text-zinc-500">
        <span>{fw.controls} controls</span>
        <span>{fw.checks} checks</span>
        <span className="capitalize">{fw.category}</span>
      </div>
    </button>
  )
}

/* ────────── lightweight cluster names hook (#9769) ────────── */

/**
 * Subscribe callback adapter for useSyncExternalStore.
 * Wraps the data-subscriber API so we can pass it to useSyncExternalStore.
 */
function subscribeClusterNames(onStoreChange: () => void): () => void {
  return subscribeClusterData(() => onStoreChange())
}

/**
 * Snapshot function for useSyncExternalStore.
 * Returns a *stable* comma-joined string of cluster names so React can
 * cheaply compare snapshots with Object.is. The component splits this
 * back into an array via useMemo.
 */
function getClusterNamesSnapshot(): string {
  return clusterCache.clusters.map(c => c.name).join('\0')
}

/**
 * Lightweight hook that returns only cluster names.
 * Unlike useClusters(), this does NOT subscribe to UI-indicator updates
 * (isLoading, isRefreshing, error) or heavy data slices, so it only
 * triggers a re-render when the set of cluster names actually changes.
 */
function useClusterNames(): string[] {
  const snapshot = useSyncExternalStore(subscribeClusterNames, getClusterNamesSnapshot)
  return useMemo(
    () => (snapshot ? snapshot.split('\0') : []),
    [snapshot],
  )
}

/* ────────── main page ────────── */

export const ComplianceFrameworksContent = memo(function ComplianceFrameworksContent() {
  const { frameworks, isLoading: fwLoading, error: fwError, refetch } = useComplianceFrameworks()
  const clusterNames = useClusterNames()
  const { result, isEvaluating, error: evalError, evaluate } = useFrameworkEvaluation()

  const [selectedFwId, setSelectedFwId] = useState<string | null>(null)
  const [selectedCluster, setSelectedCluster] = useState<string>('')
  const [autoRefresh, setAutoRefresh] = useState(false)

  // Stable ID of the first framework — avoids re-running the effect when the
  // frameworks array gets a new reference but its contents haven't changed.
  const firstFwId = frameworks.length > 0 ? frameworks[0].id : null

  // Auto-select first framework when loaded
  useEffect(() => {
    if (!selectedFwId && firstFwId) {
      setSelectedFwId(firstFwId)
    }
  }, [firstFwId, selectedFwId])

  const firstClusterName = clusterNames.length > 0 ? clusterNames[0] : null

  // Auto-select first cluster
  useEffect(() => {
    if (!selectedCluster && firstClusterName) {
      setSelectedCluster(firstClusterName)
    }
  }, [firstClusterName, selectedCluster])

  const selectedFw = useMemo(() => {
    if (selectedFwId) return frameworks.find(f => f.id === selectedFwId) ?? null
    return null
  }, [frameworks, selectedFwId])

  const handleEvaluate = useCallback(() => {
    if (selectedFw && selectedCluster) {
      evaluate(selectedFw.id, selectedCluster)
    }
  }, [selectedFw, selectedCluster, evaluate])

  /* ────────── render ────────── */

  if (fwLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading frameworks…
      </div>
    )
  }

  if (fwError) {
    return (
      <div className="p-6 text-red-400">
        <p className="font-medium">Failed to load frameworks</p>
        <p className="text-sm mt-1">{fwError}</p>
        <button onClick={refetch} className="mt-3 text-sm text-blue-400 hover:underline" type="button">
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <DashboardHeader
        title="Compliance Frameworks"
        subtitle="Evaluate clusters against PCI-DSS 4.0, SOC 2 Type II, and other regulatory standards"
        isFetching={fwLoading}
        onRefresh={refetch}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="frameworks-auto-refresh"
        rightExtra={<RotatingTip page="compliance" />}
      />

      {/* Framework picker */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {frameworks.map(fw => (
          <FrameworkCard
            key={fw.id}
            fw={fw}
            selected={fw.id === selectedFwId}
            onSelect={() => setSelectedFwId(fw.id)}
          />
        ))}
      </div>

      {/* Evaluate bar */}
      {selectedFw && (
        <div className="flex items-center gap-4 p-4 rounded-lg border border-zinc-800 bg-zinc-900/60">
          <span className="text-sm text-zinc-300 font-medium whitespace-nowrap">
            Evaluate <span className="text-blue-400">{selectedFw.name}</span> on:
          </span>
          <select
            value={selectedCluster}
            onChange={e => setSelectedCluster(e.target.value)}
            className="flex-1 max-w-xs bg-zinc-800 text-zinc-200 text-sm rounded-md border border-zinc-700 px-3 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          >
            {clusterNames.length === 0 && <option value="">No clusters available</option>}
            {clusterNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <button
            onClick={handleEvaluate}
            disabled={isEvaluating || !selectedCluster}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-md transition-colors flex items-center gap-2"
            type="button"
          >
            {isEvaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            {isEvaluating ? 'Evaluating…' : 'Run Evaluation'}
          </button>
        </div>
      )}

      {/* Error */}
      {evalError && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {evalError}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Score summary */}
          <div className="flex items-center gap-8 p-6 rounded-lg border border-zinc-800 bg-zinc-900/60">
            <ScoreRing score={result.score} />
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-white">{result.framework_name}</h2>
              <p className="text-sm text-muted-foreground">
                Cluster: <span className="text-zinc-200">{result.cluster}</span>
              </p>
              <div className="flex gap-4 text-sm">
                <span className="text-emerald-400">✓ {result.passed} passed</span>
                <span className="text-red-400">✗ {result.failed} failed</span>
                <span className="text-yellow-400">◐ {result.partial} partial</span>
                {result.skipped > 0 && <span className="text-zinc-500">— {result.skipped} skipped</span>}
              </div>
              <p className="text-xs text-zinc-500">
                Evaluated at {new Date(result.evaluated_at).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Control-by-control results */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
              Controls ({result.controls.length})
            </h3>
            {result.controls.map(ctrl => (
              <ControlAccordion key={ctrl.id} control={ctrl} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!result && !isEvaluating && selectedFw && (
        <div className="text-center py-12 text-zinc-500">
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a framework and cluster, then click <strong>Run Evaluation</strong></p>
        </div>
      )}
    </div>
  )
})

export default function ComplianceFrameworks() {
  return (<>
    <ComplianceFrameworksContent />
    <UnifiedDashboard config={complianceFrameworksDashboardConfig} />
  </>)
}
