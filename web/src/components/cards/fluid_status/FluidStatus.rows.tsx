import { CheckCircle, AlertTriangle, XCircle, HardDrive, Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
export const DATASETS_TAB = 'datasets' as const
export const RUNTIMES_TAB = 'runtimes' as const
export type Tab = typeof DATASETS_TAB | typeof RUNTIMES_TAB

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

export function DatasetRow({ dataset }: { dataset: FluidDataset }) {
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

export function RuntimeRow({ runtime }: { runtime: FluidRuntime }) {
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

export function TabButton({
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
