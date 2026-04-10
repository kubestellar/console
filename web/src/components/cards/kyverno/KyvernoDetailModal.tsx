/**
 * Kyverno Detail Modal — drill-down view for a cluster's Kyverno data.
 *
 * Two tabs:
 * - Policies: searchable list of policies with status, category, violations
 * - Reports: per-namespace PolicyReport pass/fail/warn/error/skip stacked bars
 *
 * Follows the ClusterOPAModal pattern using BaseModal compound components.
 */

import { useState, useMemo } from 'react'
import { Shield, FileCheck, BarChart3, Search, ExternalLink, Sparkles, AlertTriangle, ChevronRight } from 'lucide-react'
import { BaseModal } from '../../../lib/modals'
import { StatusBadge } from '../../ui/StatusBadge'
import { RefreshButton } from '../../ui/RefreshIndicator'
import { useMissions } from '../../../hooks/useMissions'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue'
import type { KyvernoClusterStatus, KyvernoPolicy, KyvernoPolicyReport } from '../../../hooks/useKyverno'

/** Search input debounce delay (#6213). */
const SEARCH_DEBOUNCE_MS = 250

type KyvernoTab = 'policies' | 'reports'

/** Minimum report failure count to highlight in the UI */
const REPORT_HIGHLIGHT_THRESHOLD = 0

interface KyvernoDetailModalProps {
  isOpen: boolean
  onClose: () => void
  clusterName: string
  status: KyvernoClusterStatus
  onRefresh: () => void
  isRefreshing?: boolean
}

export function KyvernoDetailModal({
  isOpen,
  onClose,
  clusterName,
  status,
  onRefresh,
  isRefreshing = false }: KyvernoDetailModalProps) {
  const [activeTab, setActiveTab] = useState<KyvernoTab>('policies')
  const [search, setSearch] = useState('')
  // #6213: debounce the heavy filter for policy lists with 100+ entries.
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS)
  const { startMission } = useMissions()
  const { drillToPolicy } = useDrillDownActions()

  const handlePolicyClick = (policy: KyvernoPolicy) => {
    onClose()
    drillToPolicy(policy.cluster, policy.namespace, policy.name, {
      policyType: 'kyverno',
      kind: policy.kind,
      status: policy.status,
      category: policy.category,
      description: policy.description,
      violationCount: policy.violations,
      background: policy.background })
  }

  const tabs = [
    { id: 'policies' as const, label: 'Policies', icon: FileCheck, badge: status.totalPolicies },
    { id: 'reports' as const, label: 'Reports', icon: BarChart3, badge: (status.reports || []).length },
  ]

  // Filter policies by debounced search (#6213).
  const filteredPolicies = useMemo(() => {
    const policies = status.policies || []
    if (!debouncedSearch.trim()) return policies
    const q = debouncedSearch.toLowerCase()
    return policies.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.status?.toLowerCase().includes(q)
    )
  }, [status.policies, debouncedSearch])

  // Sort reports by failures descending
  const sortedReports = [...(status.reports || [])].sort((a, b) => b.fail - a.fail)

  const handleDeploySamplePolicies = () => {
    onClose()
    startMission({
      title: 'Deploy Sample Kyverno Policies',
      description: 'Deploy audit-mode sample policies to see Kyverno in action',
      type: 'deploy',
      cluster: clusterName,
      initialPrompt: `Deploy 4 sample Kyverno audit-mode policies to cluster "${clusterName}" so I can see the compliance dashboard in action.

Please create and apply these ClusterPolicies in audit mode (validationFailureAction: Audit):

1. **require-labels** — Require 'app.kubernetes.io/name' and 'app.kubernetes.io/managed-by' labels on all Pods
2. **disallow-privileged-containers** — Disallow privileged containers (securityContext.privileged: true)
3. **restrict-image-registries** — Only allow images from docker.io, gcr.io, ghcr.io, quay.io
4. **require-resource-limits** — Require CPU and memory resource limits on all containers

Important:
- Set validationFailureAction to "Audit" on ALL policies (never Enforce)
- Set background: true so existing resources are scanned
- Add appropriate categories via annotations (policies.kyverno.io/category)
- After applying, verify with: kubectl get clusterpolicies
- Check PolicyReports are generated: kubectl get policyreports -A

Please proceed step by step.`,
      context: { clusterName } })
  }

  const getStatusColor = (policyStatus: string): 'green' | 'yellow' | 'blue' => {
    switch (policyStatus) {
      case 'enforcing': return 'green'
      case 'audit': return 'yellow'
      default: return 'blue'
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Pod Security': return 'text-red-400'
      case 'Best Practices': return 'text-blue-400'
      case 'Supply Chain': return 'text-purple-400'
      case 'Network': return 'text-cyan-400'
      case 'Resources': return 'text-orange-400'
      default: return 'text-muted-foreground'
    }
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg" closeOnBackdrop={false}>
      <BaseModal.Header
        title={`Kyverno — ${clusterName}`}
        icon={Shield}
        onClose={onClose}
        extra={
          <RefreshButton
            isRefreshing={isRefreshing}
            onRefresh={onRefresh}
            size="sm"
          />
        }
      />

      <BaseModal.Tabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as KyvernoTab)}
      />

      <BaseModal.Content>
        {activeTab === 'policies' && (
          <div className="space-y-4">
            {/* Search + Deploy Sample */}
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search policies..."
                  className="w-full pl-9 pr-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              {status.totalPolicies === 0 && (
                <button
                  onClick={handleDeploySamplePolicies}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors text-sm font-medium whitespace-nowrap"
                >
                  <Sparkles className="w-4 h-4" />
                  Deploy Sample Policies
                </button>
              )}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-3">
              <StatBox label="Total" value={status.totalPolicies} color="text-foreground" />
              <StatBox label="Enforcing" value={status.enforcingCount} color="text-green-400" />
              <StatBox label="Audit" value={status.auditCount} color="text-yellow-400" />
              <StatBox label="Violations" value={status.totalViolations} color="text-red-400" />
            </div>

            {/* Policies list */}
            {filteredPolicies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {status.totalPolicies === 0
                  ? 'No policies configured. Deploy sample policies to get started.'
                  : 'No policies match your search.'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredPolicies.map((policy, i) => (
                  <PolicyRow key={`${policy.name}-${i}`} policy={policy} getStatusColor={getStatusColor} getCategoryColor={getCategoryColor} onClick={handlePolicyClick} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-4">
            {sortedReports.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No PolicyReports found. Reports are generated after policies are applied.
              </div>
            ) : (
              <>
                {/* Legend */}
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500" /> Pass</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> Fail</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-500" /> Warn</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500" /> Error</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-zinc-500" /> Skip</span>
                </div>

                {/* Report rows with stacked bars */}
                <div className="space-y-3">
                  {sortedReports.map((report, i) => (
                    <ReportBar key={`${report.namespace}-${i}`} report={report} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </BaseModal.Content>

      <BaseModal.Footer>
        <a
          href="https://kyverno.io/docs/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-purple-400 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Kyverno Docs
        </a>
      </BaseModal.Footer>
    </BaseModal>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="p-3 rounded-lg bg-secondary/30 text-center">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function PolicyRow({
  policy,
  getStatusColor,
  getCategoryColor,
  onClick }: {
  policy: KyvernoPolicy
  getStatusColor: (s: string) => 'green' | 'yellow' | 'blue'
  getCategoryColor: (c: string) => string
  onClick: (policy: KyvernoPolicy) => void
}) {
  return (
    <div
      className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group"
      onClick={() => onClick(policy)}
      role="button"
      aria-label={`View policy insights: ${policy.name}`}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(policy) } }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">{policy.name}</span>
          <StatusBadge color={getStatusColor(policy.status)} size="xs">
            {policy.status}
          </StatusBadge>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {policy.violations > 0 && (
            <span className="flex items-center gap-1 text-xs text-yellow-400">
              <AlertTriangle className="w-3 h-3" />
              {policy.violations}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{policy.kind}</span>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-purple-400 transition-colors" />
        </div>
      </div>
      {policy.description && (
        <p className="text-xs text-muted-foreground mb-1 line-clamp-1">{policy.description}</p>
      )}
      <div className="flex items-center gap-2 text-xs">
        <span className={getCategoryColor(policy.category)}>{policy.category}</span>
        {policy.namespace && (
          <span className="text-muted-foreground">ns: {policy.namespace}</span>
        )}
      </div>
    </div>
  )
}

function ReportBar({ report }: { report: KyvernoPolicyReport }) {
  const total = report.pass + report.fail + report.warn + report.error + report.skip
  if (total === 0) return null

  const segments = [
    { value: report.pass, color: 'bg-green-500', label: 'pass' },
    { value: report.fail, color: 'bg-red-500', label: 'fail' },
    { value: report.warn, color: 'bg-yellow-500', label: 'warn' },
    { value: report.error, color: 'bg-orange-500', label: 'error' },
    { value: report.skip, color: 'bg-zinc-500', label: 'skip' },
  ].filter(s => s.value > 0)

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-mono text-foreground">{report.namespace}</span>
        <span className="text-muted-foreground">
          {report.fail > REPORT_HIGHLIGHT_THRESHOLD && (
            <span className="text-red-400 font-medium mr-2">{report.fail} fail</span>
          )}
          {total} total
        </span>
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-secondary/50">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={`${seg.color} transition-all`}
            style={{ width: `${(seg.value / total) * 100}%` }}
            title={`${seg.label}: ${seg.value}`}
          />
        ))}
      </div>
    </div>
  )
}
