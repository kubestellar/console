import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useCachedNodes } from '../../hooks/useCachedData'
import { StatusBadge } from '../ui/StatusBadge'
import { useKubectl } from '../../hooks/useKubectl'
import { useCardLoadingState } from './CardDataContext'
import { useDemoMode } from '../../hooks/useDemoMode'

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
  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoMode || isDemoFallback,
    isFailed,
    consecutiveFailures,
  })

  const [filter, setFilter] = useState<ConditionFilter>('all')
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<PendingAction | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const summary = useMemo(() => {
    const cordoned = nodes.filter(n => n.unschedulable)
    const pressure = nodes.filter(n => {
      const conditions = n.conditions || []
      return conditions.some((c: { type: string; status: string }) =>
        c.type !== 'Ready' && c.status === 'True'
      )
    })
    const healthy = nodes.filter(n => {
      const conditions = n.conditions || []
      const ready = conditions.find((c: { type: string }) => c.type === 'Ready')
      return ready && (ready as { status: string }).status === 'True' && !n.unschedulable
    })
    return { total: nodes.length, healthy: healthy.length, cordoned: cordoned.length, pressure: pressure.length }
  }, [nodes])

  const filtered = useMemo(() => {
    switch (filter) {
      case 'healthy':
        return nodes.filter(n => {
          const conditions = n.conditions || []
          const ready = conditions.find((c: { type: string }) => c.type === 'Ready')
          return ready && (ready as { status: string }).status === 'True' && !n.unschedulable
        })
      case 'cordoned':
        return nodes.filter(n => n.unschedulable)
      case 'pressure':
        return nodes.filter(n => {
          const conditions = n.conditions || []
          return conditions.some((c: { type: string; status: string }) =>
            c.type !== 'Ready' && c.status === 'True'
          )
        })
      default:
        return nodes
    }
  }, [nodes, filter])

  /** Show confirmation dialog before executing cordon/uncordon */
  const requestAction = useCallback((nodeName: string, cluster: string, action: 'cordon' | 'uncordon') => {
    setActionError(null)
    setConfirmAction({ nodeName, cluster, action })
  }, [])

  /** Execute the confirmed cordon/uncordon action */
  const executeConfirmedAction = useCallback(async () => {
    if (!confirmAction) return
    const { nodeName, cluster, action } = confirmAction
    setConfirmAction(null)
    setActionPending(nodeName)
    setActionError(null)
    try {
      await execute(cluster, [action, nodeName])
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to ${action} node`
      setActionError(`${action} ${nodeName}: ${message}`)
    } finally {
      setActionPending(null)
    }
  }, [confirmAction, execute])

  const cancelAction = useCallback(() => {
    setConfirmAction(null)
  }, [])

  if (isLoading && nodes.length === 0) {
    return (
      <div className="space-y-2 p-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-10 rounded bg-muted/50 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2 p-1">
      {/* Confirmation dialog for cordon/uncordon */}
      {confirmAction && (
        <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs space-y-2">
          <div className="font-medium text-yellow-300">
            {t('nodeConditions.confirmTitle', {
              action: confirmAction.action === 'cordon' ? t('nodeConditions.cordon') : t('nodeConditions.uncordon'),
              node: confirmAction.nodeName,
            })}
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
        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-2 text-red-300 hover:text-red-200">
            ✕
          </button>
        </div>
      )}

      <div className="flex gap-2 text-xs">
        {(['all', 'healthy', 'cordoned', 'pressure'] as ConditionFilter[]).map(f => {
          const count = f === 'all' ? summary.total : summary[f]
          const colors: Record<ConditionFilter, string> = {
            all: 'bg-muted/50 text-foreground',
            healthy: 'bg-green-500/10 text-green-400',
            cordoned: 'bg-yellow-500/10 text-yellow-400',
            pressure: 'bg-red-500/10 text-red-400',
          }
          const filterLabels: Record<ConditionFilter, string> = {
            all: t('nodeConditions.filterAll'),
            healthy: t('nodeConditions.filterHealthy'),
            cordoned: t('nodeConditions.filterCordoned'),
            pressure: t('nodeConditions.filterPressure'),
          }
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-1 rounded-full transition-colors ${
                filter === f ? colors[f] + ' ring-1 ring-current' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {filterLabels[f]}: {count}
            </button>
          )
        })}
      </div>

      <div className="space-y-1 max-h-[300px] overflow-y-auto">
        {filtered.slice(0, 20).map(node => {
          const conditions = (node.conditions || []) as Array<{ type: string; status: string }>
          const ready = conditions.find(c => c.type === 'Ready')
          const isReady = ready?.status === 'True'
          const pressures = conditions.filter(c => c.type !== 'Ready' && c.status === 'True')

          return (
            <div key={`${node.cluster}-${node.name}`} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
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
        {filtered.length > 20 && (
          <div className="text-xs text-muted-foreground text-center py-1">
            {t('nodeConditions.moreNodes', { count: filtered.length - 20 })}
          </div>
        )}
      </div>
    </div>
  )
}
