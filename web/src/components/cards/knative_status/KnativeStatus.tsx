import { useState } from 'react'
import { StatTile } from '../shared/StatTile'
import { StatGrid } from '../../ui/StatGrid'
import {
  CheckCircle,
  AlertTriangle,
  Zap,
  Server,
  GitBranch,
  Radio,
  ArrowRightLeft,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton, SkeletonStats, SkeletonList } from '../../ui/Skeleton'
import { RefreshIndicator } from '../../ui/RefreshIndicator'
import { CardSearchInput } from '../../../lib/cards/CardComponents'
import { useKnativeStatus } from './useKnativeStatus'
import { useDemoMode } from '../../../hooks/useDemoMode'
import {
  SERVING_TAB,
  EVENTING_TAB,
  ServiceRow,
  BrokerRow,
  TabButton,
  type Tab,
} from './KnativeStatus.rows'

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function KnativeStatus() {
  const { t } = useTranslation('cards')
  useDemoMode()

  const {
    data,
    isRefreshing,
    error,
    showSkeleton,
    showEmptyState,
    lastRefresh,
  } = useKnativeStatus()

  const [activeTab, setActiveTab] = useState<Tab>(SERVING_TAB)
  const [search, setSearch] = useState('')

  // Guard against undefined nested data from API/cache
  const services = data.services || []
  const revisions = data.revisions || []
  const brokers = data.brokers || []
  const servingPods = data.servingControllerPods || { ready: 0, total: 0 }
  const eventingPods = data.eventingControllerPods || { ready: 0, total: 0 }

  // Derived stats
  const stats = {
    services: services.length,
    revisions: revisions.length,
    brokers: brokers.length,
    issues:
      services.filter(s => s.status !== 'ready').length +
      brokers.filter(b => b.status !== 'ready').length,
  }

  // Filtered lists
  const filteredServices = (() => {
    if (!search.trim()) return services
    const q = search.toLowerCase()
    return services.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        s.namespace.toLowerCase().includes(q) ||
        s.latestReadyRevision.toLowerCase().includes(q) ||
        (s.traffic || []).some(t => t.revisionName.toLowerCase().includes(q)),
    )
  })()

  const filteredBrokers = (() => {
    if (!search.trim()) return brokers
    const q = search.toLowerCase()
    return brokers.filter(
      b =>
        b.name.toLowerCase().includes(q) ||
        b.namespace.toLowerCase().includes(q) ||
        b.brokerClass.toLowerCase().includes(q),
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
          {t('knative.fetchError', 'Failed to fetch Knative status')}
        </p>
      </div>
    )
  }

  // ── Not installed ──────────────────────────────────────────────────────────
  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Zap className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('knative.notInstalled', 'Knative not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'knative.notInstalledHint',
            'No Knative controller pods found. Deploy Knative to enable serverless workloads.',
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
              ? t('knative.healthy', 'Healthy')
              : t('knative.degraded', 'Degraded')}
          </div>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Server className="w-3 h-3" />
            {servingPods.ready}/{servingPods.total} {t('knative.servingPods', 'serving')}
          </span>
          {eventingPods.total > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Radio className="w-3 h-3" />
              {eventingPods.ready}/{eventingPods.total} {t('knative.eventingPods', 'eventing')}
            </span>
          )}
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
          icon={<Zap className="w-4 h-4 text-blue-400" />}
          label={t('knative.services', 'Services')}
          value={stats.services}
          colorClass="text-blue-400"
          borderClass="border-blue-500/20"
        />
        <StatTile
          icon={<GitBranch className="w-4 h-4 text-cyan-400" />}
          label={t('knative.revisions', 'Revisions')}
          value={stats.revisions}
          colorClass="text-cyan-400"
          borderClass="border-cyan-500/20"
        />
        <StatTile
          icon={<Radio className="w-4 h-4 text-purple-400" />}
          label={t('knative.brokers', 'Brokers')}
          value={stats.brokers}
          colorClass="text-purple-400"
          borderClass="border-purple-500/20"
        />
        <StatTile
          icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
          label={t('knative.issues', 'Issues')}
          value={stats.issues}
          colorClass="text-red-400"
          borderClass="border-red-500/20"
        />
      </StatGrid>

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1">
        <TabButton
          active={activeTab === SERVING_TAB}
          onClick={() => { setActiveTab(SERVING_TAB); setSearch('') }}
          icon={<ArrowRightLeft className="w-3.5 h-3.5" />}
          label={t('knative.serving', 'Serving')}
          count={services.length}
        />
        <TabButton
          active={activeTab === EVENTING_TAB}
          onClick={() => { setActiveTab(EVENTING_TAB); setSearch('') }}
          icon={<Radio className="w-3.5 h-3.5" />}
          label={t('knative.eventing', 'Eventing')}
          count={brokers.length}
        />
      </div>

      {/* ── Search ── */}
      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder={
          activeTab === SERVING_TAB
            ? t('knative.searchServicesPlaceholder', 'Search services…')
            : t('knative.searchBrokersPlaceholder', 'Search brokers…')
        }
      />

      {/* ── Content list ── */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {activeTab === SERVING_TAB ? (
          filteredServices.length > 0 ? (
            filteredServices.map(svc => (
              <ServiceRow key={`${svc.namespace}/${svc.name}`} svc={svc} />
            ))
          ) : services.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1 py-6">
              <Zap className="w-6 h-6 opacity-40" />
              <p className="text-sm">{t('knative.noServices', 'No services found')}</p>
              <p className="text-xs text-center">
                {t('knative.noServicesHint', 'Knative Serving data requires the serving.knative.dev CRD API.')}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
              {t('knative.noSearchResults', 'No results match your search.')}
            </div>
          )
        ) : (
          filteredBrokers.length > 0 ? (
            filteredBrokers.map(b => (
              <BrokerRow key={`${b.namespace}/${b.name}`} broker={b} />
            ))
          ) : brokers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1 py-6">
              <Radio className="w-6 h-6 opacity-40" />
              <p className="text-sm">{t('knative.noBrokers', 'No brokers found')}</p>
              <p className="text-xs text-center">
                {t('knative.noBrokersHint', 'Knative Eventing data requires the eventing.knative.dev CRD API.')}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
              {t('knative.noSearchResults', 'No results match your search.')}
            </div>
          )
        )}
      </div>
    </div>
  )
}
