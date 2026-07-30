/**
 * Compliance Trestle drilldown view.
 *
 * Shows individual OSCAL control results with filtering by status, severity,
 * cluster, and profile. Supports sorting and pagination. Opened from the
 * TrestleScan card when clicking a stat (passed/failed/other count).
 */

import { useState, useMemo } from 'react'
import { Shield, ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTrestle } from '../../../hooks/useTrestle'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useDrillDown } from '../../../hooks/useDrillDown'
import {
  type Props,
  type SortField,
  type SortDir,
  type ControlRow,
  PAGE_SIZE,
  SEVERITY_ORDER,
  STATUS_ORDER,
  normalizeComplianceStatus,
  computeSummaryCounts,
} from './compliance-drilldown'
import {
  ComplianceSummaryStats,
  ComplianceSearchFilters,
  ComplianceTable,
  CompliancePagination,
  ComplianceClusterBreakdown,
} from './ComplianceDrillDown.parts'

export function ComplianceDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const filterStatus = normalizeComplianceStatus(data.filterStatus as string | undefined)
  const { statuses } = useTrestle()
  const { selectedClusters } = useGlobalFilters()
  const { state, pop } = useDrillDown()

  const summaryCounts = useMemo(() => computeSummaryCounts(data), [data])

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
        case 'controlId': cmp = a.controlId.localeCompare(b.controlId); break
        case 'severity': cmp = (SEVERITY_ORDER[a.severity || 'medium'] ?? 2) - (SEVERITY_ORDER[b.severity || 'medium'] ?? 2); break
        case 'status': cmp = (STATUS_ORDER[a.status] ?? 2) - (STATUS_ORDER[b.status] ?? 2); break
        case 'cluster': cmp = a.cluster.localeCompare(b.cluster); break
        case 'profile': cmp = (a.profile || '').localeCompare(b.profile || ''); break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  })()

  const totalPages = Math.ceil(sortedRows.length / PAGE_SIZE)
  const pagedRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const resetPage = () => setPage(0)

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
    resetPage()
  }

  // Summary stats
  const rowPassCount = allRows.filter(r => r.status === 'pass').length
  const rowFailCount = allRows.filter(r => r.status === 'fail').length
  const rowOtherCount = allRows.filter(r => r.status === 'other' || r.status === 'not-applicable').length
  const passCount = summaryCounts.hasProvidedSummary ? summaryCounts.passing : rowPassCount
  const failCount = summaryCounts.hasProvidedSummary ? summaryCounts.failing : rowFailCount
  const otherCount = summaryCounts.hasProvidedSummary ? summaryCounts.other : rowOtherCount
  const totalCount = summaryCounts.hasProvidedSummary ? summaryCounts.total : allRows.length
  const isAggregateSummaryOnly = summaryCounts.hasProvidedSummary && allRows.length === 0
  const activeFilters = [statusFilter, severityFilter, clusterFilter, profileFilter, searchQuery].filter(Boolean).length

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-6 text-sm mb-4">
          {state.stack.length > 1 && (
            <button
              type="button"
              onClick={pop}
              className="flex items-center gap-2 hover:bg-secondary/50 border border-transparent hover:border-border px-3 py-1.5 rounded-lg transition-all text-muted-foreground hover:text-foreground"
              aria-label={t('drilldown.goBack')}
              title={t('drilldown.goBack')}
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{t('common.back')}</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-6 h-6 text-teal-400" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {isAggregateSummaryOnly ? 'Compliance Overview' : 'OSCAL Compliance Controls'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isAggregateSummaryOnly
                ? 'Summary totals from the Security Compliance dashboard stats overview'
                : 'Individual check results from Compliance Trestle assessments'}
            </p>
          </div>
        </div>

        <ComplianceSummaryStats
          passCount={passCount}
          failCount={failCount}
          otherCount={otherCount}
          totalCount={totalCount}
          statusFilter={statusFilter}
          onClearFilter={() => { setStatusFilter(''); resetPage() }}
          onPassClick={() => { setStatusFilter(statusFilter === 'pass' ? '' : 'pass'); resetPage() }}
          onFailClick={() => { setStatusFilter(statusFilter === 'fail' ? '' : 'fail'); resetPage() }}
          onOtherClick={() => { setStatusFilter(statusFilter === 'other' ? '' : 'other'); resetPage() }}
        />

        <ComplianceSearchFilters
          searchQuery={searchQuery}
          showFilters={showFilters}
          activeFilters={activeFilters}
          statusFilter={statusFilter}
          severityFilter={severityFilter}
          clusterFilter={clusterFilter}
          profileFilter={profileFilter}
          uniqueStatuses={uniqueStatuses}
          uniqueClusters={uniqueClusters}
          uniqueProfiles={uniqueProfiles}
          onSearchChange={q => { setSearchQuery(q); resetPage() }}
          onToggleFilters={() => setShowFilters(!showFilters)}
          onStatusChange={v => { setStatusFilter(v); resetPage() }}
          onSeverityChange={v => { setSeverityFilter(v); resetPage() }}
          onClusterChange={v => { setClusterFilter(v); resetPage() }}
          onProfileChange={v => { setProfileFilter(v); resetPage() }}
          onClearAll={() => {
            setStatusFilter('')
            setSeverityFilter('')
            setClusterFilter('')
            setProfileFilter('')
            setSearchQuery('')
            resetPage()
          }}
        />
      </div>

      <ComplianceTable
        pagedRows={pagedRows}
        sortField={sortField}
        sortDir={sortDir}
        isAggregateSummaryOnly={isAggregateSummaryOnly}
        onSort={toggleSort}
      />

      {totalPages > 1 && (
        <CompliancePagination
          page={page}
          totalPages={totalPages}
          totalRows={sortedRows.length}
          onFirst={() => setPage(0)}
          onPrev={() => setPage(p => Math.max(0, p - 1))}
          onNext={() => setPage(p => Math.min(totalPages - 1, p + 1))}
          onLast={() => setPage(totalPages - 1)}
        />
      )}

      {uniqueClusters.length > 1 && (
        <ComplianceClusterBreakdown
          uniqueClusters={uniqueClusters}
          filteredRows={filteredRows}
          clusterFilter={clusterFilter}
          onClusterClick={cluster => { setClusterFilter(clusterFilter === cluster ? '' : cluster); resetPage() }}
        />
      )}
    </div>
  )
}

export default ComplianceDrillDown
