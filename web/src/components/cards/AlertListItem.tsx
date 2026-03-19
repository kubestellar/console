import {
  Clock,
  ChevronRight,
  Bot,
  Server,
  ExternalLink,
} from 'lucide-react'
import { getSeverityIcon } from '../../types/alerts'
import type { Alert, AlertSeverity } from '../../types/alerts'
import { Button } from '../ui/Button'
import { CardAIActions } from '../../lib/cards/CardComponents'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { Mission } from '../../hooks/useMissions'

// Severity color map — defined at module level to avoid re-creation on each render
const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  warning: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}

/** Milliseconds in one minute — used for relative time formatting */
const MS_PER_MINUTE = 60000
/** Minutes in one hour */
const MINUTES_PER_HOUR = 60
/** Hours in one day */
const HOURS_PER_DAY = 24

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

  return (
    <div
      key={alert.id}
      onClick={() => onAlertClick(alert)}
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

      {/* Quick Actions */}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
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
