import { useState } from 'react'
import { StatTile } from '../shared/StatTile'
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Database,
  Server,
  HardDrive,
  Download,
  Layers,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton, SkeletonStats, SkeletonList } from '../../ui/Skeleton'
import { RefreshIndicator } from '../../ui/RefreshIndicator'
import { CardSearchInput } from '../../../lib/cards/CardComponents'
import { useFluidStatus } from './useFluidStatus'
import { useDemoMode } from '../../../hooks/useDemoMode'
import type {
  FluidDataset,
  FluidDatasetStatus,
  FluidRuntime,
  FluidRuntimeStatus,
} from './demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_FULL_PERCENT = 100
const CACHE_HIGH_THRESHOLD = 80
const CACHE_MED_THRESHOLD = 40
const DATASETS_TAB = 'datasets' as const
const RUNTIMES_TAB = 'runtimes' as const
type Tab = typeof DATASETS_TAB | typeof RUNTIMES_TAB

// ---------------------------------------------------------------------------
// Status config maps
// ---------------------------------------------------------------------------

const DATASET_STATUS_CONFIG: Record<
  FluidDatasetStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  bound: {
    label: 'Bound',
    color: 'text-green-400',
    icon: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
  },
  'not-bound': {
    label: 'Not Bound',
    color: 'text-red-400',
    icon: <XCircle className="w-3.5 h-3.5 text-red-400" />,
  },
  unknown: {
    label: 'Unknown',
    color: 'text-yellow-400',
    icon: <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />,
  },
}

const RUNTIME_STATUS_CONFIG: Record<
  FluidRuntimeStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  ready: {
    label: 'Ready',
    color: 'text-green-400',
    icon: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
  },
  'not-ready': {
    label: 'Not Ready',
    color: 'text-red-400',
    icon: <XCircle className="w-3.5 h-3.5 text-red-400" />,
  },
  unknown: {
    label: 'Unknown',
    color: 'text-yellow-400',
    icon: <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />,
  },
}



// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CacheBar({ percent }: { percent: number }) {
  const barColor =
    percent >= CACHE_HIGH_THRESHOLD
      ? 'bg-green-500'
      : percent >= CACHE_MED_THRESHOLD
        ? 'bg-yellow-500'
        : 'bg-red-500'

  return (
    <div className="mt-1.5">
      <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
        <div
          className={`h-full transition-all rounded-full ${barColor}`}
          style={{ width: `${Math.min(percent, CACHE_FULL_PERCENT)}%` }}
          title={`${percent}% cached`}
        />
      </div>
      <div className="flex justify-between mt-0.5 text-xs text-muted-foreground tabular-nums">
        <span>{percent}% cached</span>
      </div>
    </div>
  )
}

function DatasetRow({ dataset }: { dataset: FluidDataset }) {
  const { t } = useTranslation('cards')
  const cfg = DATASET_STATUS_CONFIG[dataset.status]

  return (
    <div className="rounded-md bg-muted/30 px-3 py-2 space-y-1.5">
      {/* Row 1: name + status */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {cfg.icon}
          <span className="text-xs font-medium truncate">{dataset.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dataset.runtimeType && (
            <span className="text-xs text-muted-foreground">
              {dataset.runtimeType}
            </span>
          )}
          <span className={`text-xs ${cfg.color}`}>{cfg.label}</span>
        </div>
      </div>

      {/* Row 2: namespace + source */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs text-muted-foreground">
        <span className="truncate">{dataset.namespace}</span>
        <span className="shrink-0 ml-2 flex items-center gap-1 truncate max-w-[200px]">
          <HardDrive className="w-3 h-3" />
          {dataset.source || t('fluid.noSource', 'no source')}
        </span>
      </div>

      {/* Row 3: size + file count */}
      {dataset.totalSize && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {dataset.totalSize && <span>{dataset.totalSize}</span>}
          {dataset.fileCount > 0 && (
            <span>{dataset.fileCount.toLocaleString()} {t('fluid.files', 'files')}</span>
          )}
        </div>
      )}

      {/* Row 4: cache bar */}
      {dataset.status === 'bound' && <CacheBar percent={dataset.cachedPercentage} />}
    </div>
  )
}

function RuntimeRow({ runtime }: { runtime: FluidRuntime }) {
  const { t } = useTranslation('cards')
  const cfg = RUNTIME_STATUS_CONFIG[runtime.status]

  return (
    <div className="rounded-md bg-muted/30 px-3 py-2 space-y-1">
      {/* Row 1: name + status */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {cfg.icon}
          <span className="text-xs font-medium truncate">{runtime.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">
            {runtime.type}
          </span>
          <span className={`text-xs ${cfg.color}`}>{cfg.label}</span>
        </div>
      </div>

      {/* Row 2: namespace + worker counts */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs text-muted-foreground">
        <span className="truncate">{runtime.namespace}</span>
        <span className="shrink-0 ml-2 flex items-center gap-3">
          <span title="Master pods">
            M {runtime.masterReady.ready}/{runtime.masterReady.total}
          </span>
          <span title="Worker pods">
            W {runtime.workerReady.ready}/{runtime.workerReady.total}
          </span>
          <span title="Fuse pods">
            F {runtime.fuseReady.ready}/{runtime.fuseReady.total}
          </span>
        </span>
      </div>

      {/* Row 3: cache capacity */}
      {(runtime.cacheCapacity || runtime.cacheUsed) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Layers className="w-3 h-3" />
          <span>
            {t('fluid.cacheUsage', 'Cache')}: {runtime.cacheUsed || '0'} / {runtime.cacheCapacity || '—'}
          </span>
        </div>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-secondary/50'
      }`}
    >
      {icon}
      {label}
      <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
        active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
      }`}>
        {count}
      </span>
    </button>
  )
}

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
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
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
      </div>

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
