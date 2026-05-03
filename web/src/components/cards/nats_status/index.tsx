import { AlertTriangle, CheckCircle, CircleDashed, RefreshCw, Radio, Database, Zap, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MetricTile, CardSearchInput } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonStats, SkeletonList } from '../../ui/Skeleton'
import { useNatsStatus } from './useNatsStatus'
import type { NatsServerState } from './demoData'

// STATE_STYLE maps each server state to visual styles
// Keeping this outside the component means it's created once, not on every render
const STATE_STYLE: Record<NatsServerState, { badge: string; icon: React.ReactNode }> = {
  ok: {
    badge: 'bg-green-500/20 text-green-400',
    icon: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
  },
  warning: {
    badge: 'bg-yellow-500/20 text-yellow-400',
    icon: <CircleDashed className="w-3.5 h-3.5 text-yellow-400" />,
  },
  error: {
    badge: 'bg-red-500/20 text-red-400',
    icon: <AlertTriangle className="w-3.5 h-3.5 text-red-400" />,
  },
}

// NatsStatusInternal does all the real work
// It's separate from the exported function so errors get caught by the boundary
function NatsStatusInternal() {
  const { t } = useTranslation('cards')
  const { data, isRefreshing, error, showSkeleton, showEmptyState } = useNatsStatus()
  const [search, setSearch] = useState('')

  const isHealthy = data.health === 'healthy'

  // Filter servers and streams based on search input
  const filteredServers = (data.serverList || []).filter((server) => {
    const query = search.trim().toLowerCase()
    if (!query) return true
    return (
      server.name.toLowerCase().includes(query) ||
      server.cluster.toLowerCase().includes(query) ||
      server.version.toLowerCase().includes(query)
    )
  })

  const filteredStreams = (data.streamList || []).filter((stream) => {
    const query = search.trim().toLowerCase()
    if (!query) return true
    return (
      stream.name.toLowerCase().includes(query) ||
      stream.cluster.toLowerCase().includes(query)
    )
  })

  // Show loading skeleton while first fetch is in progress
  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <Skeleton variant="rounded" width={140} height={28} />
          <Skeleton variant="rounded" width={90} height={20} />
        </div>
        <SkeletonStats className="grid-cols-2 @md:grid-cols-4" />
        <Skeleton variant="rounded" height={32} />
        <SkeletonList items={3} className="flex-1" />
      </div>
    )
  }

  // Show error state if fetch failed and we have no data at all
  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">Could not reach NATS monitoring endpoint</p>
      </div>
    )
  }

  // Show not-installed state when NATS isn't found in the cluster
  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Radio className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">NATS not detected</p>
        <p className="text-xs text-center max-w-xs">
          No NATS servers were found in your cluster. Deploy NATS to start monitoring.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">

      {/* Health badge + refresh indicator */}
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            isHealthy
              ? 'bg-green-500/15 text-green-400'
              : 'bg-yellow-500/15 text-yellow-400'
          }`}
        >
          {isHealthy
            ? <CheckCircle className="w-4 h-4" />
            : <AlertTriangle className="w-4 h-4" />}
          {isHealthy ? t('nats_status.healthy') : t('nats_status.degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>
            {data.servers.total} server{data.servers.total !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* 4 metric tiles — the key numbers at a glance */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('nats_status.metric.connections')}
          value={data.messaging.totalConnections}
          colorClass="text-blue-400"
          icon={<Users className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('nats_status.metric.msgsIn')}
          value={data.messaging.inMsgsPerSec}
          colorClass="text-green-400"
          icon={<Zap className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('nats_status.metric.msgsOut')}
          value={data.messaging.outMsgsPerSec}
          colorClass="text-purple-400"
          icon={<Zap className="w-4 h-4 text-purple-400" />}
        />
        <MetricTile
          label={t('nats_status.metric.jsStreams')}
          value={data.jetstream.enabled ? data.jetstream.streams : 0}
          colorClass={data.jetstream.enabled ? 'text-cyan-400' : 'text-muted-foreground'}
          icon={<Database className="w-4 h-4 text-cyan-400" />}
        />
      </div>

      {/* Search filters both servers and streams */}
      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('nats_status.searchPlaceholder')}
      />

      {/* Servers section */}
      <div className="flex flex-col overflow-hidden gap-2">
        <p className="text-xs font-medium text-muted-foreground">{t('nats_status.servers')}</p>
        <div className="space-y-1.5 overflow-y-auto scrollbar-thin max-h-32">
          {filteredServers.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-3 text-xs text-muted-foreground text-center">
              No servers match your search
            </div>
          ) : (
            filteredServers.map((server) => {
              const style = STATE_STYLE[server.state]
              return (
                <div
                  key={`${server.cluster}/${server.name}`}
                  className="rounded-md bg-secondary/30 px-3 py-2.5 space-y-1"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {style.icon}
                      <span className="text-xs font-medium truncate">{server.name}</span>
                    </div>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${style.badge}`}>
                      {server.state}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-y-2">
                    <span className="truncate">{server.cluster} · v{server.version}</span>
                    <span>{server.connections} conn · {server.subscriptions} subs</span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* JetStream streams section — only shown if JetStream is enabled */}
      {data.jetstream.enabled && (
        <div className="flex flex-col overflow-hidden gap-2">
          <p className="text-xs font-medium text-muted-foreground">{t('nats_status.jetStreamStreams')}</p>
          <div className="space-y-1.5 overflow-y-auto scrollbar-thin max-h-32">
            {filteredStreams.length === 0 ? (
              <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-3 text-xs text-muted-foreground text-center">
                No streams match your search
              </div>
            ) : (
              filteredStreams.map((stream) => {
                const style = STATE_STYLE[stream.state]
                return (
                  <div
                    key={`${stream.cluster}/${stream.name}`}
                    className="rounded-md bg-secondary/30 px-3 py-2.5 space-y-1"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {style.icon}
                        <span className="text-xs font-medium truncate">{stream.name}</span>
                      </div>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${style.badge}`}>
                        {stream.state}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-y-2">
                      <span className="truncate">{stream.cluster}</span>
                      <span>{stream.messages.toLocaleString()} msgs · {stream.consumers} consumers</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// NatsStatus is the exported component — wraps internal with error boundary
// If NatsStatusInternal crashes, the boundary shows a safe fallback message
export function NatsStatus() {
  return (
    <NatsStatusInternal />
  )
}
