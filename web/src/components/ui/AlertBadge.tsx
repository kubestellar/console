import { useState, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Bell, AlertTriangle, CheckCircle, Clock, ChevronRight, X, Server, Search, ExternalLink, CheckSquare, Square, MinusSquare } from 'lucide-react'
import { useAlerts } from '../../hooks/useAlerts'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useMissions } from '../../hooks/useMissions'
import { useMobile } from '../../hooks/useMobile'
import { getSeverityIcon } from '../../types/alerts'
import type { Alert, AlertSeverity } from '../../types/alerts'
import { CardAIActions } from '../../lib/cards/CardComponents'
import { ROUTES } from '../../config/routes'
import { TRANSITION_DELAY_MS } from '../../lib/constants/network'
import { useModalState } from '../../lib/modals'
import { Button } from './Button'

/** Maximum numeric value to display in the badge before switching to overflow text (e.g. "99+") */
const BADGE_MAX_COUNT = 99
/** Number of minutes in an hour, used for relative-time formatting */
const MINS_PER_HOUR = 60
/** Number of hours in a day, used for relative-time formatting */
const HOURS_PER_DAY = 24
/** Duration of the exit animation before swapping the counter value in milliseconds */
const ANIMATION_EXIT_DELAY_MS = 150

// Animated counter component for the badge - exported for future use
interface AnimationState {
  isAnimating: boolean
  direction: 'up' | 'down'
}

export function AnimatedCounter({ value, className }: { value: number; className?: string }) {
  const [displayValue, setDisplayValue] = useState(value)
  const [animState, setAnimState] = useState<AnimationState>({ isAnimating: false, direction: 'up' })
  const prevValueRef = useRef(value)
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (value !== prevValueRef.current) {
      // Batch direction + isAnimating into a single state update
      setAnimState({ isAnimating: true, direction: value > prevValueRef.current ? 'up' : 'down' })
      // Wait for exit animation, then update value
      const exitTimer = setTimeout(() => {
        setDisplayValue(value)
        prevValueRef.current = value
        // Reset animation after enter completes
        enterTimerRef.current = setTimeout(() => {
          setAnimState(prev => ({ ...prev, isAnimating: false }))
          enterTimerRef.current = null
        }, TRANSITION_DELAY_MS)
      }, ANIMATION_EXIT_DELAY_MS)
      return () => {
        clearTimeout(exitTimer)
        if (enterTimerRef.current !== null) {
          clearTimeout(enterTimerRef.current)
          enterTimerRef.current = null
        }
      }
    }
  }, [value])

  const displayText = displayValue > BADGE_MAX_COUNT ? `${BADGE_MAX_COUNT}+` : displayValue.toString()

  return (
    <span
      className={`inline-block transition-all duration-200 ${className} ${
        animState.isAnimating
          ? animState.direction === 'up'
            ? 'animate-roll-up'
            : 'animate-roll-down'
          : ''
      }`}
    >
      {displayText}
    </span>
  )
}

// Format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)

  if (diffMins < 1) return 'Just now'
  if (diffMins < MINS_PER_HOUR) return `${diffMins}m ago`
  if (diffHours < HOURS_PER_DAY) return `${diffHours}h ago`
  return new Date(dateString).toLocaleDateString()
}

export function AlertBadge() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { activeAlerts, stats, acknowledgeAlert, acknowledgeAlerts, runAIDiagnosis } = useAlerts()
  const { drillToCluster } = useDrillDownActions()
  const { missions, setActiveMission, openSidebar } = useMissions()
  const { isMobile } = useMobile()
  const { isOpen, close, toggle } = useModalState()
  const [searchQuery, setSearchQuery] = useState('')
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all')
  const [selectedAlertIds, setSelectedAlertIds] = useState<Set<string>>(new Set())
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        close()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
      }
    }

    // Use mousedown for immediate response
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, close])

  // Check if a mission exists for an alert
  const getMissionForAlert = (alert: Alert) => {
    if (!alert.aiDiagnosis?.missionId) return null
    return missions.find(m => m.id === alert.aiDiagnosis?.missionId) || null
  }

  // Open mission sidebar for an alert
  const handleOpenMission = (e: React.MouseEvent, alert: Alert) => {
    e.stopPropagation()
    const mission = getMissionForAlert(alert)
    if (mission) {
      setActiveMission(mission.id)
      openSidebar()
      close()
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
    close()
    if (alert.cluster) {
      drillToCluster(alert.cluster, { alert })
    }
  }

  const handleAcknowledge = (e: React.MouseEvent, alertId: string) => {
    e.stopPropagation()
    acknowledgeAlert(alertId)
    // Remove from selection after acknowledging
    setSelectedAlertIds(prev => {
      const next = new Set(prev)
      next.delete(alertId)
      return next
    })
  }

  const handleDiagnose = (e: React.MouseEvent, alertId: string) => {
    e.stopPropagation()
    runAIDiagnosis(alertId)
    close() // Close dialog after starting diagnosis
  }

  // Toggle selection for a single alert
  const toggleAlertSelection = (e: React.MouseEvent, alertId: string) => {
    e.stopPropagation()
    setSelectedAlertIds(prev => {
      const next = new Set(prev)
      if (next.has(alertId)) {
        next.delete(alertId)
      } else {
        next.add(alertId)
      }
      return next
    })
  }

  // Get IDs of unacknowledged alerts in the current view
  const unacknowledgedDisplayedIds = displayedAlerts.filter(a => !a.acknowledgedAt).map(a => a.id)

  // Select all unacknowledged alerts in current view
  const handleSelectAll = () => {
    setSelectedAlertIds(new Set(unacknowledgedDisplayedIds))
  }

  // Deselect all
  const handleDeselectAll = () => {
    setSelectedAlertIds(new Set())
  }

  // Acknowledge all selected alerts
  const handleAcknowledgeSelected = () => {
    if (selectedAlertIds.size > 0) {
      acknowledgeAlerts(Array.from(selectedAlertIds))
      setSelectedAlertIds(new Set())
    }
  }

  // Check selection state for Select All button
  const allSelected = unacknowledgedDisplayedIds.length > 0 &&
    unacknowledgedDisplayedIds.every(id => selectedAlertIds.has(id))
  const someSelected = unacknowledgedDisplayedIds.some(id => selectedAlertIds.has(id))

  // Determine badge color based on most severe alert
  const getBadgeColor = () => {
    if (stats.critical > 0) return 'bg-red-500'
    if (stats.warning > 0) return 'bg-orange-500'
    if (stats.info > 0) return 'bg-blue-500'
    return 'bg-gray-500 dark:bg-gray-400'
  }

  return (
    <div className="relative" data-tour="alerts">
      {/* Badge Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={toggle}
        className={`relative p-2 w-9 h-9 ${
          stats.critical > 0 ? 'text-red-400' : stats.warning > 0 ? 'text-orange-400' : ''
        }`}
        title={stats.firing > 0 ? `${stats.firing} active alerts` : 'No active alerts'}
        aria-label={stats.firing > 0 ? `${stats.firing} active alerts` : 'No active alerts'}
      >
        <Bell className="w-5 h-5" />
        {stats.firing > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-2xs font-bold text-white rounded-full overflow-hidden ${getBadgeColor()}`}
          >
            <AnimatedCounter value={stats.firing} />
          </span>
        )}
      </Button>

      {/* Dropdown Panel - bottom sheet on mobile */}
      {isOpen && (
        <>
          {/* Mobile backdrop */}
          {isMobile && (
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-overlay"
              aria-hidden="true"
              onClick={close}
            />
          )}
          <div
            ref={dropdownRef}
            role="dialog"
            aria-label="Active Alerts"
            aria-modal={isMobile}
            className={`${
              isMobile
                ? 'fixed inset-x-0 bottom-0 rounded-t-2xl max-h-[70vh]'
                : 'absolute right-0 top-full mt-2 w-96 rounded-lg'
            } bg-background border border-border shadow-xl z-toast`}
          >
            {/* Drag handle for mobile */}
            {isMobile && (
              <div className="flex justify-center py-2">
                <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
              </div>
            )}
            {/* Header */}
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                {stats.firing > 0 ? (
                  <AlertTriangle className="w-4 h-4 text-orange-400" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                )}
                <span className="font-medium text-foreground">Active Alerts</span>
                {stats.firing > 0 && (
                  <span className="px-1.5 py-0.5 text-xs rounded bg-secondary text-muted-foreground">
                    {stats.firing}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={close}
                className="p-1"
                aria-label="Close alert panel"
                icon={<X className="w-4 h-4" />}
              />
            </div>

            {/* Search - only show when there are alerts */}
            {stats.firing > 0 && (
              <div className="p-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('common.searchAlerts')}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary/50 border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>
            )}

            {/* Severity Filter - only show when there are alerts */}
            {stats.firing > 0 && (
              <div className="p-2 border-b border-border flex items-center gap-2">
                <Button
                  variant={severityFilter === 'all' ? 'accent' : 'ghost'}
                  size="sm"
                  onClick={() => setSeverityFilter('all')}
                >
                  All ({stats.firing})
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSeverityFilter('critical')}
                  aria-label={`Filter by critical alerts (${stats.critical})`}
                  className={severityFilter === 'critical'
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : ''}
                  icon={<span className="w-2 h-2 rounded-full bg-red-500" />}
                >
                  {stats.critical}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSeverityFilter('warning')}
                  aria-label={`Filter by warning alerts (${stats.warning})`}
                  className={severityFilter === 'warning'
                    ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
                    : ''}
                  icon={<span className="w-2 h-2 rounded-full bg-orange-500" />}
                >
                  {stats.warning}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSeverityFilter('info')}
                  aria-label={`Filter by info alerts (${stats.info})`}
                  className={severityFilter === 'info'
                    ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                    : ''}
                  icon={<span className="w-2 h-2 rounded-full bg-blue-500" />}
                >
                  {stats.info}
                </Button>
              </div>
            )}

            {/* Selection Controls - only show when there are unacknowledged alerts */}
            {unacknowledgedDisplayedIds.length > 0 && (
              <div className="p-2 border-b border-border flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={allSelected ? handleDeselectAll : handleSelectAll}
                  title={allSelected ? 'Deselect all' : 'Select all'}
                  icon={allSelected ? (
                    <CheckSquare className="w-4 h-4 text-purple-400" />
                  ) : someSelected ? (
                    <MinusSquare className="w-4 h-4 text-purple-400" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                >
                  {allSelected ? 'Deselect All' : 'Select All'}
                </Button>

                {selectedAlertIds.size > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAcknowledgeSelected}
                    className="bg-green-500/20 hover:bg-green-500/30 text-green-400"
                    icon={<CheckCircle className="w-3 h-3" />}
                  >
                    Ack {selectedAlertIds.size}
                  </Button>
                )}
              </div>
            )}

            {/* Alerts List */}
            <div className="max-h-64 overflow-y-auto scroll-enhanced">
              {displayedAlerts.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  {stats.firing === 0 ? (
                    <>
                      <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                      <div className="text-sm text-foreground">No Active Alerts</div>
                      <div className="text-xs">All systems are operating normally</div>
                    </>
                  ) : (
                    <>
                      <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <div className="text-sm">No alerts match your filters</div>
                    </>
                  )}
                </div>
              ) : displayedAlerts.map(alert => (
                <div
                  key={alert.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`View ${alert.severity} alert: ${alert.ruleName}`}
                  onClick={() => handleAlertClick(alert)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault()
                      handleAlertClick(alert)
                    }
                  }}
                  className="p-3 border-b border-border/50 hover:bg-secondary/30 cursor-pointer transition-colors group"
                >
                  <div className="flex items-start gap-2">
                    {/* Selection checkbox for unacknowledged alerts */}
                    {!alert.acknowledgedAt && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => toggleAlertSelection(e, alert.id)}
                        className="mt-0.5 p-0"
                        title={selectedAlertIds.has(alert.id) ? 'Deselect' : 'Select'}
                        aria-label={selectedAlertIds.has(alert.id) ? `Deselect alert: ${alert.ruleName}` : `Select alert: ${alert.ruleName}`}
                        icon={selectedAlertIds.has(alert.id) ? (
                          <CheckSquare className="w-4 h-4 text-purple-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      />
                    )}
                    <span className="text-lg" title={`${alert.severity.charAt(0).toUpperCase() + alert.severity.slice(1)} severity`} aria-label={`${alert.severity} severity`}>{getSeverityIcon(alert.severity)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {alert.ruleName}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {alert.message}
                      </div>
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
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={e => handleAcknowledge(e, alert.id)}
                        className="rounded-md"
                      >
                        Acknowledge
                      </Button>
                    )}
                    {(() => {
                      const mission = getMissionForAlert(alert)
                      if (mission) {
                        // Mission exists - show link to view it
                        return (
                          <Button
                            variant="accent"
                            size="sm"
                            onClick={e => handleOpenMission(e, alert)}
                            className="rounded-md"
                            icon={<ExternalLink className="w-3 h-3" />}
                          >
                            View Diagnosis
                          </Button>
                        )
                      } else {
                        // No mission or mission was deleted - show diagnose button
                        return (
                          <CardAIActions
                            resource={{ kind: 'Alert', name: alert.ruleName, cluster: alert.cluster, status: alert.severity }}
                            issues={[{ name: alert.ruleName, message: alert.message }]}
                            showRepair={false}
                            onDiagnose={e => handleDiagnose(e, alert.id)}
                          />
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  close()
                  navigate(ROUTES.ALERTS)
                }}
                className="text-purple-400 hover:text-purple-300"
              >
                Open Alerts Dashboard
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
