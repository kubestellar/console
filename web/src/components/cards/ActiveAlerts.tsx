import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import {
  Bell,
  AlertTriangle,
  CheckCircle,
  Clock,
  ChevronRight,
  Bot,
  Server,
  Filter,
  ChevronDown,
  Eye,
  EyeOff,
  ExternalLink,
} from 'lucide-react'
import { useAlerts } from '../../hooks/useAlerts'
import { useGlobalFilters, type SeverityLevel } from '../../hooks/useGlobalFilters'
import { useClusters } from '../../hooks/useMCP'
import { useDrillDown } from '../../hooks/useDrillDown'
import { useMissions } from '../../hooks/useMissions'
import { getSeverityIcon } from '../../types/alerts'
import type { Alert, AlertSeverity } from '../../types/alerts'
import { CardControls } from '../ui/CardControls'

// Format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} min ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

type SortField = 'severity' | 'time'

export function ActiveAlerts() {
  const { activeAlerts, acknowledgedAlerts, stats, acknowledgeAlert, runAIDiagnosis } = useAlerts()
  const { selectedClusters, isAllClustersSelected, selectedSeverities, isAllSeveritiesSelected, customFilter } = useGlobalFilters()
  const { clusters } = useClusters()
  const { open } = useDrillDown()
  const { missions, setActiveMission, openSidebar } = useMissions()

  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const [showAcknowledged, setShowAcknowledged] = useState(false)
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [sortBy, setSortBy] = useState<SortField>('severity')
  const clusterFilterRef = useRef<HTMLDivElement>(null)

  // Combine active and acknowledged alerts when toggle is on
  const allAlertsToShow = useMemo(() => {
    if (showAcknowledged) {
      return [...activeAlerts, ...acknowledgedAlerts]
    }
    return activeAlerts
  }, [activeAlerts, acknowledgedAlerts, showAcknowledged])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clusterFilterRef.current && !clusterFilterRef.current.contains(event.target as Node)) {
        setShowClusterFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Get reachable clusters
  const reachableClusters = useMemo(() => {
    return clusters.filter(c => c.reachable !== false)
  }, [clusters])

  // Get available clusters for local filter
  const availableClustersForFilter = useMemo(() => {
    if (isAllClustersSelected) return reachableClusters
    return reachableClusters.filter(c => selectedClusters.includes(c.name))
  }, [reachableClusters, selectedClusters, isAllClustersSelected])

  const toggleClusterFilter = (clusterName: string) => {
    setLocalClusterFilter(prev => {
      if (prev.includes(clusterName)) {
        return prev.filter(c => c !== clusterName)
      }
      return [...prev, clusterName]
    })
  }

  // Map AlertSeverity to global SeverityLevel for filtering
  const mapAlertSeverityToGlobal = (alertSeverity: AlertSeverity): SeverityLevel[] => {
    switch (alertSeverity) {
      case 'critical': return ['critical']
      case 'warning': return ['warning']
      case 'info': return ['info']
      default: return ['info']
    }
  }

  // Filter and sort alerts
  const filteredAlerts = useMemo(() => {
    let result = allAlertsToShow

    // Apply global cluster filter
    if (!isAllClustersSelected) {
      result = result.filter(a => !a.cluster || selectedClusters.includes(a.cluster))
    }

    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
      result = result.filter(a => !a.cluster || localClusterFilter.includes(a.cluster))
    }

    // Apply global severity filter
    if (!isAllSeveritiesSelected) {
      result = result.filter(a => {
        const mappedSeverities = mapAlertSeverityToGlobal(a.severity)
        return mappedSeverities.some(s => selectedSeverities.includes(s))
      })
    }

    // Apply global custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(a =>
        a.ruleName.toLowerCase().includes(query) ||
        a.message.toLowerCase().includes(query) ||
        (a.cluster?.toLowerCase() || '').includes(query)
      )
    }

    // Sort by selected field
    return result.sort((a, b) => {
      if (sortBy === 'severity') {
        const severityOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }
        const severityDiff = severityOrder[a.severity] - severityOrder[b.severity]
        if (severityDiff !== 0) return severityDiff
        return new Date(b.firedAt).getTime() - new Date(a.firedAt).getTime()
      } else {
        return new Date(b.firedAt).getTime() - new Date(a.firedAt).getTime()
      }
    })
  }, [allAlertsToShow, selectedClusters, isAllClustersSelected, localClusterFilter, sortBy, selectedSeverities, isAllSeveritiesSelected, customFilter])

  // Apply pagination
  const displayedAlerts = useMemo(() => {
    if (limit === 'unlimited') return filteredAlerts
    return filteredAlerts.slice(0, limit)
  }, [filteredAlerts, limit])

  const handleAlertClick = (alert: Alert) => {
    if (alert.cluster) {
      open({
        type: 'cluster',
        title: alert.cluster,
        data: { name: alert.cluster, alert },
      })
    }
  }

  const handleAIDiagnose = (e: React.MouseEvent, alertId: string) => {
    e.stopPropagation()
    runAIDiagnosis(alertId)
  }

  const handleAcknowledge = (e: React.MouseEvent, alertId: string) => {
    e.stopPropagation()
    acknowledgeAlert(alertId)
  }

  // Check if a mission exists for an alert
  const getMissionForAlert = useCallback((alert: Alert) => {
    if (!alert.aiDiagnosis?.missionId) return null
    return missions.find(m => m.id === alert.aiDiagnosis?.missionId) || null
  }, [missions])

  // Open mission sidebar for an alert
  const handleOpenMission = (e: React.MouseEvent, alert: Alert) => {
    e.stopPropagation()
    const mission = getMissionForAlert(alert)
    if (mission) {
      setActiveMission(mission.id)
      openSidebar()
    }
  }

  // Severity indicator badge
  const SeverityBadge = ({ severity }: { severity: AlertSeverity }) => {
    const colors: Record<AlertSeverity, string> = {
      critical: 'bg-red-500/20 text-red-400 border-red-500/30',
      warning: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    }

    return (
      <span
        className={`px-1.5 py-0.5 text-xs rounded border ${colors[severity]}`}
      >
        {severity}
      </span>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-red-400" />
          <span className="text-sm font-medium text-foreground">Active Alerts</span>
          {stats.firing > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
              {stats.firing}
            </span>
          )}
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClustersForFilter.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle acknowledged alerts */}
          <button
            onClick={() => setShowAcknowledged(!showAcknowledged)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
              showAcknowledged
                ? 'bg-green-500/20 border-green-500/30 text-green-400'
                : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
            }`}
            title={showAcknowledged ? 'Hide acknowledged alerts' : 'Show acknowledged alerts'}
          >
            {showAcknowledged ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span>Ack'd</span>
            {acknowledgedAlerts.length > 0 && (
              <span className="ml-0.5 px-1 py-0 text-[10px] rounded-full bg-green-500/30">
                {acknowledgedAlerts.length}
              </span>
            )}
          </button>
          <CardControls
            limit={limit}
            onLimitChange={setLimit}
            sortBy={sortBy}
            onSortChange={setSortBy}
            sortOptions={[
              { value: 'severity', label: 'Severity' },
              { value: 'time', label: 'Time' },
            ]}
          />
        </div>
      </div>

      {/* Cluster Filter */}
      {availableClustersForFilter.length > 1 && (
        <div className="flex items-center gap-2 mb-3">
          <div ref={clusterFilterRef} className="relative">
            <button
              onClick={() => setShowClusterFilter(!showClusterFilter)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
                localClusterFilter.length > 0
                  ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                  : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
              }`}
              title="Filter by cluster"
            >
              <Filter className="w-3 h-3" />
              <span>
                {localClusterFilter.length > 0
                  ? `${localClusterFilter.length} clusters`
                  : 'All clusters'}
              </span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {showClusterFilter && (
              <div className="absolute top-full left-0 mt-1 w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50">
                <div className="p-1">
                  <button
                    onClick={() => setLocalClusterFilter([])}
                    className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                      localClusterFilter.length === 0
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'hover:bg-secondary text-foreground'
                    }`}
                  >
                    All clusters
                  </button>
                  {availableClustersForFilter.map(cluster => (
                    <button
                      key={cluster.name}
                      onClick={() => toggleClusterFilter(cluster.name)}
                      className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                        localClusterFilter.includes(cluster.name)
                          ? 'bg-purple-500/20 text-purple-400'
                          : 'hover:bg-secondary text-foreground'
                      }`}
                    >
                      {cluster.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            <span className="text-xs text-red-400">Critical</span>
          </div>
          <span className="text-lg font-bold text-foreground">{stats.critical}</span>
        </div>
        <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-3 h-3 text-orange-400" />
            <span className="text-xs text-orange-400">Warning</span>
          </div>
          <span className="text-lg font-bold text-foreground">{stats.warning}</span>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle className="w-3 h-3 text-green-400" />
            <span className="text-xs text-green-400">Ack'd</span>
          </div>
          <span className="text-lg font-bold text-foreground">{stats.acknowledged}</span>
        </div>
      </div>

      {/* Alerts List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {displayedAlerts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm">
            <CheckCircle className="w-8 h-8 mb-2 text-green-400" />
            <span>No active alerts</span>
            <span className="text-xs">All systems operational</span>
          </div>
        ) : (
          displayedAlerts.map((alert: Alert) => (
            <div
              key={alert.id}
              onClick={() => handleAlertClick(alert)}
              className="p-2 rounded-lg bg-secondary/30 border border-border/50 hover:bg-secondary/50 cursor-pointer transition-colors group"
            >
              <div className="flex items-start gap-2">
                <span className="text-lg">{getSeverityIcon(alert.severity)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground truncate">
                      {alert.ruleName}
                    </span>
                    <SeverityBadge severity={alert.severity} />
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {alert.message}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    {alert.cluster && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Server className="w-3 h-3" />
                        {alert.cluster}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatRelativeTime(alert.firedAt)}
                    </span>
                    {getMissionForAlert(alert) && (
                      <span className="text-xs text-purple-400 flex items-center gap-1">
                        <Bot className="w-3 h-3" />
                        Klaude
                      </span>
                    )}
                    {alert.acknowledgedAt && (
                      <span className="text-xs text-green-400">Acknowledged</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
                {!alert.acknowledgedAt && (
                  <button
                    onClick={e => handleAcknowledge(e, alert.id)}
                    className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
                  >
                    Acknowledge
                  </button>
                )}
                {(() => {
                  const mission = getMissionForAlert(alert)
                  if (mission) {
                    return (
                      <button
                        onClick={e => handleOpenMission(e, alert)}
                        className="px-2 py-1 text-xs rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 transition-colors flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View Diagnosis
                      </button>
                    )
                  } else {
                    return (
                      <button
                        onClick={e => handleAIDiagnose(e, alert.id)}
                        className="px-2 py-1 text-xs rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 transition-colors flex items-center gap-1"
                      >
                        <Bot className="w-3 h-3" />
                        Klaude Diagnose
                      </button>
                    )
                  }
                })()}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {filteredAlerts.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground text-center">
          {limit === 'unlimited' || displayedAlerts.length >= filteredAlerts.length
            ? `Showing all ${filteredAlerts.length} alerts`
            : `Showing ${displayedAlerts.length} of ${filteredAlerts.length} alerts`}
        </div>
      )}
    </div>
  )
}
