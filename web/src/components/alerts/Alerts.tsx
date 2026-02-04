import { useState, useEffect, useCallback } from 'react'
import { AlertCircle } from 'lucide-react'
import { useAlerts, useAlertRules } from '../../hooks/useAlerts'
import { useClusters } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards'
import { getDefaultCards } from '../../config/dashboards'

const ALERTS_STORAGE_KEY = 'kubestellar-alerts-dashboard-cards'

// Default cards for the alerts dashboard
const DEFAULT_ALERT_CARDS = getDefaultCards('alerts')

export function Alerts() {
  const { stats, evaluateConditions } = useAlerts()
  const { rules } = useAlertRules()
  const { isRefreshing: dataRefreshing, refetch, error } = useClusters()
  const { drillToAlert } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

  // Local state for last updated time
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>(undefined)

  // Set initial lastUpdated on mount
  useEffect(() => {
    setLastUpdated(new Date())
  }, [])

  const handleRefresh = useCallback(() => {
    refetch()
    evaluateConditions()
    setLastUpdated(new Date())
  }, [refetch, evaluateConditions])

  const enabledRulesCount = rules.filter(r => r.enabled).length

  // Stats value getter
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    const disabledRulesCount = rules.filter(r => !r.enabled).length
    const drillToFiringAlert = () => {
      drillToAlert('all', undefined, 'Active Alerts', { status: 'firing', count: stats.firing })
    }
    const drillToResolvedAlert = () => {
      drillToAlert('all', undefined, 'Resolved Alerts', { status: 'resolved', count: stats.resolved })
    }

    switch (blockId) {
      case 'firing':
        return { value: stats.firing, sublabel: 'active alerts', onClick: drillToFiringAlert, isClickable: stats.firing > 0 }
      case 'pending':
        return { value: 0, sublabel: 'pending', isClickable: false }
      case 'resolved':
        return { value: stats.resolved, sublabel: 'resolved', onClick: drillToResolvedAlert, isClickable: stats.resolved > 0 }
      case 'rules_enabled':
        return { value: enabledRulesCount, sublabel: 'rules enabled', isClickable: false }
      case 'rules_disabled':
        return { value: disabledRulesCount, sublabel: 'rules disabled', isClickable: false }
      default:
        return { value: 0 }
    }
  }, [stats, enabledRulesCount, rules, drillToAlert])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  return (
    <DashboardPage
      title="Alerts"
      subtitle="Monitor alerts and rules across clusters"
      icon="Bell"
      storageKey={ALERTS_STORAGE_KEY}
      defaultCards={DEFAULT_ALERT_CARDS}
      statsType="alerts"
      getStatValue={getStatValue}
      onRefresh={handleRefresh}
      isLoading={false}
      isRefreshing={dataRefreshing}
      lastUpdated={lastUpdated}
      hasData={stats.firing > 0 || enabledRulesCount > 0}
      emptyState={{
        title: 'Alerts Dashboard',
        description: 'Add cards to monitor alerts, rules, and issues across your clusters.',
      }}
    >
      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">Error loading alert data</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}
    </DashboardPage>
  )
}
