import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCachedNodes } from '../../hooks/useCachedData'
import { StatusBadge } from '../ui/StatusBadge'
import { useKubectl } from '../../hooks/useKubectl'
import { useCardLoadingState } from './CardDataContext'
import { CardEmptyState } from '../../lib/cards/CardComponents'
import { Server } from 'lucide-react'
import { useDemoMode } from '../../hooks/useDemoMode'

const MAX_VISIBLE_CONDITIONS = 20

type ConditionFilter = 'all' | 'healthy' | 'cordoned' | 'pressure'

/** Confirmation dialog state for cordon/uncordon actions */
interface PendingAction {
  nodeName: string
  cluster: string
  action: 'cordon' | 'uncordon'
}

export function NodeConditions() {
  const { t } = useTranslation('cards')
  const { nodes, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures } = useCachedNodes()
  const { isDemoMode } = useDemoMode()
  const { execute } = useKubectl()

  const hasData = nodes.length > 0
  const { showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoMode || isDemoFallback,
    isFailed,
    consecutiveFailures })

  const [filter, setFilter] = useState<ConditionFilter>('all')
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<PendingAction | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Mutually-exclusive classification so the pill counts always sum to the
  // total: a node with Ready!=True and no other True conditions (network
  // partition, NotReady) otherwise lands in no bucket, and a cordoned node
  // with pressure was being double-counted (#8297). Priority: cordoned >
  // pressure > healthy.
  const classify = (n: { unschedulable?: boolean; conditions?: Array<{ type: string; status: string }> }): Exclude<ConditionFilter, 'all'> => {
    if (n.unschedulable) return 'cordoned'
    const conditions = n.conditions || []
    const ready = conditions.find(c => c.type === 'Ready')
    const isReady = ready?.status === 'True'
    const hasOtherPressure = conditions.some(c => c.type !== 'Ready' && c.status === 'True')
    if (!isReady || hasOtherPressure) return 'pressure'
    return 'healthy'
  }

  const summary = (() => {
    let healthy = 0, cordoned = 0, pressure = 0
    for (const n of nodes) {
      const bucket = classify(n)
      if (bucket === 'healthy') healthy++
      else if (bucket === 'cordoned') cordoned++
      else pressure++
    }
    return { total: nodes.length, healthy, cordoned, pressure }
  })()

  const filtered = useMemo(() => {
    if (filter === 'all') return nodes
    return nodes.filter(n => classify(n) === filter)
  }, [nodes, filter])

  /** Show confirmation dialog before executing cordon/uncordon */
  const requestAction = (nodeName: string, cluster: string, action: 'cordon' | 'uncordon') => {
    setActionError(null)
    setConfirmAction({ nodeName, cluster, action })
  }

  /** Execute the confirmed cordon/uncordon action */
  const executeConfirmedAction = async () => {
    if (!confirmAction) return
    const { nodeName, cluster, action } = confirmAction
    setConfirmAction(null)
    setActionPending(nodeName)
    setActionError(null)
    try {
      await execute(cluster, [action, nodeName])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : `Failed to ${action} node`
      setActionError(`${action} ${nodeName}: ${message}`)
    } finally {
      setActionPending(null)
    }
  }

  const cancelAction = () => {
    setConfirmAction(null)
  }

  if (isLoading && nodes.length === 0) {
    return (
      <div className="space-y-2 p-1 min-h-card">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-10 rounded bg-muted/50 animate-pulse" />
        ))}
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <CardEmptyState
        icon={Server}
        title={t('nodeConditions.emptyTitle', 'No nodes found')}
        message={t('nodeConditions.emptyMessage', 'Node conditions will appear here once clusters with nodes are connected.')}
      />
    )
  }

  return (
    <div className="space-y-2 p-1 min-h-card">
      {/* Confirmation dialog for cordon/uncordon */}
      {confirmAction && (
        <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs space-y-2">
          <div className="font-medium text-yellow-300">
            {t('nodeConditions.confirmTitle', {
              action: confirmAction.action === 'cordon' ? t('nodeConditions.cordon') : t('nodeConditions.uncordon'),
              node: confirmAction.nodeName })}
          </div>
          <div className="text-muted-foreground">
            {confirmAction.action === 'cordon'
              ? t('nodeConditions.confirmCordonDescription')
              : t('nodeConditions.confirmUncordonDescription')}
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={cancelAction}
              className="px-2 py-1 rounded bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
            >
              {t('nodeConditions.cancel')}
            </button>
            <button
              onClick={executeConfirmedAction}
              className={`px-2 py-1 rounded transition-colors ${
                confirmAction.action === 'cordon'
                  ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300'
                  : 'bg-green-500/20 hover:bg-green-500/30 text-green-300'
              }`}
            >
              {confirmAction.action === 'cordon' ? t('nodeConditions.cordon') : t('nodeConditions.uncordon')}
            </button>
          </div>
        </div>
      )}

      {/* Error toast for failed actions */}
      {actionError && (
        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex flex-wrap items-center justify-between gap-y-2">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-2 text-red-300 hover:text-red-200">
            ✕
          </button>
        </div>
      )}

      {/* Pill container: flex-wrap + overflow-hidden prevents pills from
          escaping the card when labels are long (translated languages,
          large counts). Previously pills overflowed horizontally and their
          native title tooltip rendered outside the card bounds (#6457). */}
      <div className="flex flex-wrap gap-2 text-xs max-w-full overflow-hidden">
        {(['all', 'healthy', 'cordoned', 'pressure'] as ConditionFilter[]).map(f => {
          const count = f === 'all' ? summary.total : summary[f]
          const colors: Record<ConditionFilter, string> = {
            all: 'bg-muted/50 text-foreground',
            healthy: 'bg-green-500/10 text-green-400',
            cordoned: 'bg-yellow-500/10 text-yellow-400',
            pressure: 'bg-red-500/10 text-red-400' }
          const filterLabels: Record<ConditionFilter, string> = {
            all: t('nodeConditions.filterAll'),
            healthy: t('nodeConditions.filterHealthy'),
            cordoned: t('nodeConditions.filterCordoned'),
            pressure: t('nodeConditions.filterPressure') }
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              title={`${filterLabels[f]}: ${count}`}
              className={`px-2 py-1 rounded-full transition-colors max-w-full truncate ${
                // ring-inset keeps the selected-state ring inside the pill's
                // border-box so the parent `overflow-hidden` (kept to guard
                // against long translated labels overflowing the card per
                // #6457) doesn't clip the top/bottom 1px of the ring (#7881).
                filter === f ? colors[f] + ' ring-1 ring-inset ring-current' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {filterLabels[f]}: {count}
            </button>
          )
        })}
      </div>

      <div className="space-y-1 max-h-[300px] overflow-y-auto">
        {filtered.slice(0, MAX_VISIBLE_CONDITIONS).map(node => {
          const conditions = (node.conditions || []) as Array<{ type: string; status: string }>
          const ready = conditions.find(c => c.type === 'Ready')
          const isReady = ready?.status === 'True'
          const pressures = conditions.filter(c => c.type !== 'Ready' && c.status === 'True')

          return (
            <div key={`${node.cluster}-${node.name}`} className="flex flex-wrap items-center justify-between gap-y-2 px-2 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  node.unschedulable ? 'bg-yellow-500' :
                  !isReady ? 'bg-red-500' :
                  pressures.length > 0 ? 'bg-orange-500' : 'bg-green-500'
                }`} />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{node.name}</div>
                  <div className="text-xs text-muted-foreground">{node.cluster}</div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {node.unschedulable && (
                  <StatusBadge color="yellow">{t('nodeConditions.cordoned')}</StatusBadge>
                )}
                {pressures.map(p => (
                  <span key={p.type} className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                    {p.type.replace('Pressure', '')}
                  </span>
                ))}
                {node.cluster && (
                  <button
                    disabled={actionPending === node.name}
                    onClick={() => requestAction(
                      node.name,
                      node.cluster!,
                      node.unschedulable ? 'uncordon' : 'cordon'
                    )}
                    className="ml-1 text-xs px-1.5 py-0.5 rounded bg-muted/50 hover:bg-muted text-muted-foreground transition-colors disabled:opacity-50"
                  >
                    {actionPending === node.name ? '...' : node.unschedulable ? t('nodeConditions.uncordon') : t('nodeConditions.cordon')}
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {filtered.length > MAX_VISIBLE_CONDITIONS && (
          <div className="text-xs text-muted-foreground text-center py-1">
            {t('nodeConditions.moreNodes', { count: filtered.length - MAX_VISIBLE_CONDITIONS })}
          </div>
        )}
      </div>
    </div>
  )
}
