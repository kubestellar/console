/**
 * OpenFGA Status Card
 *
 * OpenFGA is a CNCF Sandbox fine-grained authorization system inspired by
 * Google's Zanzibar paper. This card surfaces the reachable endpoint, store
 * and authorization-model counts, relationship-tuple totals, per-API
 * throughput (Check / Expand / ListObjects), and latency percentiles — the
 * primary operational signals from an OpenFGA server.
 *
 * Follows the spiffe_status / linkerd_status pattern for structure and styling.
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real OpenFGA server bridge lands (`/api/openfga/status`), the hook's fetcher
 * will pick up live data automatically with no component changes.
 */

import {
  AlertTriangle,
  CheckCircle,
  Database,
  FileCode,
  Gauge,
  Layers,
  RefreshCw,
  Shield,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useCachedOpenfga } from '../../../hooks/useCachedOpenfga'
import type {
  OpenfgaAuthorizationModel,
  OpenfgaStore,
  OpenfgaStoreStatus,
} from './demoData'
import { formatTimeAgo } from '../../../lib/formatters'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const SKELETON_TITLE_WIDTH = 140
const SKELETON_TITLE_HEIGHT = 28
const SKELETON_BADGE_WIDTH = 90
const SKELETON_BADGE_HEIGHT = 20
const SKELETON_LIST_ITEMS = 5

const MAX_STORES_DISPLAYED = 5
const MAX_MODELS_DISPLAYED = 5

// Thousand-separator formatting threshold.
const NUMBER_LOCALE = 'en-US'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(value: number): string {
  return value.toLocaleString(NUMBER_LOCALE)
}

function storeStatusClass(status: OpenfgaStoreStatus): string {
  if (status === 'active') return 'bg-green-500/20 text-green-400'
  if (status === 'paused') return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-red-500/20 text-red-400'
}

// ---------------------------------------------------------------------------
// Subsections
// ---------------------------------------------------------------------------

function StoreRow({ store }: { store: OpenfgaStore }) {
  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-xs font-medium text-foreground truncate font-mono">
            {store.name}
          </span>
        </div>
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${storeStatusClass(
            store.status,
          )}`}
        >
          {store.status}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="truncate">
          {formatNumber(store.tupleCount)} tuples · {store.modelCount} models
        </span>
        <span className="ml-auto shrink-0">
          {formatTimeAgo(store.lastWriteTime)}
        </span>
      </div>
    </div>
  )
}

function ModelRow({ model }: { model: OpenfgaAuthorizationModel }) {
  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-xs font-medium text-foreground truncate font-mono">
            {model.id}
          </span>
        </div>
        <span className="text-[11px] px-1.5 py-0.5 rounded-full shrink-0 bg-purple-500/20 text-purple-400">
          v{model.schemaVersion}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="truncate">
          {model.storeName} · {model.typeCount} types
        </span>
        <span className="ml-auto shrink-0">
          {formatTimeAgo(model.createdAt)}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OpenfgaStatus() {
  const { t } = useTranslation('cards')
  const { data, isRefreshing, error, showSkeleton, showEmptyState } =
    useCachedOpenfga()

  const isHealthy = data.health === 'healthy'
  const stores = data.stores ?? []
  const models = data.models ?? []
  const displayedStores = stores.slice(0, MAX_STORES_DISPLAYED)
  const displayedModels = models.slice(0, MAX_MODELS_DISPLAYED)

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex items-center justify-between">
          <Skeleton
            variant="rounded"
            width={SKELETON_TITLE_WIDTH}
            height={SKELETON_TITLE_HEIGHT}
          />
          <Skeleton
            variant="rounded"
            width={SKELETON_BADGE_WIDTH}
            height={SKELETON_BADGE_HEIGHT}
          />
        </div>
        <SkeletonStats className="grid-cols-2 @md:grid-cols-4" />
        <SkeletonList items={SKELETON_LIST_ITEMS} className="flex-1" />
      </div>
    )
  }

  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">
          {t('openfgaStatus.fetchError', 'Unable to fetch OpenFGA status')}
        </p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Shield className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('openfgaStatus.notInstalled', 'OpenFGA not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'openfgaStatus.notInstalledHint',
            'No OpenFGA server reachable from the connected clusters.',
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* Header — health pill + freshness */}
      <div className="flex items-center justify-between gap-2">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            isHealthy
              ? 'bg-green-500/15 text-green-400'
              : 'bg-yellow-500/15 text-yellow-400'
          }`}
        >
          {isHealthy ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {isHealthy
            ? t('openfgaStatus.healthy', 'Healthy')
            : t('openfgaStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatTimeAgo(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('openfgaStatus.tuples', 'Tuples')}
          value={formatNumber(data.stats.totalTuples)}
          colorClass="text-cyan-400"
          icon={<Database className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('openfgaStatus.stores', 'Stores')}
          value={`${data.stats.totalStores}`}
          colorClass="text-purple-400"
          icon={<Layers className="w-4 h-4 text-purple-400" />}
        />
        <MetricTile
          label={t('openfgaStatus.models', 'Models')}
          value={`${data.stats.totalModels}`}
          colorClass="text-green-400"
          icon={<FileCode className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('openfgaStatus.checkRps', 'Check rps')}
          value={formatNumber(data.stats.rps.check)}
          colorClass="text-yellow-400"
          icon={<Zap className="w-4 h-4 text-yellow-400" />}
        />
      </div>

      {/* Endpoint + lists */}
      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('openfgaStatus.sectionEndpoint', 'Endpoint')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {t('openfgaStatus.server', 'server')}:{' '}
              <span className="text-foreground">{data.stats.serverVersion}</span>
            </span>
          </div>
          <div className="rounded-md bg-secondary/30 px-3 py-2 text-xs font-mono text-foreground">
            {data.summary.endpoint}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('openfgaStatus.sectionLatency', 'Latency (ms)')}
            </h4>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md bg-secondary/30 px-3 py-2 flex flex-col items-center">
              <span className="text-[11px] text-muted-foreground">p50</span>
              <span className="text-sm font-mono text-foreground">
                {data.stats.latency.p50}
              </span>
            </div>
            <div className="rounded-md bg-secondary/30 px-3 py-2 flex flex-col items-center">
              <span className="text-[11px] text-muted-foreground">p95</span>
              <span className="text-sm font-mono text-foreground">
                {data.stats.latency.p95}
              </span>
            </div>
            <div className="rounded-md bg-secondary/30 px-3 py-2 flex flex-col items-center">
              <span className="text-[11px] text-muted-foreground">p99</span>
              <span className="text-sm font-mono text-foreground">
                {data.stats.latency.p99}
              </span>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('openfgaStatus.sectionStores', 'Stores')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {stores.length}
            </span>
          </div>

          {stores.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('openfgaStatus.noStores', 'No OpenFGA stores found')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(displayedStores ?? []).map(store => (
                <StoreRow key={store.id} store={store} />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('openfgaStatus.sectionModels', 'Authorization models')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {models.length}
            </span>
          </div>

          {models.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('openfgaStatus.noModels', 'No authorization models found')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(displayedModels ?? []).map(model => (
                <ModelRow key={model.id} model={model} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default OpenfgaStatus
