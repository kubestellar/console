import { useState } from 'react'
import { StatGrid } from '../../ui/StatGrid'
import { StatTile } from '../shared/StatTile'
import {
  CheckCircle,
  AlertTriangle,
  Database,
  Server,
  Download,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton, SkeletonStats, SkeletonList } from '../../ui/Skeleton'
import { RefreshIndicator } from '../../ui/RefreshIndicator'
import { CardSearchInput } from '../../../lib/cards/CardComponents'
import { useFluidStatus } from './useFluidStatus'
import { useDemoMode } from '../../../hooks/useDemoMode'
import {
  DATASETS_TAB,
  RUNTIMES_TAB,
  DatasetRow,
  RuntimeRow,
  TabButton,
  type Tab,
} from './FluidStatus.rows'

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FluidStatus() {
  const { t } = useTranslation('cards')
  useDemoMode()

  const {
    data,
    isRefreshing,
    error,
    showSkeleton,
    showEmptyState,
    lastRefresh,
  } = useFluidStatus()

  const [activeTab, setActiveTab] = useState<Tab>(DATASETS_TAB)
  const [search, setSearch] = useState('')

  // Guard against undefined nested data from API/cache
  const datasets = data.datasets || []
  const runtimes = data.runtimes || []
  const dataLoads = data.dataLoads || []
  const controllerPods = data.controllerPods || { ready: 0, total: 0 }

  // Derived stats
  const stats = {
    datasets: datasets.length,
    runtimes: runtimes.length,
    dataLoads: dataLoads.length,
    issues:
      datasets.filter(d => d.status !== 'bound').length +
      runtimes.filter(r => r.status !== 'ready').length +
      dataLoads.filter(dl => dl.phase === 'failed').length,
  }

  // Filtered lists
  const filteredDatasets = (() => {
    if (!search.trim()) return datasets
    const q = search.toLowerCase()
    return datasets.filter(
      d =>
        d.name.toLowerCase().includes(q) ||
        d.namespace.toLowerCase().includes(q) ||
        d.source.toLowerCase().includes(q) ||
        d.runtimeType.toLowerCase().includes(q),
    )
  })()

  const filteredRuntimes = (() => {
    if (!search.trim()) return runtimes
    const q = search.toLowerCase()
    return runtimes.filter(
      r =>
        r.name.toLowerCase().includes(q) ||
        r.namespace.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q),
    )
  })()

  // ── Loading ────────────────────────────────────────────────────────────────
  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <Skeleton variant="rounded" width={120} height={28} />
          <Skeleton variant="rounded" width={80} height={20} />
        </div>
        <SkeletonStats className="grid-cols-2 @md:grid-cols-4" />
        <Skeleton variant="rounded" height={32} />
        <SkeletonList items={3} className="flex-1" />
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">
          {t('fluid.fetchError', 'Failed to fetch Fluid status')}
        </p>
      </div>
    )
  }

  // ── Not installed ──────────────────────────────────────────────────────────
  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Database className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('fluid.notInstalled', 'Fluid not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'fluid.notInstalledHint',
            'No Fluid controller pods found. Deploy Fluid to enable dataset caching and acceleration.',
          )}
        </p>
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'
  const healthColorClass = isHealthy
    ? 'bg-green-500/15 text-green-400'
    : 'bg-yellow-500/15 text-yellow-400'

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* ── Header: health badge + pod counts + refresh ── */}
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${healthColorClass}`}
          >
            {isHealthy ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            {isHealthy
              ? t('fluid.healthy', 'Healthy')
              : t('fluid.degraded', 'Degraded')}
          </div>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Server className="w-3 h-3" />
            {controllerPods.ready}/{controllerPods.total} {t('fluid.controllerPods', 'controllers')}
          </span>
        </div>
        <RefreshIndicator
          isRefreshing={isRefreshing}
          lastUpdated={lastRefresh ? new Date(lastRefresh) : null}
          size="sm"
          showLabel={true}
        />
      </div>

      {/* ── Stats grid ── */}
      <StatGrid>
        <StatTile
          icon={<Database className="w-4 h-4 text-blue-400" />}
          label={t('fluid.datasets', 'Datasets')}
          value={stats.datasets}
          colorClass="text-blue-400"
          borderClass="border-blue-500/20"
        />
        <StatTile
          icon={<Server className="w-4 h-4 text-cyan-400" />}
          label={t('fluid.runtimes', 'Runtimes')}
          value={stats.runtimes}
          colorClass="text-cyan-400"
          borderClass="border-cyan-500/20"
        />
        <StatTile
          icon={<Download className="w-4 h-4 text-purple-400" />}
          label={t('fluid.dataLoads', 'Data Loads')}
          value={stats.dataLoads}
          colorClass="text-purple-400"
          borderClass="border-purple-500/20"
        />
        <StatTile
          icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
          label={t('fluid.issues', 'Issues')}
          value={stats.issues}
          colorClass="text-red-400"
          borderClass="border-red-500/20"
        />
      </StatGrid>

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1">
        <TabButton
          active={activeTab === DATASETS_TAB}
          onClick={() => { setActiveTab(DATASETS_TAB); setSearch('') }}
          icon={<Database className="w-3.5 h-3.5" />}
          label={t('fluid.datasetsTab', 'Datasets')}
          count={datasets.length}
        />
        <TabButton
          active={activeTab === RUNTIMES_TAB}
          onClick={() => { setActiveTab(RUNTIMES_TAB); setSearch('') }}
          icon={<Server className="w-3.5 h-3.5" />}
          label={t('fluid.runtimesTab', 'Runtimes')}
          count={runtimes.length}
        />
      </div>

      {/* ── Search ── */}
      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder={
          activeTab === DATASETS_TAB
            ? t('fluid.searchDatasetsPlaceholder', 'Search datasets…')
            : t('fluid.searchRuntimesPlaceholder', 'Search runtimes…')
        }
      />

      {/* ── Content list ── */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {activeTab === DATASETS_TAB ? (
          filteredDatasets.length > 0 ? (
            filteredDatasets.map(ds => (
              <DatasetRow key={`${ds.namespace}/${ds.name}`} dataset={ds} />
            ))
          ) : datasets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1 py-6">
              <Database className="w-6 h-6 opacity-40" />
              <p className="text-sm">{t('fluid.noDatasets', 'No datasets found')}</p>
              <p className="text-xs text-center">
                {t('fluid.noDatasetsHint', 'Fluid datasets require the data.fluid.io CRD API.')}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
              {t('fluid.noSearchResults', 'No results match your search.')}
            </div>
          )
        ) : (
          filteredRuntimes.length > 0 ? (
            filteredRuntimes.map(r => (
              <RuntimeRow key={`${r.namespace}/${r.name}`} runtime={r} />
            ))
          ) : runtimes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1 py-6">
              <Server className="w-6 h-6 opacity-40" />
              <p className="text-sm">{t('fluid.noRuntimes', 'No runtimes found')}</p>
              <p className="text-xs text-center">
                {t('fluid.noRuntimesHint', 'Fluid runtimes (Alluxio, JuiceFS, etc.) require the data.fluid.io CRD API.')}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
              {t('fluid.noSearchResults', 'No results match your search.')}
            </div>
          )
        )}
      </div>
    </div>
  )
}
