import { useState, useRef, useEffect } from 'react'
import {
  Clock,
  ChevronRight,
  Bot,
  Server,
  ExternalLink,
  BellOff,
} from 'lucide-react'
import { getSeverityIcon } from '../../types/alerts'
import type { Alert, AlertSeverity } from '../../types/alerts'
import { Button } from '../ui/Button'
import { CardAIActions } from '../../lib/cards/CardComponents'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { Mission } from '../../hooks/useMissions'
import { useSnoozedAlerts, SNOOZE_DURATIONS, formatSnoozeRemaining, type SnoozeDuration } from '../../hooks/useSnoozedAlerts'
import { MS_PER_MINUTE, MINUTES_PER_HOUR, HOURS_PER_DAY } from '../../lib/constants/time'

// Severity color map — defined at module level to avoid re-creation on each render
const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  warning: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}


// Severity indicator badge
function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  return (
    <span className={`px-1.5 py-0.5 text-xs rounded border ${SEVERITY_COLORS[severity]}`}>
      {severity}
    </span>
  )
}

// Format relative time
function formatRelativeTime(dateString: string, t: TFunction<'cards'>): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / MS_PER_MINUTE)
  const diffHours = Math.floor(diffMins / MINUTES_PER_HOUR)
  const diffDays = Math.floor(diffHours / HOURS_PER_DAY)

  if (diffMins < 1) return t('activeAlerts.justNow')
  if (diffMins < MINUTES_PER_HOUR) return t('activeAlerts.minutesAgo', { count: diffMins })
  if (diffHours < HOURS_PER_DAY) return t('activeAlerts.hoursAgo', { count: diffHours })
  return t('activeAlerts.daysAgo', { count: diffDays })
}

interface AlertListItemProps {
  alert: Alert
  mission: Mission | null
  onAlertClick: (alert: Alert) => void
  onAcknowledge: (e: React.MouseEvent, alertId: string) => void
  onAIDiagnose: (e: React.MouseEvent, alertId: string) => void
  onOpenMission: (e: React.MouseEvent, alert: Alert) => void
}

/**
 * Renders a single alert row in the ActiveAlerts card.
 * Includes severity badge, metadata, and quick action buttons.
 */
export function AlertListItem({
  alert,
  mission,
  onAlertClick,
  onAcknowledge,
  onAIDiagnose,
  onOpenMission,
}: AlertListItemProps) {
  const { t } = useTranslation('cards')
  const { snoozeAlert, unsnoozeAlert, isSnoozed, getSnoozeRemaining } = useSnoozedAlerts()
  const [snoozeMenuOpen, setSnoozeMenuOpen] = useState(false)
  const snoozeRef = useRef<HTMLDivElement>(null)
  const alertSnoozed = isSnoozed(alert.id)
  const snoozeRemaining = alertSnoozed ? getSnoozeRemaining(alert.id) : 0

  // Close snooze menu on outside click
  useEffect(() => {
    if (!snoozeMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (snoozeRef.current && !snoozeRef.current.contains(e.target as Node)) {
        setSnoozeMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [snoozeMenuOpen])

  // Issue 8883: roving-tabindex keyboard navigation. Enter/Space activates the
  // drill-down; ArrowUp/Down move focus between sibling list items;
  // Home/End jump to ends. The list container in ActiveAlerts has
  // role="list" so AT exposes the listitem semantics.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const list = e.currentTarget.parentElement
    const items = list ? Array.from(list.querySelectorAll<HTMLDivElement>('[data-keynav-item="alert"]')) : []
    const idx = items.indexOf(e.currentTarget)
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onAlertClick(alert)
    } else if (e.key === 'ArrowDown' && idx >= 0 && idx < items.length - 1) {
      e.preventDefault()
      items[idx + 1]?.focus()
    } else if (e.key === 'ArrowUp' && idx > 0) {
      e.preventDefault()
      items[idx - 1]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      items[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      items[items.length - 1]?.focus()
    }
  }

  return (
    <div
      key={alert.id}
      data-keynav-item="alert"
      className="p-2 rounded-lg bg-secondary/30 border border-border/50 hover:bg-secondary/50 transition-colors group"
    >
      {/* Clickable alert info area — separated from action buttons to avoid button-inside-button nesting */}
      <div
        role="button"
        aria-label={t('activeAlerts.viewAlertDetailsAria', { rule: alert.ruleName })}
        tabIndex={0}
        onClick={() => onAlertClick(alert)}
        onKeyDown={handleKeyDown}
        className="cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-400 rounded"
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
                {formatRelativeTime(alert.firedAt, t)}
              </span>
              {mission && (
                <span className="text-xs text-purple-400 flex items-center gap-1">
                  <Bot className="w-3 h-3" />
                  AI
                </span>
              )}
              {alert.acknowledgedAt && (
                <span className="text-xs text-green-400">{t('activeAlerts.acknowledged')}</span>
              )}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* Quick Actions — outside the role="button" region to avoid nested interactive elements */}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
        {/* Snooze button */}
        <div className="relative" ref={snoozeRef}>
          {alertSnoozed ? (
            <button
              onClick={(e) => { e.stopPropagation(); unsnoozeAlert(alert.id) }}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 transition-colors"
              title="Snoozed — click to unsnooze"
              aria-label={t('activeAlerts.unsnoozeAlertAria')}
            >
              <BellOff className="w-3 h-3" />
              {formatSnoozeRemaining(snoozeRemaining ?? 0)}
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setSnoozeMenuOpen(!snoozeMenuOpen) }}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Snooze this alert"
              aria-label={t('activeAlerts.snoozeAlertAria')}
            >
              <BellOff className="w-3.5 h-3.5" />
            </button>
          )}
          {snoozeMenuOpen && (
            // Issue 9257 — use the themed `bg-card` token instead of the
            // hardcoded dark hex `#1a1a2e`, which rendered as a dark blob in
            // light mode. The token resolves to the correct surface color in
            // both themes. (#5906 established `bg-card` as the convention
            // because `bg-popover` is not defined in tailwind.config.js.)
            <div className="absolute left-0 bottom-full mb-1 z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[100px]">
              {(Object.keys(SNOOZE_DURATIONS) as SnoozeDuration[]).map(duration => (
                <button
                  key={duration}
                  onClick={(e) => { e.stopPropagation(); snoozeAlert(alert.id, duration); setSnoozeMenuOpen(false) }}
                  className="w-full px-3 py-1.5 text-xs text-left text-foreground hover:bg-muted/50 transition-colors"
                  aria-label={t('activeAlerts.snoozeForAria', { duration })}
                >
                  {duration}
                </button>
              ))}
            </div>
          )}
        </div>
        {!alert.acknowledgedAt && (
          <Button
            variant="secondary"
            size="sm"
            onClick={e => onAcknowledge(e, alert.id)}
            className="rounded"
          >
            {t('activeAlerts.acknowledge')}
          </Button>
        )}
        {(() => {
          if (mission) {
            return (
              <Button
                variant="accent"
                size="sm"
                onClick={e => onOpenMission(e, alert)}
                icon={<ExternalLink className="w-3 h-3" />}
                className="rounded"
              >
                {t('activeAlerts.viewDiagnosis')}
              </Button>
            )
          } else {
            return (
              <CardAIActions
                resource={{ kind: 'Alert', name: alert.ruleName, cluster: alert.cluster, status: alert.severity }}
                issues={[{ name: alert.ruleName, message: alert.message }]}
                showRepair={false}
                onDiagnose={e => onAIDiagnose(e, alert.id)}
              />
            )
          }
        })()}
      </div>
    </div>
  )
}
