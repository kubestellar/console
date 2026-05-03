/**
 * ISO 27001 Security Audit Card
 *
 * Runs automated compliance checks against connected clusters via kc-agent.
 * Falls back to demo data when agent is unavailable.
 * 70 controls across 14 categories mapped to ISO 27001.
 */

import { useTranslation } from 'react-i18next'
import { Shield, CheckCircle2, XCircle, AlertTriangle, MinusCircle, Terminal, ChevronDown, ChevronRight } from 'lucide-react'
import { useCachedISO27001Audit, type ISO27001Finding } from '../../hooks/useCachedData'
import { useCardLoadingState, useCardDemoState } from './CardDataContext'
import { useCardData } from '../../lib/cards/cardHooks'
import { CardClusterFilter, CardSearchInput, CardSkeleton } from '../../lib/cards/CardComponents'
import { CardControls } from '../ui/CardControls'
import { Pagination } from '../ui/Pagination'
import { RefreshIndicator } from '../ui/RefreshIndicator'
import { useState } from 'react'

// ── Demo Data ──────────────────────────────────────────────────────

function getDemoFindings(): ISO27001Finding[] {
  const clusters = ['eks-prod-us-east-1', 'gke-staging', 'aks-dev-westeu']
  const findings: ISO27001Finding[] = []

  for (const cluster of clusters) {
    findings.push(
      { checkId: 'rbac-1', category: 'RBAC & Access Control', label: 'No cluster-admin bindings outside kube-system', status: 'fail', cluster, severity: 'critical', details: 'Found 3 cluster-admin bindings in default namespace' },
      { checkId: 'rbac-2', category: 'RBAC & Access Control', label: 'ServiceAccounts use least-privilege Roles', status: 'pass', cluster, severity: 'high', details: 'All service accounts scoped to namespace roles' },
      { checkId: 'rbac-3', category: 'RBAC & Access Control', label: 'No wildcard permissions (*) in production', status: 'fail', cluster, severity: 'critical', details: '2 roles with wildcard verbs detected' },
      { checkId: 'net-1', category: 'Network Policies', label: 'Default-deny ingress in all namespaces', status: 'fail', cluster, severity: 'high', details: '5 namespaces missing default-deny ingress policy' },
      { checkId: 'net-2', category: 'Network Policies', label: 'Default-deny egress policy', status: 'fail', cluster, severity: 'high', details: '8 namespaces missing default-deny egress policy' },
      { checkId: 'sec-1', category: 'Secrets Management', label: 'etcd encryption enabled (KMS)', status: 'pass', cluster, severity: 'critical', details: 'KMS encryption provider configured' },
      { checkId: 'sec-2', category: 'Secrets Management', label: 'No secrets in ConfigMaps or env vars', status: 'warning', cluster, severity: 'high', details: 'Found 1 suspicious ConfigMap with base64-encoded data' },
      { checkId: 'pod-1', category: 'Pod Security', label: 'Pod Security Standards enforced (restricted)', status: 'pass', cluster, severity: 'high', details: 'PSS restricted level enforced via admission controller' },
      { checkId: 'pod-2', category: 'Pod Security', label: 'No privileged containers', status: 'fail', cluster, severity: 'critical', details: '2 pods running with privileged: true' },
      { checkId: 'pod-3', category: 'Pod Security', label: 'runAsNonRoot enforced', status: 'fail', cluster, severity: 'high', details: '12 pods missing runAsNonRoot' },
      { checkId: 'pod-4', category: 'Pod Security', label: 'Read-only root filesystem', status: 'warning', cluster, severity: 'medium', details: '8 pods without readOnlyRootFilesystem' },
      { checkId: 'pod-5', category: 'Pod Security', label: 'No hostPath volumes', status: 'pass', cluster, severity: 'high', details: 'No hostPath volumes detected' },
      { checkId: 'img-1', category: 'Image Security', label: 'Images from trusted registries only', status: 'warning', cluster, severity: 'high', details: '3 images from docker.io (not private registry)' },
      { checkId: 'img-4', category: 'Image Security', label: 'No latest tag in production', status: 'fail', cluster, severity: 'medium', details: '4 containers using :latest tag' },
      { checkId: 'log-1', category: 'Logging & Auditing', label: 'Kubernetes audit logging enabled', status: 'pass', cluster, severity: 'high', details: 'Audit policy configured with RequestResponse level' },
      { checkId: 'adm-1', category: 'Admission Controllers', label: 'PodSecurity admission controller enabled', status: 'pass', cluster, severity: 'high', details: 'PodSecurity admission controller active' },
      { checkId: 'cfg-1', category: 'Cluster Configuration', label: 'Kubernetes version supported and up to date', status: 'pass', cluster, severity: 'medium', details: 'Running v1.29.2 (supported)' },
      { checkId: 'cfg-4', category: 'Cluster Configuration', label: 'Cloud metadata API access filtered', status: 'fail', cluster, severity: 'high', details: 'No NetworkPolicy blocking 169.254.169.254' },
    )
  }
  return findings
}

// ── Verify commands for categories ─────────────────────────────────

const VERIFY_COMMANDS: Record<string, string> = {
  'RBAC & Access Control': 'kubectl get clusterrolebindings -o json | jq \'.items[] | select(.roleRef.name=="cluster-admin")\'',
  'Network Policies': 'kubectl get networkpolicies -A',
  'Secrets Management': 'kubectl get secrets -A -o json | jq -r \'.items[].metadata.name\'',
  'Pod Security': 'kubectl get pods -A -o json | jq \'.items[] | select(.spec.securityContext.runAsNonRoot==null)\'',
  'Image Security': 'kubectl get pods -A -o jsonpath=\'{range .items[*]}{.spec.containers[*].image}{"\\n"}{end}\' | sort -u',
  'Cluster Configuration': 'kubectl version --short' }

// ── Sort options ───────────────────────────────────────────────────

type SortField = 'severity' | 'category' | 'status' | 'cluster'

const SORT_OPTIONS = [
  { value: 'severity' as const, label: 'Severity' },
  { value: 'category' as const, label: 'Category' },
  { value: 'status' as const, label: 'Status' },
  { value: 'cluster' as const, label: 'Cluster' },
]

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const STATUS_ORDER: Record<string, number> = { fail: 0, warning: 1, pass: 2, manual: 3 }

// ── Status icon helper ─────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'pass': return <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
    case 'fail': return <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
    case 'warning': return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
    default: return <MinusCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
  }
}

// ── Main Component ─────────────────────────────────────────────────

interface ISO27001AuditProps {
  config?: Record<string, unknown>
}

export function ISO27001Audit({ config }: ISO27001AuditProps) {
  const { t } = useTranslation(['common', 'cards'])
  const clusterConfig = config?.cluster as string | undefined

  // 1. Demo mode detection
  const { shouldUseDemoData: isDemoMode } = useCardDemoState({ requires: 'agent' })

  // 2. Fetch live data from agent (runs kubectl checks against clusters)
  const {
    findings: cachedFindings,
    isLoading: cachedLoading,
    isRefreshing: cachedRefreshing,
    isDemoFallback,
    isFailed: cachedFailed,
    consecutiveFailures: cachedFailures,
    lastRefresh: cachedLastRefresh } = useCachedISO27001Audit(clusterConfig)

  // 3. Switch between demo and live data (fall back to demo if fetch failed with no cache)
  const useDemoData = isDemoMode || isDemoFallback
  const rawFindings = useDemoData ? getDemoFindings() : cachedFindings
  const isLoading = useDemoData ? false : cachedLoading
  const isRefreshing = useDemoData ? false : cachedRefreshing
  const isFailed = useDemoData ? false : cachedFailed
  const consecutiveFailures = useDemoData ? 0 : cachedFailures

  // 4. Report card state
  const hasData = rawFindings.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    isDemoData: isDemoMode || isDemoFallback,
    hasAnyData: hasData,
    isFailed,
    consecutiveFailures })

  // 5. Unified card controls
  const {
    items: findings,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: localSearch,
      setSearch: setLocalSearch,
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters,
      showClusterFilter,
      setShowClusterFilter,
      clusterFilterRef },
    sorting: { sortBy, setSortBy, sortDirection, setSortDirection },
    containerRef,
    containerStyle } = useCardData<ISO27001Finding, SortField>(rawFindings, {
    filter: {
      searchFields: ['label', 'category', 'cluster', 'details', 'status', 'severity'],
      clusterField: 'cluster',
      storageKey: 'iso27001-audit' },
    sort: {
      defaultField: 'severity',
      defaultDirection: 'desc',
      comparators: {
        severity: (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
        category: (a, b) => a.category.localeCompare(b.category),
        status: (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
        cluster: (a, b) => a.cluster.localeCompare(b.cluster) } },
    defaultLimit: 10 })

  // 6. Expandable verify commands
  const [expandedVerify, setExpandedVerify] = useState<Set<string>>(new Set())
  const toggleVerify = (cat: string) => {
    setExpandedVerify(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  // 7. Stats
  const stats = (() => {
    const pass = rawFindings.filter(f => f.status === 'pass').length
    const fail = rawFindings.filter(f => f.status === 'fail').length
    const warn = rawFindings.filter(f => f.status === 'warning').length
    const manual = rawFindings.filter(f => f.status === 'manual').length
    return { pass, fail, warn, manual, total: rawFindings.length }
  })()

  const passPercent = stats.total > 0 ? Math.round((stats.pass / stats.total) * 100) : 0

  // 8. Loading skeleton
  if (showSkeleton) {
    return <CardSkeleton rows={5} showHeader showSearch />
  }

  // 9. Error state — shown when fetch failed, even if there's stale data (#6772)
  if (isFailed && !hasData) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-4">
        <AlertTriangle className="w-8 h-8 text-red-400 mb-2" />
        <p className="text-sm font-medium text-foreground">{t('cards:iso27001Audit.failedToLoad', 'Failed to load audit data')}</p>
        <p className="text-xs text-muted-foreground mt-1">{t('cards:iso27001Audit.checkAgent', 'Check agent connectivity and cluster access')}</p>
      </div>
    )
  }

  // 10. Empty state
  if (showEmptyState || (!isLoading && rawFindings.length === 0)) {
    if (isFailed) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-center p-4">
          <AlertTriangle className="w-8 h-8 text-red-400 mb-2" />
          <p className="text-sm font-medium text-foreground">{t('cards:iso27001Audit.failedToLoad', 'Failed to load audit data')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('cards:iso27001Audit.checkAgent', 'Check agent connectivity and cluster access')}</p>
        </div>
      )
    }
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-4">
        <Shield className="w-8 h-8 text-blue-400 mb-2" />
        <p className="text-sm font-medium text-foreground">No audit data</p>
        <p className="text-xs text-muted-foreground mt-1">Connect clusters via kc-agent to run ISO 27001 checks</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header: stats + controls */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Shield className="w-4 h-4 text-blue-400" />
            <span className={`text-xs font-bold ${
              passPercent >= 80 ? 'text-green-400' : passPercent >= 50 ? 'text-yellow-400' : 'text-red-400'
            }`}>{passPercent}%</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-green-400">{stats.pass} pass</span>
            <span className="text-red-400">{stats.fail} fail</span>
            {stats.warn > 0 && <span className="text-yellow-400">{stats.warn} warn</span>}
          </div>
          {/* #6217 part 2: freshness indicator. */}
          <RefreshIndicator
            isRefreshing={isRefreshing}
            lastUpdated={typeof cachedLastRefresh === 'number' ? new Date(cachedLastRefresh) : null}
            size="sm"
            showLabel={false}
            staleThresholdMinutes={5}
          />
        </div>
        <div className="flex items-center gap-1">
          <CardClusterFilter
            availableClusters={availableClusters}
            selectedClusters={localClusterFilter}
            onToggle={toggleClusterFilter}
            onClear={clearClusterFilter}
            isOpen={showClusterFilter}
            setIsOpen={setShowClusterFilter}
            containerRef={clusterFilterRef}
            minClusters={1}
          />
          <CardControls
            limit={itemsPerPage}
            onLimitChange={setItemsPerPage}
            sortBy={sortBy}
            sortOptions={SORT_OPTIONS}
            onSortChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
          />
        </div>
      </div>

      {/* Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder={t('cards:iso27001Audit.searchPlaceholder')}
        className="mb-2"
      />

      {/* Findings list */}
      <div
        ref={containerRef}
        className="flex-1 space-y-1 overflow-y-auto min-h-card-content"
        style={containerStyle}
      >
        {findings.map((f, idx) => {
          const verifyCmd = VERIFY_COMMANDS[f.category]
          const isVerifyOpen = expandedVerify.has(`${f.checkId}-${f.cluster}-${idx}`)
          const verifyKey = `${f.checkId}-${f.cluster}-${idx}`

          return (
            <div
              key={`${f.checkId}-${f.cluster}-${idx}`}
              className={`p-2 rounded-lg border text-xs ${
                f.status === 'fail' ? 'bg-red-500/5 border-red-500/20' :
                f.status === 'warning' ? 'bg-yellow-500/5 border-yellow-500/20' :
                f.status === 'pass' ? 'bg-green-500/5 border-green-500/20' :
                'bg-muted/30 border-border/50'
              }`}
            >
              <div className="flex items-start gap-2">
                <StatusIcon status={f.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground truncate">{f.label}</span>
                    <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${
                      f.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                      f.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                      f.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>{f.severity}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-muted-foreground">
                    <span className="truncate">{f.category}</span>
                    <span>·</span>
                    <span className="text-blue-400">{f.cluster}</span>
                  </div>
                  {f.details && (
                    <p className="mt-0.5 text-muted-foreground truncate">{f.details}</p>
                  )}
                  {verifyCmd && (
                    <button
                      onClick={() => toggleVerify(verifyKey)}
                      className="flex items-center gap-0.5 mt-1 text-[10px] text-blue-400 hover:text-blue-300"
                      aria-label={`${isVerifyOpen ? 'Hide' : 'Show'} verification command for ${f.category}`}
                      aria-expanded={isVerifyOpen}
                    >
                      <Terminal className="w-3 h-3" />
                      {isVerifyOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      verify
                    </button>
                  )}
                  {isVerifyOpen && verifyCmd && (
                    <pre className="mt-1 p-1.5 rounded bg-muted/50 text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all font-mono">
                      {verifyCmd}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {needsPagination && itemsPerPage !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-1">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 10}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}

export default ISO27001Audit
