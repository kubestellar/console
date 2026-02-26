import { useState, useEffect, useRef } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Server,
  Bot,
  Slack,
  Send,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react'
import { useAlerts, useSlackNotification, useSlackWebhooks } from '../../hooks/useAlerts'
import { useMissions } from '../../hooks/useMissions'
import { getSeverityIcon, getSeverityColor } from '../../types/alerts'
import type { Alert } from '../../types/alerts'
import { useToast } from '../ui/Toast'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

// Time thresholds for relative time formatting
const MINUTES_PER_HOUR = 60 // Minutes in an hour
const HOURS_PER_DAY = 24 // Hours in a day

interface AlertDetailProps {
  alert: Alert
  onClose?: () => void
}

// Format relative time using i18n keys from the time section
function formatRelativeTime(dateString: string, t: TFunction): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return t('time.justNow') as string
  if (diffMins < MINUTES_PER_HOUR) return t('time.minutesAgo', { count: diffMins }) as string
  if (diffHours < HOURS_PER_DAY) return t('time.hoursAgo', { count: diffHours }) as string
  return t('time.daysAgo', { count: diffDays }) as string
}

export function AlertDetail({ alert, onClose }: AlertDetailProps) {
  const { t } = useTranslation()
  const { acknowledgeAlert, resolveAlert, runAIDiagnosis } = useAlerts()
  const { webhooks } = useSlackWebhooks()
  const { sendNotification } = useSlackNotification()
  const { missions, setActiveMission, openSidebar } = useMissions()
  const { showToast } = useToast()

  const [showDetails, setShowDetails] = useState(false)
  const [isSendingSlack, setIsSendingSlack] = useState(false)
  const [slackSent, setSlackSent] = useState(false)
  const [isRunningDiagnosis, setIsRunningDiagnosis] = useState(false)

  const timeoutsRef = useRef<number[]>([])

  const severityColor = getSeverityColor(alert.severity)

  // Find the associated mission if AI diagnosis was run
  const associatedMission = alert.aiDiagnosis?.missionId
    ? missions.find(m => m.id === alert.aiDiagnosis?.missionId)
    : null

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout)
      timeoutsRef.current = []
    }
  }, [])

  const handleAcknowledge = () => {
    acknowledgeAlert(alert.id, 'Current User')
  }

  const handleResolve = () => {
    resolveAlert(alert.id)
    onClose?.()
  }

  const handleRunDiagnosis = async () => {
    setIsRunningDiagnosis(true)
    runAIDiagnosis(alert.id)
    // The diagnosis runs async via missions
    const timeoutId = setTimeout(() => setIsRunningDiagnosis(false), 1000)
    timeoutsRef.current.push(timeoutId)
  }

  const handleSendSlack = async (webhookId: string) => {
    setIsSendingSlack(true)
    try {
      await sendNotification(alert, webhookId)
      setSlackSent(true)
      const timeoutId = setTimeout(() => setSlackSent(false), 3000)
      timeoutsRef.current.push(timeoutId)
    } catch (error) {
      console.error('Failed to send Slack notification:', error)
      showToast('Failed to send Slack notification', 'error')
    } finally {
      setIsSendingSlack(false)
    }
  }

  const handleViewMission = () => {
    if (alert.aiDiagnosis?.missionId) {
      setActiveMission(alert.aiDiagnosis.missionId)
      openSidebar()
    }
  }

  return (
    <div className="bg-background border border-border rounded-lg shadow-xl w-full max-w-lg">
      {/* Header */}
      <div
        className={`p-4 border-b border-border bg-${severityColor}-500/10`}
      >
        <div className="flex items-start gap-3">
          <span className="text-2xl">{getSeverityIcon(alert.severity)}</span>
          <div className="flex-1">
            <h3 className="text-lg font-medium text-foreground">
              {alert.ruleName}
            </h3>
            <div className="flex items-center gap-3 mt-1">
              <span
                className={`px-2 py-0.5 text-xs rounded border bg-${severityColor}-500/20 border-${severityColor}-500/50 text-${severityColor}-400`}
              >
                {alert.severity.toUpperCase()}
              </span>
              <span
                className={`px-2 py-0.5 text-xs rounded ${
                  alert.status === 'firing'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-green-500/20 text-green-400'
                }`}
              >
                {alert.status === 'firing' ? 'FIRING' : 'RESOLVED'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Message */}
        <div>
          <p className="text-sm text-foreground">{alert.message}</p>
        </div>

        {/* Meta Info */}
        <div className="grid grid-cols-2 gap-3">
          {alert.cluster && (
            <div className="flex items-center gap-2 text-sm">
              <Server className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span>
              <span className="text-foreground">{alert.cluster}</span>
            </div>
          )}
          {alert.resource && (
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t('alerts.resource')}</span>
              <span className="text-foreground">{alert.resource}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">{t('alerts.fired')}</span>
            <span className="text-foreground">{formatRelativeTime(alert.firedAt, t)}</span>
          </div>
          {alert.acknowledgedAt && (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-muted-foreground">{t('alerts.acknowledged')}</span>
              <span className="text-green-400">{formatRelativeTime(alert.acknowledgedAt, t)}</span>
            </div>
          )}
        </div>

        {/* Details Toggle */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {showDetails ? t('alerts.hideDetails') : t('alerts.showDetails')}
        </button>

        {showDetails && alert.details && (
          <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
            <pre className="text-xs text-muted-foreground overflow-x-auto">
              {JSON.stringify(alert.details, null, 2)}
            </pre>
          </div>
        )}

        {/* AI Diagnosis Section */}
        <div className="border-t border-border/50 pt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-foreground">{t('alerts.aiDiagnosis')}</span>
            </div>
            {!alert.aiDiagnosis?.missionId && (
              <button
                onClick={handleRunDiagnosis}
                disabled={isRunningDiagnosis}
                className="px-3 py-1 text-xs rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                {isRunningDiagnosis ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    {t('alerts.analyzing')}
                  </>
                ) : (
                  <>
                    <Bot className="w-3 h-3" />
                    {t('alerts.runDiagnosis')}
                  </>
                )}
              </button>
            )}
          </div>

          {alert.aiDiagnosis ? (
            <div className="space-y-3">
              {alert.aiDiagnosis.summary && (
                <div>
                  <span className="text-xs text-muted-foreground">{t('alerts.summary')}</span>
                  <p className="text-sm text-foreground mt-1">{alert.aiDiagnosis.summary}</p>
                </div>
              )}

              {alert.aiDiagnosis.rootCause && (
                <div>
                  <span className="text-xs text-muted-foreground">{t('alerts.rootCause')}</span>
                  <p className="text-sm text-foreground mt-1">{alert.aiDiagnosis.rootCause}</p>
                </div>
              )}

              {alert.aiDiagnosis.suggestions && alert.aiDiagnosis.suggestions.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">{t('alerts.suggestedActions')}</span>
                  <ul className="mt-1 space-y-1">
                    {alert.aiDiagnosis.suggestions.map((suggestion, idx) => (
                      <li key={idx} className="text-sm text-foreground flex items-start gap-2">
                        <span className="text-purple-400">•</span>
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {associatedMission && (
                <button
                  onClick={handleViewMission}
                  className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  {t('alerts.viewAIMission')}
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('alerts.noDiagnosisYet')}
            </p>
          )}
        </div>

        {/* Slack Notification */}
        {webhooks.length > 0 && (
          <div className="border-t border-border/50 pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Slack className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{t('alerts.sendToSlack')}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {webhooks.map(webhook => (
                <button
                  key={webhook.id}
                  onClick={() => handleSendSlack(webhook.id)}
                  disabled={isSendingSlack}
                  className="px-3 py-1.5 text-xs rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  <Send className="w-3 h-3" />
                  {webhook.name}
                </button>
              ))}
            </div>
            {slackSent && (
              <p className="text-xs text-green-400 mt-2">
                {t('alerts.slackSent')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!alert.acknowledgedAt && alert.status === 'firing' && (
            <button
              onClick={handleAcknowledge}
              className="px-3 py-1.5 text-sm rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
            >
              {t('alerts.acknowledge')}
            </button>
          )}
          {alert.status === 'firing' && (
            <button
              onClick={handleResolve}
              className="px-3 py-1.5 text-sm rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 transition-colors"
            >
              {t('alerts.resolve')}
            </button>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
          >
            {t('actions.close')}
          </button>
        )}
      </div>
    </div>
  )
}
