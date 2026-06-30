import { useState, useMemo } from 'react'
import {
  Webhook, Activity, CheckCircle, XCircle, AlertCircle,
  Clock, ChevronDown, ChevronUp, Zap,
} from 'lucide-react'
import type { LiveHook, HookActivity, HookStatus, HookEventType } from '../../hooks/useMarketplace/types'
import { emitMarketplaceHookToggled } from '../../lib/analytics-events/marketplace'

const MAX_VISIBLE_ACTIVITIES = 10
const MAX_FAILURE_COUNT_WARNING = 3
const RESPONSE_TIME_GOOD_MS = 500
const RESPONSE_TIME_WARN_MS = 2000

const HOOK_STATUS_CONFIG: Record<HookStatus, { icon: typeof CheckCircle; label: string; colorClass: string }> = {
  active: { icon: CheckCircle, label: 'Active', colorClass: 'text-green-400' },
  inactive: { icon: AlertCircle, label: 'Inactive', colorClass: 'text-muted-foreground' },
  error: { icon: XCircle, label: 'Error', colorClass: 'text-red-400' },
}

const EVENT_TYPE_LABELS: Record<HookEventType, string> = {
  install: 'Install',
  remove: 'Remove',
  update: 'Update',
  'config-change': 'Config Change',
}

function HookStatusBadge({ status }: { status: HookStatus }) {
  const config = HOOK_STATUS_CONFIG[status]
  const Icon = config.icon
  return (
    <span className={`flex items-center gap-1 text-2xs ${config.colorClass}`} aria-label={`Hook status: ${config.label}`}>
      <Icon className="w-3 h-3" aria-hidden="true" />
      {config.label}
    </span>
  )
}

function ResponseTimeBadge({ ms }: { ms: number }) {
  const color = ms < RESPONSE_TIME_GOOD_MS
    ? 'text-green-400'
    : ms < RESPONSE_TIME_WARN_MS
      ? 'text-yellow-400'
      : 'text-red-400'

  return (
    <span className={`text-2xs font-mono ${color}`}>
      {ms}ms
    </span>
  )
}

function HookRow({ hook, onToggle }: {
  hook: LiveHook
  onToggle?: (hookId: string, active: boolean) => void
}) {
  const showWarning = hook.failureCount >= MAX_FAILURE_COUNT_WARNING

  return (
    <div className={`flex items-center justify-between py-2 px-3 rounded-md ${
      showWarning ? 'bg-red-950/30 border border-red-500/20' : 'bg-muted/30'
    }`}>
      <div className="flex items-center gap-3">
        <Webhook className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {EVENT_TYPE_LABELS[hook.eventType] ?? hook.eventType}
            </span>
            <HookStatusBadge status={hook.status} />
          </div>
          <span className="text-2xs text-muted-foreground truncate block max-w-[200px]" title={hook.callbackUrl}>
            {hook.callbackUrl}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {showWarning && (
          <span className="text-2xs text-red-400" title={`${hook.failureCount} consecutive failures`}>
            {hook.failureCount} failures
          </span>
        )}
        {hook.lastTriggeredAt && (
          <span className="text-2xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" aria-hidden="true" />
            {new Date(hook.lastTriggeredAt).toLocaleString()}
          </span>
        )}
        {onToggle && (
          <button
            onClick={() => {
              const nextActive = hook.status !== 'active'
              onToggle(hook.id, nextActive)
              emitMarketplaceHookToggled(hook.itemId, hook.eventType, nextActive)
            }}
            className={`px-2 py-1 text-2xs rounded transition-colors ${
              hook.status === 'active'
                ? 'bg-green-950 text-green-400 hover:bg-red-950 hover:text-red-400'
                : 'bg-muted text-muted-foreground hover:bg-green-950 hover:text-green-400'
            }`}
            aria-label={hook.status === 'active' ? 'Deactivate hook' : 'Activate hook'}
          >
            {hook.status === 'active' ? 'Disable' : 'Enable'}
          </button>
        )}
      </div>
    </div>
  )
}

function ActivityRow({ activity }: { activity: HookActivity }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-2xs">
      <div className="flex items-center gap-2">
        {activity.success ? (
          <CheckCircle className="w-3 h-3 text-green-400" aria-hidden="true" />
        ) : (
          <XCircle className="w-3 h-3 text-red-400" aria-hidden="true" />
        )}
        <span className="text-muted-foreground">
          {EVENT_TYPE_LABELS[activity.eventType] ?? activity.eventType}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <ResponseTimeBadge ms={activity.responseTimeMs} />
        <span className="text-muted-foreground">
          {new Date(activity.triggeredAt).toLocaleTimeString()}
        </span>
      </div>
    </div>
  )
}

interface LiveHookStatusPanelProps {
  itemId: string
  itemName: string
  hooks: LiveHook[]
  activities: HookActivity[]
  onToggleHook?: (hookId: string, active: boolean) => void
}

export function LiveHookStatusPanel({
  itemName,
  hooks,
  activities,
  onToggleHook,
}: LiveHookStatusPanelProps) {
  const [expanded, setExpanded] = useState(false)

  const safeHooks = useMemo(() => hooks || [], [hooks])
  const safeActivities = useMemo(() => activities || [], [activities])

  const activeCount = safeHooks.filter(h => h.status === 'active').length
  const errorCount = safeHooks.filter(h => h.status === 'error').length
  const visibleActivities = expanded
    ? safeActivities.slice(0, MAX_VISIBLE_ACTIVITIES)
    : []

  if (safeHooks.length === 0) return null

  return (
    <div className="space-y-3" role="region" aria-label={`Live hooks for ${itemName}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h4 className="text-sm font-medium text-foreground">Live Hooks</h4>
          <span className="text-xs text-muted-foreground">
            {activeCount} active{errorCount > 0 ? `, ${errorCount} error` : ''}
          </span>
        </div>
        {safeActivities.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide activity log' : 'Show activity log'}
          >
            <Activity className="w-3 h-3" aria-hidden="true" />
            Activity
            {expanded
              ? <ChevronUp className="w-3 h-3" />
              : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {safeHooks.map(hook => (
          <HookRow key={hook.id} hook={hook} onToggle={onToggleHook} />
        ))}
      </div>

      {expanded && visibleActivities.length > 0 && (
        <div className="border-t border-border pt-2 space-y-0.5">
          <span className="text-2xs text-muted-foreground uppercase tracking-wider">
            Recent Activity
          </span>
          {visibleActivities.map((a, i) => (
            <ActivityRow key={`${a.hookId}-${a.triggeredAt}-${i}`} activity={a} />
          ))}
          {safeActivities.length > MAX_VISIBLE_ACTIVITIES && (
            <span className="text-2xs text-muted-foreground italic">
              +{safeActivities.length - MAX_VISIBLE_ACTIVITIES} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}
