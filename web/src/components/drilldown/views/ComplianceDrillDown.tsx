/**
 * Compliance Trestle drilldown view.
 *
 * Shows individual OSCAL control results with filtering by status, severity,
 * cluster, and profile. Supports sorting and pagination. Opened from the
 * TrestleScan card when clicking a stat (passed/failed/other count).
 */

import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Shield, CheckCircle, XCircle, AlertCircle, Info,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight,
  Search, X, Filter } from 'lucide-react'
import { useTrestle, type OscalControlResult } from '../../../hooks/useTrestle'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { StatusBadge } from '../../ui/StatusBadge'
import { cn } from '../../../lib/cn'

interface Props {
  data: Record<string, unknown>
}

type SortField = 'controlId' | 'severity' | 'status' | 'cluster' | 'profile'
type SortDir = 'asc' | 'desc'

/** Controls per page */
const PAGE_SIZE = 25

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const STATUS_ORDER: Record<string, number> = { fail: 0, other: 1, 'not-applicable': 2, pass: 3 }

function severityColor(s?: string): string {
  switch (s) {
    case 'critical': return 'text-red-400 bg-red-500/15 border-red-500/30'
    case 'high': return 'text-orange-400 bg-orange-500/15 border-orange-500/30'
    case 'medium': return 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30'
    case 'low': return 'text-blue-400 bg-blue-500/15 border-blue-500/30'
    default: return 'text-muted-foreground bg-secondary border-border'
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'pass': return <CheckCircle className="w-4 h-4 text-green-400" />
    case 'fail': return <XCircle className="w-4 h-4 text-red-400" />
    case 'other': return <AlertCircle className="w-4 h-4 text-yellow-400" />
    case 'not-applicable': return <Info className="w-4 h-4 text-muted-foreground" />
    default: return <AlertCircle className="w-4 h-4 text-muted-foreground" />
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'pass': return 'Pass'
    case 'fail': return 'Fail'
    case 'other': return 'Other'
    case 'not-applicable': return 'N/A'
    default: return status
  }
}

interface ControlRow extends OscalControlResult {
  cluster: string
}

export function ComplianceDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const filterStatus = (data.filterStatus as string) || ''
  const { statuses } = useTrestle()
  const { selectedClusters } = useGlobalFilters()

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>(filterStatus)
  const [severityFilter, setSeverityFilter] = useState<string>('')
  const [clusterFilter, setClusterFilter] = useState<string>('')
  const [profileFilter, setProfileFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Sort
  const [sortField, setSortField] = useState<SortField>('severity')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Pagination
  const [page, setPage] = useState(0)

  // Build flat list with cluster info
  const allRows = useMemo(() => {
    const rows: ControlRow[] = []
    for (const [clusterName, clusterStatus] of Object.entries(statuses)) {
      if (!clusterStatus.installed) continue
      if (selectedClusters.length > 0 && !selectedClusters.includes(clusterName)) continue
      for (const cr of clusterStatus.controlResults) {
        rows.push({ ...cr, cluster: clusterName })
      }
    }
    return rows
  }, [statuses, selectedClusters])

  // Unique values for filter dropdowns
  const uniqueClusters = [...new Set(allRows.map(r => r.cluster))].sort()
  const uniqueProfiles = useMemo(() => [...new Set(allRows.map(r => r.profile).filter(Boolean))].sort(), [allRows])
  const uniqueStatuses = [...new Set(allRows.map(r => r.status))].sort()

  // Filtered rows
  const filteredRows = (() => {
    let rows = allRows
    if (statusFilter) rows = rows.filter(r => r.status === statusFilter)
    if (severityFilter) rows = rows.filter(r => r.severity === severityFilter)
    if (clusterFilter) rows = rows.filter(r => r.cluster === clusterFilter)
    if (profileFilter) rows = rows.filter(r => r.profile === profileFilter)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter(r =>
        r.controlId.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
      )
    }
    return rows
  })()

  // Sorted rows
  const sortedRows = (() => {
    const sorted = [...filteredRows]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'controlId':
          cmp = a.controlId.localeCompare(b.controlId)
          break
        case 'severity':
          cmp = (SEVERITY_ORDER[a.severity || 'medium'] ?? 2) - (SEVERITY_ORDER[b.severity || 'medium'] ?? 2)
          break
        case 'status':
          cmp = (STATUS_ORDER[a.status] ?? 2) - (STATUS_ORDER[b.status] ?? 2)
          break
        case 'cluster':
          cmp = a.cluster.localeCompare(b.cluster)
          break
        case 'profile':
          cmp = (a.profile || '').localeCompare(b.profile || '')
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  })()

  // Paginated rows
  const totalPages = Math.ceil(sortedRows.length / PAGE_SIZE)
  const pagedRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Reset page when filters change
  const resetPage = () => setPage(0)

  // Sort toggle
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
    resetPage()
  }

  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 opacity-20" />
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3" />
      : <ChevronDown className="w-3 h-3" />
  }

  // Summary stats — always computed from allRows so they are unaffected by filters
  const passCount = allRows.filter(r => r.status === 'pass').length
  const failCount = allRows.filter(r => r.status === 'fail').length
  const otherCount = allRows.filter(r => r.status === 'other' || r.status === 'not-applicable').length
  const activeFilters = [statusFilter, severityFilter, clusterFilter, profileFilter, searchQuery].filter(Boolean).length

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-6 h-6 text-teal-400" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">OSCAL Compliance Controls</h2>
            <p className="text-sm text-muted-foreground">
              Individual check results from Compliance Trestle assessments
            </p>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <button
            onClick={() => { setStatusFilter(''); resetPage() }}
            className={cn(
              'p-3 rounded-lg border transition-colors text-left',
              !statusFilter ? 'border-teal-500/40 bg-teal-500/10' : 'border-border bg-card/50 hover:border-border/80'
            )}
          >
            <div className="text-xl font-bold text-foreground">{allRows.length}</div>
            <div className="text-xs text-muted-foreground">Total Controls</div>
          </button>
          <button
            onClick={() => { setStatusFilter(statusFilter === 'pass' ? '' : 'pass'); resetPage() }}
            className={cn(
              'p-3 rounded-lg border transition-colors text-left',
              statusFilter === 'pass' ? 'border-green-500/40 bg-green-500/10' : 'border-border bg-card/50 hover:border-border/80'
            )}
          >
            <div className="text-xl font-bold text-green-400">{passCount}</div>
            <div className="text-xs text-muted-foreground">Passing</div>
          </button>
          <button
            onClick={() => { setStatusFilter(statusFilter === 'fail' ? '' : 'fail'); resetPage() }}
            className={cn(
              'p-3 rounded-lg border transition-colors text-left',
              statusFilter === 'fail' ? 'border-red-500/40 bg-red-500/10' : 'border-border bg-card/50 hover:border-border/80'
            )}
          >
            <div className="text-xl font-bold text-red-400">{failCount}</div>
            <div className="text-xs text-muted-foreground">Failing</div>
          </button>
          <button
            onClick={() => { setStatusFilter(statusFilter === 'other' ? '' : 'other'); resetPage() }}
            className={cn(
              'p-3 rounded-lg border transition-colors text-left',
              statusFilter === 'other' ? 'border-yellow-500/40 bg-yellow-500/10' : 'border-border bg-card/50 hover:border-border/80'
            )}
          >
            <div className="text-xl font-bold text-yellow-400">{otherCount}</div>
            <div className="text-xs text-muted-foreground">Other / N/A</div>
          </button>
        </div>

        {/* Search + filter toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by control ID, title, or description..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); resetPage() }}
              className="w-full pl-9 pr-8 py-2 rounded-lg border border-border bg-card/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); resetPage() }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors',
              showFilters || activeFilters > 0
                ? 'border-teal-500/40 bg-teal-500/10 text-teal-400'
                : 'border-border bg-card/50 text-muted-foreground hover:text-foreground'
            )}
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilters > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-teal-500/20 text-teal-400 text-xs font-medium">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {/* Filter dropdowns */}
        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); resetPage() }}
              className="px-3 py-2 rounded-lg border border-border bg-card/50 text-sm text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            >
              <option value="">{t('drilldown.compliance.allStatuses')}</option>
              {uniqueStatuses.map(s => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </select>
            <select
              value={severityFilter}
              onChange={e => { setSeverityFilter(e.target.value); resetPage() }}
              className="px-3 py-2 rounded-lg border border-border bg-card/50 text-sm text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            >
              <option value="">{t('drilldown.compliance.allSeverities')}</option>
              <option value="critical">{t('drilldown.compliance.critical')}</option>
              <option value="high">{t('drilldown.compliance.high')}</option>
              <option value="medium">{t('drilldown.compliance.medium')}</option>
              <option value="low">{t('drilldown.compliance.low')}</option>
            </select>
            <select
              value={clusterFilter}
              onChange={e => { setClusterFilter(e.target.value); resetPage() }}
              className="px-3 py-2 rounded-lg border border-border bg-card/50 text-sm text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            >
              <option value="">{t('drilldown.compliance.allClusters')}</option>
              {uniqueClusters.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={profileFilter}
              onChange={e => { setProfileFilter(e.target.value); resetPage() }}
              className="px-3 py-2 rounded-lg border border-border bg-card/50 text-sm text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            >
              <option value="">{t('drilldown.compliance.allProfiles')}</option>
              {uniqueProfiles.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            {activeFilters > 0 && (
              <button
                onClick={() => {
                  setStatusFilter('')
                  setSeverityFilter('')
                  setClusterFilter('')
                  setProfileFilter('')
                  setSearchQuery('')
                  resetPage()
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors col-span-2 md:col-span-4 text-left"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6">
        {pagedRows.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No controls match filters</p>
            <p className="text-xs mt-1">Try adjusting your search or filter criteria</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_2fr_100px_100px_120px_120px] gap-px bg-border text-xs font-medium text-muted-foreground">
              <button onClick={() => toggleSort('controlId')} className="flex min-w-11 items-center gap-1 px-3 py-2 min-h-11 bg-card/80 hover:bg-card transition-colors">
                Control <SortIndicator field="controlId" />
              </button>
              <div className="px-3 py-2 min-h-11 bg-card/80">Description</div>
              <button onClick={() => toggleSort('status')} className="flex min-w-11 items-center gap-1 px-3 py-2 min-h-11 bg-card/80 hover:bg-card transition-colors">
                Status <SortIndicator field="status" />
              </button>
              <button onClick={() => toggleSort('severity')} className="flex min-w-11 items-center gap-1 px-3 py-2 min-h-11 bg-card/80 hover:bg-card transition-colors">
                Severity <SortIndicator field="severity" />
              </button>
              <button onClick={() => toggleSort('cluster')} className="flex min-w-11 items-center gap-1 px-3 py-2 min-h-11 bg-card/80 hover:bg-card transition-colors">
                Cluster <SortIndicator field="cluster" />
              </button>
              <button onClick={() => toggleSort('profile')} className="flex min-w-11 items-center gap-1 px-3 py-2 min-h-11 bg-card/80 hover:bg-card transition-colors">
                Profile <SortIndicator field="profile" />
              </button>
            </div>

            {/* Table rows */}
            {pagedRows.map((row, i) => (
              <div
                key={`${row.cluster}-${row.controlId}-${i}`}
                className={cn(
                  'grid grid-cols-[1fr_2fr_100px_100px_120px_120px] gap-px text-sm',
                  row.status === 'fail' ? 'bg-red-500/5' : 'bg-transparent',
                  'hover:bg-card/40 transition-colors'
                )}
              >
                <div className="px-3 py-2.5 font-mono text-xs font-medium text-foreground truncate">
                  {row.controlId}
                </div>
                <div className="px-3 py-2.5 text-xs text-muted-foreground truncate" title={row.description || row.title}>
                  {row.title}
                </div>
                <div className="px-3 py-2.5 flex items-center gap-1.5">
                  {statusIcon(row.status)}
                  <span className="text-xs">{statusLabel(row.status)}</span>
                </div>
                <div className="px-3 py-2.5">
                  {row.severity && (
                    <span className={cn('px-2 py-0.5 rounded text-xs font-medium border', severityColor(row.severity))}>
                      {row.severity}
                    </span>
                  )}
                </div>
                <div className="px-3 py-2.5">
                  <StatusBadge color="blue" size="xs">
                    {row.cluster.split('/').pop() || row.cluster}
                  </StatusBadge>
                </div>
                <div className="px-3 py-2.5 text-xs text-muted-foreground truncate" title={row.profile}>
                  {row.profile || '-'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {page * PAGE_SIZE + 1}--{Math.min((page + 1) * PAGE_SIZE, sortedRows.length)} of {sortedRows.length} controls
          </span>
          <div className="flex items-center gap-1">
            {/* First/Last use the single-glyph ChevronsLeft/ChevronsRight (double-chevron)
                instead of two overlapping single chevrons — reads as one control instead of
                two arrows side-by-side. */}
            <button
              onClick={() => setPage(0)}
              disabled={page === 0}
              className="p-2 rounded hover:bg-card/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-h-11 min-w-11"
              title="First page"
              aria-label="First page"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-2 rounded hover:bg-card/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-h-11 min-w-11"
              title="Previous page"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-xs">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-2 rounded hover:bg-card/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-h-11 min-w-11"
              title="Next page"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={page >= totalPages - 1}
              className="p-2 rounded hover:bg-card/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-h-11 min-w-11"
              title="Last page"
              aria-label="Last page"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Per-cluster breakdown */}
      {uniqueClusters.length > 1 && (
        <div className="px-6 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">Per-cluster breakdown</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {uniqueClusters.map(cluster => {
              const clusterRows = filteredRows.filter(r => r.cluster === cluster)
              const cPass = clusterRows.filter(r => r.status === 'pass').length
              const cFail = clusterRows.filter(r => r.status === 'fail').length
              const cTotal = clusterRows.length
              const cScore = cTotal > 0 ? Math.round((cPass / cTotal) * 100) : 0
              return (
                <button
                  key={cluster}
                  onClick={() => { setClusterFilter(clusterFilter === cluster ? '' : cluster); resetPage() }}
                  className={cn(
                    'p-2 rounded-lg border text-left transition-colors',
                    clusterFilter === cluster ? 'border-blue-500/40 bg-blue-500/10' : 'border-border bg-card/50 hover:border-border/80'
                  )}
                >
                  <div className="text-xs font-medium text-foreground truncate">{cluster.split('/').pop() || cluster}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-green-400">{cPass} pass</span>
                    <span className="text-xs text-red-400">{cFail} fail</span>
                    <span className={cn(
                      'text-xs font-bold ml-auto',
                      cScore >= 80 ? 'text-green-400' : cScore >= 60 ? 'text-yellow-400' : 'text-red-400'
                    )}>
                      {cScore}%
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default ComplianceDrillDown
