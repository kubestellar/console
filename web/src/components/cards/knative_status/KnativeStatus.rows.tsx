import { CheckCircle, AlertTriangle, XCircle, GitBranch, Inbox } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
export const SERVING_TAB = 'serving' as const
export const EVENTING_TAB = 'eventing' as const
export type Tab = typeof SERVING_TAB | typeof EVENTING_TAB

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

export function ServiceRow({ svc }: { svc: KnativeServingService }) {
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

export function BrokerRow({ broker }: { broker: KnativeEventingBroker }) {
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
