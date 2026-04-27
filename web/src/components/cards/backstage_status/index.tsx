/**
 * Backstage Status Card
 *
 * Displays health signals for a CNCF incubating Backstage developer-portal
 * install: replica count, entity catalog inventory (Components, APIs,
 * Systems, Domains, Resources, Users, Groups), installed plugin status,
 * registered scaffolder templates, and the last successful catalog sync.
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real Backstage bridge lands (/api/backstage/status), the hook's fetcher
 * will pick up live data automatically with no component changes.
 */

import {
  AlertTriangle,
  BookOpen,
  CheckCircle,
  Cpu,
  FileCode,
  Hash,
  Layers,
  Package,
  Puzzle,
  RefreshCw,
  Server,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useCachedBackstage } from '../../../hooks/useCachedBackstage'
import { useCardLoadingState } from '../CardDataContext'
import { cn } from '../../../lib/cn'
import {
  BACKSTAGE_ENTITY_KINDS,
  type BackstageEntityKind,
  type BackstagePlugin,
  type BackstagePluginStatus,
  type BackstageScaffolderTemplate,
} from '../../../lib/demo/backstage'
import { MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from '../../../lib/constants/time'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const SKELETON_TITLE_WIDTH = 160
const SKELETON_TITLE_HEIGHT = 28
const SKELETON_BADGE_WIDTH = 90
const SKELETON_BADGE_HEIGHT = 20
const SKELETON_LIST_ITEMS = 5


// Max number of rows the card surfaces per section — keeps the 6-wide card
// height bounded when an install has dozens of plugins or templates.
const PLUGIN_LIST_MAX_ROWS = 5
const TEMPLATE_LIST_MAX_ROWS = 4

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(isoString: string, t: TFunction<'cards'>): string {
  const emDash = '\u2014'
  if (!isoString) return emDash
  const parsedMs = new Date(isoString).getTime()
  if (!Number.isFinite(parsedMs)) return emDash
  const deltaMs = Date.now() - parsedMs
  if (deltaMs < 0) return t('backstageStatus.justNow', 'just now')
  if (deltaMs < MS_PER_MINUTE) return t('backstageStatus.justNow', 'just now')
  if (deltaMs < MS_PER_HOUR) {
    const mins = Math.floor(deltaMs / MS_PER_MINUTE)
    return t('backstageStatus.minutesAgo', '{{count}}m ago', { count: mins })
  }
  if (deltaMs < MS_PER_DAY) {
    const hrs = Math.floor(deltaMs / MS_PER_HOUR)
    return t('backstageStatus.hoursAgo', '{{count}}h ago', { count: hrs })
  }
  const days = Math.floor(deltaMs / MS_PER_DAY)
  return t('backstageStatus.daysAgo', '{{count}}d ago', { count: days })
}

function pluginStatusClass(status: BackstagePluginStatus): string {
  switch (status) {
    case 'enabled':
      return 'bg-green-500/20 text-green-400'
    case 'error':
      return 'bg-red-500/20 text-red-400'
    case 'disabled':
      return 'bg-secondary/40 text-muted-foreground'
    default:
      return 'bg-secondary/40 text-muted-foreground'
  }
}

function PluginRow({
  plugin,
  statusLabel,
}: {
  plugin: BackstagePlugin
  statusLabel: string
}) {
  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 flex items-center justify-between gap-2">
      <div className="min-w-0 flex items-center gap-1.5">
        <Puzzle className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span className="text-xs font-mono truncate" title={plugin.name}>
          {plugin.name}
        </span>
        <span className="text-[11px] text-muted-foreground shrink-0">
          v{plugin.version}
        </span>
      </div>
      <span
        className={cn(
          'text-[11px] px-1.5 py-0.5 rounded-full shrink-0',
          pluginStatusClass(plugin.status),
        )}
      >
        {statusLabel}
      </span>
    </div>
  )
}

function TemplateRow({ template }: { template: BackstageScaffolderTemplate }) {
  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 flex items-center justify-between gap-2">
      <div className="min-w-0 flex items-center gap-1.5">
        <FileCode className="w-3.5 h-3.5 text-purple-400 shrink-0" />
        <span className="text-xs font-mono truncate" title={template.name}>
          {template.name}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] text-muted-foreground">{template.type}</span>
        <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">
          {template.owner}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BackstageStatus() {
  const { t } = useTranslation('cards')
  const {
    data,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  } = useCachedBackstage()

  // The hook already gates `isDemoFallback` on `!isLoading`, so this is a
  // straight passthrough; kept as a local name for symmetry with sibling
  // cards and to make the loading-state call-site self-documenting.
  const isDemoData = isDemoFallback

  // 'not-installed' still counts as "we have data" so the card isn't stuck
  // in skeleton waiting for a `/api/backstage/status` endpoint that won't
  // ever return entities.
  const hasAnyData =
    data.health === 'not-installed' ? true : data.summary.totalEntities > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing,
    isDemoData,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  })

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex items-center justify-between">
          <Skeleton variant="rounded" width={SKELETON_TITLE_WIDTH} height={SKELETON_TITLE_HEIGHT} />
          <Skeleton variant="rounded" width={SKELETON_BADGE_WIDTH} height={SKELETON_BADGE_HEIGHT} />
        </div>
        <SkeletonStats className="grid-cols-2 @md:grid-cols-4" />
        <SkeletonList items={SKELETON_LIST_ITEMS} className="flex-1" />
      </div>
    )
  }

  if (showEmptyState || (data.health === 'not-installed' && !isDemoData)) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Package className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('backstageStatus.notInstalled', 'Backstage not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'backstageStatus.notInstalledHint',
            'No Backstage deployment reachable. Install Backstage to surface developer portal inventory and plugin health here.',
          )}
        </p>
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'
  const plugins = data.plugins ?? []
  const templates = data.templates ?? []
  const catalog = data.catalog

  const pluginStatusLabels: Record<BackstagePluginStatus, string> = {
    enabled: t('backstageStatus.pluginEnabled', 'Enabled'),
    disabled: t('backstageStatus.pluginDisabled', 'Disabled'),
    error: t('backstageStatus.pluginError', 'Error'),
  }

  const kindLabels: Record<BackstageEntityKind, string> = {
    Component: t('backstageStatus.kindComponent', 'Components'),
    API: t('backstageStatus.kindApi', 'APIs'),
    System: t('backstageStatus.kindSystem', 'Systems'),
    Domain: t('backstageStatus.kindDomain', 'Domains'),
    Resource: t('backstageStatus.kindResource', 'Resources'),
    User: t('backstageStatus.kindUser', 'Users'),
    Group: t('backstageStatus.kindGroup', 'Groups'),
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* Header — health pill + freshness */}
      <div className="flex items-center justify-between gap-2">
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
            isHealthy
              ? 'bg-green-500/15 text-green-400'
              : 'bg-yellow-500/15 text-yellow-400',
          )}
        >
          {isHealthy ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {isHealthy
            ? t('backstageStatus.healthy', 'Healthy')
            : t('backstageStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={cn('w-3 h-3', isRefreshing ? 'animate-spin' : '')} />
          <span>
            {t('backstageStatus.version', 'version')}:{' '}
            <span className="text-foreground font-mono">{data.version}</span>
          </span>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('backstageStatus.replicas', 'Replicas')}
          value={`${data.replicas}/${data.desiredReplicas}`}
          colorClass={
            data.desiredReplicas > 0 && data.replicas < data.desiredReplicas
              ? 'text-yellow-400'
              : 'text-cyan-400'
          }
          icon={<Server className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('backstageStatus.entities', 'Entities')}
          value={data.summary.totalEntities}
          colorClass="text-cyan-400"
          icon={<Hash className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('backstageStatus.pluginsEnabled', 'Plugins')}
          value={data.summary.enabledPlugins}
          colorClass={
            data.summary.pluginErrors > 0 ? 'text-yellow-400' : 'text-green-400'
          }
          icon={<Puzzle className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('backstageStatus.templates', 'Templates')}
          value={data.summary.scaffolderTemplates}
          colorClass="text-purple-400"
          icon={<FileCode className="w-4 h-4 text-purple-400" />}
        />
      </div>

      {/* Scrollable body */}
      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        {/* Catalog counts by kind */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('backstageStatus.sectionCatalog', 'Catalog')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {t('backstageStatus.lastSync', 'synced')}:{' '}
              <span className="text-foreground">{formatRelative(data.lastCatalogSync, t)}</span>
            </span>
          </div>
          <div className="grid grid-cols-2 @md:grid-cols-4 gap-1.5">
            {(BACKSTAGE_ENTITY_KINDS ?? []).map(kind => (
              <div
                key={kind}
                className="rounded-md bg-secondary/30 px-2 py-1.5 flex items-center justify-between"
              >
                <span className="text-[11px] text-muted-foreground truncate">
                  {kindLabels[kind] ?? kind}
                </span>
                <span className="text-xs font-mono text-foreground ml-2">
                  {catalog[kind] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Plugins */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-green-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('backstageStatus.sectionPlugins', 'Plugins')}
            </h4>
          </div>
          {plugins.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('backstageStatus.noPlugins', 'No plugins reporting.')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(plugins ?? [])
                .slice(0, PLUGIN_LIST_MAX_ROWS)
                .map(plugin => (
                  <PluginRow
                    key={plugin.name}
                    plugin={plugin}
                    statusLabel={pluginStatusLabels[plugin.status] ?? plugin.status}
                  />
                ))}
            </div>
          )}
        </section>

        {/* Scaffolder templates */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-purple-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('backstageStatus.sectionTemplates', 'Scaffolder templates')}
            </h4>
          </div>
          {templates.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('backstageStatus.noTemplates', 'No scaffolder templates registered.')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(templates ?? [])
                .slice(0, TEMPLATE_LIST_MAX_ROWS)
                .map(template => (
                  <TemplateRow key={template.name} template={template} />
                ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default BackstageStatus
