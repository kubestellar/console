import { AlertTriangle, CheckCircle, Clock, Target, Zap } from 'lucide-react'
import type { TFunction } from 'i18next'
import { cn } from '../../../lib/cn'
import type {
  CustodianPolicy,
  CustodianPolicyMode,
  CustodianTopResource,
  CustodianViolationSeverity,
} from '../../../lib/demo/cloud-custodian'
import { formatTimeAgo } from '../../../lib/formatters'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function policyStatusBadgeClass(policy: CustodianPolicy): string {
  if (policy.failCount > 0) return 'bg-red-500/20 text-red-400'
  if (policy.dryRunCount > 0) return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-green-500/20 text-green-400'
}

function modeBadgeClass(mode: CustodianPolicyMode): string {
  switch (mode) {
    case 'event':
      return 'bg-purple-500/20 text-purple-400'
    case 'periodic':
      return 'bg-cyan-500/20 text-cyan-400'
    case 'pull':
      return 'bg-blue-500/20 text-blue-400'
    default:
      return 'bg-secondary/40 text-muted-foreground'
  }
}

export function severityClass(sev: CustodianViolationSeverity): string {
  switch (sev) {
    case 'critical':
      return 'text-red-400'
    case 'high':
      return 'text-orange-400'
    case 'medium':
      return 'text-yellow-400'
    case 'low':
      return 'text-muted-foreground'
    default:
      return 'text-muted-foreground'
  }
}

function policyStatusLabel(
  policy: CustodianPolicy,
  t: TFunction<'cards'>,
): string {
  if (policy.failCount > 0) return t('cloudCustodianStatus.statusFail', 'Failing')
  if (policy.dryRunCount > 0) return t('cloudCustodianStatus.statusDryRun', 'Dry-run')
  return t('cloudCustodianStatus.statusSuccess', 'Success')
}

function modeLabel(
  mode: CustodianPolicyMode,
  t: TFunction<'cards'>,
): string {
  const modeLabels: Record<CustodianPolicyMode, string> = {
    pull: t('cloudCustodianStatus.modePull', 'pull'),
    periodic: t('cloudCustodianStatus.modePeriodic', 'periodic'),
    event: t('cloudCustodianStatus.modeEvent', 'event'),
  }
  return modeLabels[mode] ?? mode
}

export function PolicyRow({
  policy,
  t,
}: {
  policy: CustodianPolicy
  t: TFunction<'cards'>
}) {
  const isHealthy = policy.failCount === 0 && policy.dryRunCount === 0
  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          {isHealthy ? (
            <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
          ) : policy.failCount > 0 ? (
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
          )}
          <span className="text-xs font-medium font-mono truncate">{policy.name}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={cn(
              'text-xs px-1.5 py-0.5 rounded-full',
              modeBadgeClass(policy.mode),
            )}
          >
            {modeLabel(policy.mode, t)}
          </span>
          <span
            className={cn(
              'text-xs px-1.5 py-0.5 rounded-full',
              policyStatusBadgeClass(policy),
            )}
          >
            {policyStatusLabel(policy, t)}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="truncate">
          <span className="text-foreground font-mono">{policy.resource}</span>
        </span>
        <span className="flex items-center gap-1">
          <Target className="w-3 h-3" />
          {policy.resourcesMatched}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatTimeAgo(policy.lastRunAt)}
        </span>
      </div>
    </div>
  )
}

export function TopResourceRow({ resource }: { resource: CustodianTopResource }) {
  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0 flex items-center gap-1.5">
        <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span className="text-xs font-mono text-foreground truncate">{resource.id}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground">{resource.type}</span>
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-secondary/50 text-cyan-400 font-mono">
          {resource.actionCount}
        </span>
      </div>
    </div>
  )
}
