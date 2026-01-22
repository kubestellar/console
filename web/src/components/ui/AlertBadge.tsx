import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, AlertTriangle, CheckCircle, Clock, ChevronRight, X, Bot, Server, Search, ExternalLink } from 'lucide-react'
import { useAlerts } from '../../hooks/useAlerts'
import { useDrillDown } from '../../hooks/useDrillDown'
import { useMissions } from '../../hooks/useMissions'
import { getSeverityIcon } from '../../types/alerts'
import type { Alert, AlertSeverity } from '../../types/alerts'

// Format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return new Date(dateString).toLocaleDateString()
}

export function AlertBadge() {
  const navigate = useNavigate()
  const { activeAlerts, stats, acknowledgeAlert, runAIDiagnosis } = useAlerts()
  const { open: openDrillDown } = useDrillDown()
  const { missions, setActiveMission, openSidebar } = useMissions()
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    // Use mousedown for immediate response
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

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
      setIsOpen(false)
    }
  }

  // Filter and sort alerts
  const filteredAlerts = useMemo(() => {
    let result = [...activeAlerts]

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(a =>
        a.ruleName.toLowerCase().includes(query) ||
        a.message.toLowerCase().includes(query) ||
        (a.cluster?.toLowerCase() || '').includes(query)
      )
    }

    // Apply severity filter
    if (severityFilter !== 'all') {
      result = result.filter(a => a.severity === severityFilter)
    }

    // Sort by severity and time
    return result.sort((a, b) => {
      const severityOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity]
      if (severityDiff !== 0) return severityDiff
      return new Date(b.firedAt).getTime() - new Date(a.firedAt).getTime()
    })
  }, [activeAlerts, searchQuery, severityFilter])

  // Show all filtered alerts (scrollable container handles overflow)
  const displayedAlerts = filteredAlerts

  const handleAlertClick = (alert: Alert) => {
    setIsOpen(false)
    if (alert.cluster) {
      openDrillDown({
        type: 'cluster',
        title: alert.cluster,
        data: { name: alert.cluster, alert },
      })
    }
  }

  const handleAcknowledge = (e: React.MouseEvent, alertId: string) => {
    e.stopPropagation()
    acknowledgeAlert(alertId)
  }

  const handleDiagnose = (e: React.MouseEvent, alertId: string) => {
    e.stopPropagation()
    runAIDiagnosis(alertId)
    setIsOpen(false) // Close dialog after starting diagnosis
  }

  // Determine badge color based on most severe alert
  const getBadgeColor = () => {
    if (stats.critical > 0) return 'bg-red-500'
    if (stats.warning > 0) return 'bg-orange-500'
    if (stats.info > 0) return 'bg-blue-500'
    return 'bg-gray-500'
  }

  if (stats.firing === 0) {
    return (
      <button
        className="relative p-2 rounded-lg hover:bg-secondary/50 text-muted-foreground transition-colors"
        title="No active alerts"
      >
        <Bell className="w-5 h-5" />
      </button>
    )
  }

  return (
    <div className="relative">
      {/* Badge Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-lg hover:bg-secondary/50 transition-colors ${
          stats.critical > 0 ? 'text-red-400' : stats.warning > 0 ? 'text-orange-400' : 'text-foreground'
        }`}
        title={`${stats.firing} active alerts`}
      >
        <Bell className="w-5 h-5" />
        <span
          className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white rounded-full ${getBadgeColor()}`}
        >
          {stats.firing > 99 ? '99+' : stats.firing}
        </span>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
          <div
            ref={dropdownRef}
            className="absolute right-0 top-full mt-2 w-96 bg-background border border-border rounded-lg shadow-xl z-50"
          >
            {/* Header */}
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-400" />
                <span className="font-medium text-foreground">Active Alerts</span>
                <span className="px-1.5 py-0.5 text-xs rounded bg-secondary text-muted-foreground">
                  {stats.firing}
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-secondary/50 text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search */}
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search alerts..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary/50 border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>

            {/* Severity Filter */}
            <div className="p-2 border-b border-border flex items-center gap-2">
              <button
                onClick={() => setSeverityFilter('all')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  severityFilter === 'all'
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({stats.firing})
              </button>
              <button
                onClick={() => setSeverityFilter('critical')}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                  severityFilter === 'critical'
                    ? 'bg-red-500/20 text-red-400'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {stats.critical}
              </button>
              <button
                onClick={() => setSeverityFilter('warning')}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                  severityFilter === 'warning'
                    ? 'bg-orange-500/20 text-orange-400'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-orange-500" />
                {stats.warning}
              </button>
              <button
                onClick={() => setSeverityFilter('info')}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                  severityFilter === 'info'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                {stats.info}
              </button>
            </div>

            {/* Alerts List */}
            <div className="max-h-64 overflow-y-auto">
              {displayedAlerts.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No alerts match your filters</p>
                </div>
              ) : displayedAlerts.map(alert => (
                <div
                  key={alert.id}
                  onClick={() => handleAlertClick(alert)}
                  className="p-3 border-b border-border/50 hover:bg-secondary/30 cursor-pointer transition-colors group"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg">{getSeverityIcon(alert.severity)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {alert.ruleName}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {alert.message}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
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
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>

                  {/* Quick Actions */}
                  <div className="flex items-center gap-2 mt-2">
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
                        // Mission exists - show link to view it
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
                        // No mission or mission was deleted - show diagnose button
                        return (
                          <button
                            onClick={e => handleDiagnose(e, alert.id)}
                            className="px-2 py-1 text-xs rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 transition-colors flex items-center gap-1"
                          >
                            <Bot className="w-3 h-3" />
                            Diagnose
                          </button>
                        )
                      }
                    })()}
                    {alert.acknowledgedAt && (
                      <span className="px-2 py-1 text-xs text-green-400 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Acknowledged
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-2 border-t border-border text-center">
              <button
                onClick={() => {
                  setIsOpen(false)
                  navigate('/alerts')
                }}
                className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
              >
                Open Alerts Dashboard
              </button>
            </div>
          </div>
      )}
    </div>
  )
}
