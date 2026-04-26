import { useState } from 'react'
import { StatTile } from '../shared/StatTile'
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Zap,
  Server,
  GitBranch,
  Radio,
  ArrowRightLeft,
  Inbox,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton, SkeletonStats, SkeletonList } from '../../ui/Skeleton'
import { RefreshIndicator } from '../../ui/RefreshIndicator'
import { CardSearchInput } from '../../../lib/cards/CardComponents'
import { useKnativeStatus } from './useKnativeStatus'
import { useDemoMode } from '../../../hooks/useDemoMode'
import type {
  KnativeServingService,
  KnativeServiceStatus,
  KnativeEventingBroker,
  KnativeBrokerStatus,
  KnativeTrafficTarget,
} from './demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRAFFIC_FULL_PERCENT = 100
const SERVING_TAB = 'serving' as const
const EVENTING_TAB = 'eventing' as const
type Tab = typeof SERVING_TAB | typeof EVENTING_TAB

// ---------------------------------------------------------------------------
// Status config maps
// ---------------------------------------------------------------------------

const SERVICE_STATUS_CONFIG: Record<
  KnativeServiceStatus,
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

const BROKER_STATUS_CONFIG: Record<
  KnativeBrokerStatus,
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

function TrafficBar({ traffic }: { traffic: KnativeTrafficTarget[] }) {
  if (traffic.length === 0) return null
  const isSingleTarget = traffic.length === 1 && traffic[0].percent === TRAFFIC_FULL_PERCENT

  return (
    <div className="mt-1.5">
      <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
        {(traffic || []).map((t, i) => {
          const isFirst = i === 0
          const isLast = i === traffic.length - 1
          const color = t.latestRevision
            ? 'bg-green-500'
            : i === 1 ? 'bg-blue-500' : 'bg-yellow-500'
          return (
            <div
              key={t.revisionName || i}
              className={`h-full transition-all ${color} ${isFirst ? 'rounded-l-full' : ''} ${isLast ? 'rounded-r-full' : ''}`}
              style={{ width: `${t.percent}%` }}
              title={`${t.revisionName || '@latest'}: ${t.percent}%${t.tag ? ` (${t.tag})` : ''}`}
            />
          )
        })}
      </div>
      {!isSingleTarget && (
        <div className="flex justify-between mt-0.5 text-xs text-muted-foreground tabular-nums">
          {(traffic || []).map((t, i) => (
            <span key={`${t.revisionName ?? 'latest'}-${t.tag ?? 'untagged'}-${i}`}>
              {t.tag || t.revisionName?.split('-').pop() || '@latest'}: {t.percent}%
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function ServiceRow({ svc }: { svc: KnativeServingService }) {
  const { t } = useTranslation('cards')
  const cfg = SERVICE_STATUS_CONFIG[svc.status]
  const traffic = svc.traffic || []

  return (
    <div className="rounded-md bg-muted/30 px-3 py-2 space-y-1.5">
      {/* Row 1: name + status */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {cfg.icon}
          <span className="text-xs font-medium truncate">{svc.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">
            gen {svc.generation}
          </span>
          <span className={`text-xs ${cfg.color}`}>{cfg.label}</span>
        </div>
      </div>

      {/* Row 2: namespace + latest revision */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs text-muted-foreground">
        <span className="truncate">{svc.namespace}</span>
        <span className="shrink-0 ml-2 flex items-center gap-1">
          <GitBranch className="w-3 h-3" />
          {svc.latestReadyRevision || t('knative.noRevision', 'none')}
        </span>
      </div>

      {/* Row 3: traffic split bar */}
      {traffic.length > 0 && <TrafficBar traffic={traffic} />}
    </div>
  )
}

function BrokerRow({ broker }: { broker: KnativeEventingBroker }) {
  const { t } = useTranslation('cards')
  const cfg = BROKER_STATUS_CONFIG[broker.status]

  return (
    <div className="rounded-md bg-muted/30 px-3 py-2 space-y-1">
      {/* Row 1: name + status */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {cfg.icon}
          <span className="text-xs font-medium truncate">{broker.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">
            {broker.triggerCount} {t('knative.triggers', 'triggers')}
          </span>
          <span className={`text-xs ${cfg.color}`}>{cfg.label}</span>
        </div>
      </div>

      {/* Row 2: namespace + class + DLS */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs text-muted-foreground">
        <span className="truncate">{broker.namespace} › {broker.brokerClass}</span>
        {broker.hasDeadLetterSink && (
          <span className="shrink-0 ml-2 flex items-center gap-1 text-cyan-400">
            <Inbox className="w-3 h-3" />
            {t('knative.deadLetterSink', 'DLS')}
          </span>
        )}
      </div>
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
        <SkeletonStats className="grid-cols-4" />
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
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
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
      </div>

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
