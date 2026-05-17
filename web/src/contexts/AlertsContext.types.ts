import type { Alert, AlertChannel, AlertRule, AlertStats } from '../types/alerts'

/** Represents a new alert to create */
export interface CreateMutation {
  type: 'create'
  rule: AlertRule
  alert: Alert
}

/** Represents an in-place update of an existing alert's mutable fields */
export interface UpdateMutation {
  type: 'update'
  dedupKey: string
  conditionType: string
  message: string
  details: Record<string, unknown>
  resource?: string
  namespace?: string
  resourceKind?: string
}

/** Represents a resolution of a firing alert */
export interface ResolveMutation {
  type: 'resolve'
  ruleId: string
  cluster?: string
  /** When set, narrow the match to a specific resource (e.g., pod name) */
  resource?: string
  /** When set, match any alert for this rule regardless of cluster */
  matchAny?: boolean
}

export type AlertMutation = CreateMutation | UpdateMutation | ResolveMutation

export interface AlertNotificationBatch {
  alert: Alert
  channels: AlertChannel[]
}

/** Accumulator for batched mutations during an evaluation cycle */
export interface MutationAccumulator {
  mutations: AlertMutation[]
  /** Notifications to send after flushing state (alert + channels pairs) */
  notifications: AlertNotificationBatch[]
}

export interface AlertsContextValue {
  alerts: Alert[]
  /** Deduplicated alerts (firing, resolved, etc.) — matches stats counts */
  deduplicatedAlerts: Alert[]
  activeAlerts: Alert[]
  acknowledgedAlerts: Alert[]
  stats: AlertStats
  rules: AlertRule[]
  isEvaluating: boolean
  isLoadingData: boolean
  dataError: string | null
  acknowledgeAlert: (alertId: string, acknowledgedBy?: string) => void
  acknowledgeAlerts: (alertIds: string[], acknowledgedBy?: string) => void
  resolveAlert: (alertId: string) => void
  deleteAlert: (alertId: string) => void
  runAIDiagnosis: (alertId: string) => Promise<string | null> | string | null
  evaluateConditions: () => void
  createRule: (rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>) => AlertRule
  updateRule: (id: string, updates: Partial<AlertRule>) => void
  deleteRule: (id: string) => void
  toggleRule: (id: string) => void
}
