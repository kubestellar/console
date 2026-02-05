// Alert condition types
export type AlertConditionType =
  | 'gpu_usage'
  | 'node_not_ready'
  | 'pod_crash'
  | 'memory_pressure'
  | 'cpu_pressure'
  | 'disk_pressure'
  | 'weather_alerts'
  | 'custom'

// Alert severity levels
export type AlertSeverity = 'critical' | 'warning' | 'info'

// Alert status
export type AlertStatus = 'firing' | 'resolved'

// Alert channel types
export type AlertChannelType = 'browser' | 'slack' | 'webhook'

// Alert condition configuration
export interface AlertCondition {
  type: AlertConditionType
  threshold?: number // e.g., 90 for 90%
  duration?: number // seconds to sustain before alerting
  clusters?: string[] // specific clusters, empty = all
  namespaces?: string[] // specific namespaces
  customQuery?: string // for custom conditions
  // Weather alert specific fields
  weatherCondition?: 'severe_storm' | 'extreme_heat' | 'heavy_rain' | 'snow' | 'high_wind'
  temperatureThreshold?: number // for extreme_heat
  windSpeedThreshold?: number // for high_wind
}

// Alert channel configuration
export interface AlertChannel {
  type: AlertChannelType
  enabled: boolean
  config: {
    slackWebhookId?: string // reference to saved webhook
    slackWebhookUrl?: string // direct webhook URL (inline config)
    slackChannel?: string
    webhookUrl?: string // for generic webhook type
  }
}

// Alert rule definition
export interface AlertRule {
  id: string
  name: string
  description: string
  enabled: boolean
  condition: AlertCondition
  severity: AlertSeverity
  channels: AlertChannel[]
  aiDiagnose: boolean // Enable AI analysis
  createdAt: string
  updatedAt: string
}

// AI Diagnosis result
export interface AlertAIDiagnosis {
  summary: string
  rootCause: string
  suggestions: string[]
  missionId?: string
  analyzedAt: string
}

// Alert instance (fired alert)
export interface Alert {
  id: string
  ruleId: string
  ruleName: string
  severity: AlertSeverity
  status: AlertStatus
  message: string
  details: Record<string, unknown>
  cluster?: string
  namespace?: string
  resource?: string
  resourceKind?: string
  firedAt: string
  resolvedAt?: string
  acknowledgedAt?: string
  acknowledgedBy?: string
  aiDiagnosis?: AlertAIDiagnosis
  isDemo?: boolean // True if alert was generated during demo mode
}

// Slack webhook configuration
export interface SlackWebhook {
  id: string
  name: string
  webhookUrl: string
  channel?: string
  createdAt: string
}

// Notification configuration (stored client-side)
export interface NotificationConfig {
  slackWebhookUrl?: string
  slackChannel?: string
  emailSMTPHost?: string
  emailSMTPPort?: number
  emailFrom?: string
  emailTo?: string
  emailUsername?: string
  emailPassword?: string
  webhookUrl?: string
}

// Alert statistics
export interface AlertStats {
  total: number
  firing: number
  resolved: number
  critical: number
  warning: number
  info: number
  acknowledged: number
}

// Preset alert rule templates
export const PRESET_ALERT_RULES: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'GPU Usage Critical',
    description: 'Alert when GPU allocation exceeds 90% across any cluster',
    enabled: true,
    condition: {
      type: 'gpu_usage',
      threshold: 90,
      duration: 300, // 5 minutes
    },
    severity: 'critical',
    channels: [{ type: 'browser', enabled: true, config: {} }],
    aiDiagnose: true,
  },
  {
    name: 'Node Not Ready',
    description: 'Alert when any node is not in Ready state',
    enabled: true,
    condition: {
      type: 'node_not_ready',
      duration: 60, // 1 minute
    },
    severity: 'warning',
    channels: [{ type: 'browser', enabled: true, config: {} }],
    aiDiagnose: true,
  },
  {
    name: 'Pod Crash Loop',
    description: 'Alert when a pod has restarted more than 5 times in 10 minutes',
    enabled: true,
    condition: {
      type: 'pod_crash',
      threshold: 5,
      duration: 600, // 10 minutes
    },
    severity: 'warning',
    channels: [{ type: 'browser', enabled: true, config: {} }],
    aiDiagnose: true,
  },
  {
    name: 'Memory Pressure',
    description: 'Alert when node memory usage exceeds 85%',
    enabled: false,
    condition: {
      type: 'memory_pressure',
      threshold: 85,
      duration: 300, // 5 minutes
    },
    severity: 'info',
    channels: [{ type: 'browser', enabled: true, config: {} }],
    aiDiagnose: false,
  },
  {
    name: 'Severe Weather Alert',
    description: 'Alert on extreme weather conditions',
    enabled: false,
    condition: {
      type: 'weather_alerts',
      weatherCondition: 'severe_storm',
      duration: 300,
    },
    severity: 'warning',
    channels: [{ type: 'browser', enabled: true, config: {} }],
    aiDiagnose: false,
  },
]

// Helper to get severity color
export function getSeverityColor(severity: AlertSeverity): string {
  switch (severity) {
    case 'critical':
      return 'red'
    case 'warning':
      return 'orange'
    case 'info':
      return 'blue'
    default:
      return 'gray'
  }
}

// Helper to get severity icon
export function getSeverityIcon(severity: AlertSeverity): string {
  switch (severity) {
    case 'critical':
      return '🔴'
    case 'warning':
      return '🟠'
    case 'info':
      return '🔵'
    default:
      return '⚪'
  }
}

// Helper to format condition for display
export function formatCondition(condition: AlertCondition): string {
  switch (condition.type) {
    case 'gpu_usage':
      return `GPU usage > ${condition.threshold}%`
    case 'node_not_ready':
      return 'Node not in Ready state'
    case 'pod_crash':
      return `Pod restarts > ${condition.threshold} in ${(condition.duration || 600) / 60} min`
    case 'memory_pressure':
      return `Memory usage > ${condition.threshold}%`
    case 'cpu_pressure':
      return `CPU usage > ${condition.threshold}%`
    case 'disk_pressure':
      return `Disk usage > ${condition.threshold}%`
    case 'weather_alerts':
      if (condition.weatherCondition === 'extreme_heat') {
        return `Temperature > ${condition.temperatureThreshold || 100}°F`
      }
      if (condition.weatherCondition === 'high_wind') {
        return `Wind speed > ${condition.windSpeedThreshold || 40} mph`
      }
      return condition.weatherCondition?.replace(/_/g, ' ') || 'Weather alert'
    case 'custom':
      return condition.customQuery || 'Custom condition'
    default:
      return 'Unknown condition'
  }
}
