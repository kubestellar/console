/**
 * DataResidency — Data residency enforcement dashboard.
 *
 * Shows a world-map-style view of cluster regions, data classification rules,
 * and violations where workloads are running outside their allowed jurisdictions.
 */
import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { dataResidencyDashboardConfig } from '../../config/dashboards/data-residency'
import { ShieldAlert, MapPin, CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { authFetch } from '../../lib/api'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'
import { Select } from '../ui/Select'

/* ─── Types ─── */

interface ResidencyRule {
  id: string
  classification: string
  allowed_regions: string[]
  description: string
  enforcement: string
}

interface ClusterRegion {
  cluster: string
  region: string
  jurisdiction: string
}

interface Violation {
  id: string
  cluster: string
  cluster_region: string
  namespace: string
  workload_name: string
  workload_kind: string
  classification: string
  allowed_regions: string[]
  severity: string
  detected_at: string
  message: string
}

interface ResidencySummary {
  total_rules: number
  total_clusters: number
  total_violations: number
  by_severity: Record<string, number>
  by_region: Record<string, number>
  compliant: number
  non_compliant: number
}

/* ─── Severity badge ─── */

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
  high:     'bg-orange-500/20 text-orange-300 border-orange-500/30',
  medium:   'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  low:      'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
}

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.low}`}>
      {severity}
    </span>
  )
}

const ENFORCEMENT_STYLES: Record<string, { icon: typeof ShieldAlert; color: string; label: string }> = {
  deny:  { icon: XCircle,       color: 'text-red-400',    label: 'Deny' },
  warn:  { icon: AlertTriangle, color: 'text-yellow-400', label: 'Warn' },
  audit: { icon: CheckCircle2,  color: 'text-zinc-400',   label: 'Audit' },
}

const REGION_LABELS: Record<string, string> = {
  eu: '🇪🇺 EU', us: '🇺🇸 US', apac: '🌏 APAC', ca: '🇨🇦 Canada', uk: '🇬🇧 UK', global: '🌍 Global',
}

/* ─── Main Component ─── */

export const DataResidencyContent = memo(function DataResidencyContent() {
  const [summary, setSummary] = useState<ResidencySummary | null>(null)
  const [rules, setRules] = useState<ResidencyRule[]>([])
  const [clusters, setClusters] = useState<ClusterRegion[]>([])
  const [violations, setViolations] = useState<Violation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterSeverity, setFilterSeverity] = useState<string>('all')
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [summaryRes, rulesRes, clustersRes, violationsRes] = await Promise.all([
        authFetch('/api/compliance/residency/summary'),
        authFetch('/api/compliance/residency/rules'),
        authFetch('/api/compliance/residency/clusters'),
        authFetch('/api/compliance/residency/violations'),
      ])

      if (!summaryRes.ok || !rulesRes.ok || !clustersRes.ok || !violationsRes.ok) {
        throw new Error('Failed to load residency data')
      }

      const [summaryData, rulesData, clustersData, violationsData] = await Promise.all([
        summaryRes.json(),
        rulesRes.json(),
        clustersRes.json(),
        violationsRes.json(),
      ])

      setSummary(summaryData ?? null)
      setRules(Array.isArray(rulesData) ? rulesData : [])
      setClusters(Array.isArray(clustersData) ? clustersData : [])
      setViolations(Array.isArray(violationsData) ? violationsData : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredViolations = useMemo(() =>
    filterSeverity === 'all'
      ? violations
      : violations.filter(v => v.severity === filterSeverity),
    [violations, filterSeverity]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-red-400 font-medium">{error}</p>
        <button onClick={fetchData} className="text-indigo-400 hover:text-indigo-300 text-sm flex items-center gap-1 min-h-11 min-w-11 px-3 py-2">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Data Residency Enforcement"
        subtitle="Ensure workloads with sensitive data only run in approved geographic regions"
        isFetching={loading}
        onRefresh={fetchData}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="data-residency-auto-refresh"
        rightExtra={<RotatingTip page="compliance" />}
      />

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Rules" value={summary.total_rules} icon={<ShieldAlert className="w-5 h-5 text-indigo-400" />} />
          <SummaryCard label="Clusters" value={summary.total_clusters} icon={<MapPin className="w-5 h-5 text-blue-400" />} />
          <SummaryCard label="Compliant" value={summary.compliant} icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />} />
          <SummaryCard label="Violations" value={summary.total_violations} icon={<XCircle className="w-5 h-5 text-red-400" />} accent={summary.total_violations > 0 ? 'red' : undefined} />
        </div>
      )}

      {/* Region Map */}
      <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-6">
        <h2 className="text-lg font-medium text-zinc-200 mb-4 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-blue-400" />
          Cluster Regions
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {clusters.map(cr => {
            const hasViolations = violations.some(v => v.cluster === cr.cluster)
            return (
              <div key={cr.cluster} className={`rounded-lg border p-3 ${hasViolations ? 'border-red-500/40 bg-red-500/5' : 'border-zinc-700/50 bg-zinc-900/30'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-zinc-200">{cr.cluster}</span>
                  {hasViolations ? <XCircle className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                </div>
                <div className="text-xs text-zinc-400">
                  {REGION_LABELS[cr.region] ?? cr.region} · {cr.jurisdiction}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Rules */}
      <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-6">
        <h2 className="text-lg font-medium text-zinc-200 mb-4 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-indigo-400" />
          Residency Rules ({rules.length})
        </h2>
        <div className="space-y-2">
          {rules.map(rule => {
            const enforcement = ENFORCEMENT_STYLES[rule.enforcement] ?? ENFORCEMENT_STYLES.audit
            const EnfIcon = enforcement.icon
            return (
              <div key={rule.id} className="rounded-lg border border-zinc-700/30 bg-zinc-900/30 p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-zinc-700/50 px-1.5 py-0.5 rounded text-zinc-300">{rule.classification}</code>
                    <span className={`text-xs flex items-center gap-1 ${enforcement.color}`}>
                      <EnfIcon className="w-3 h-3" /> {enforcement.label}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {(rule.allowed_regions || []).map(r => (
                      <span key={r} className="text-xs bg-zinc-700/30 px-1.5 py-0.5 rounded text-zinc-400">{REGION_LABELS[r] ?? r}</span>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-zinc-500">{rule.description}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Violations */}
      <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-zinc-200 flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-400" />
            Violations ({filteredViolations.length})
          </h2>
          <div className="w-40">
            <Select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} selectSize="sm">
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
          </div>
        </div>

        {filteredViolations.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-8">No violations found</p>
        ) : (
          <div className="space-y-2">
            {filteredViolations.map(v => (
              <div key={v.id} className="rounded-lg border border-zinc-700/30 bg-zinc-900/30 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={v.severity} />
                    <span className="text-sm font-medium text-zinc-200">{v.workload_kind}/{v.workload_name}</span>
                  </div>
                  <code className="text-xs text-zinc-500">{v.cluster} ({REGION_LABELS[v.cluster_region] ?? v.cluster_region})</code>
                </div>
                <p className="text-xs text-zinc-400">{v.message}</p>
                <div className="flex gap-2 mt-1.5 text-xs text-zinc-500">
                  <span>Namespace: {v.namespace}</span>
                  <span>·</span>
                  <span>Allowed: {(v.allowed_regions || []).map(r => REGION_LABELS[r] ?? r).join(', ')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})

/* ─── Summary Card ─── */

function SummaryCard({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-zinc-400">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${accent === 'red' ? 'text-red-400' : 'text-zinc-100'}`}>{value}</p>
    </div>
  )
}

export default function DataResidency() {
  return (<>
    <DataResidencyContent />
    <UnifiedDashboard config={dataResidencyDashboardConfig} />
  </>)
}
