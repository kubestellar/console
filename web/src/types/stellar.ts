export interface StellarNotification {
  id: string
  userId?: string
  type: 'event' | 'action' | 'system' | string
  severity: 'info' | 'warning' | 'critical'
  title: string
  body: string
  cluster?: string
  namespace?: string
  missionId?: string
  actionId?: string
  dedupeKey?: string
  read: boolean
  readAt?: string
  createdAt: string
}

export interface StellarMission {
  id: string
  userId: string
  name: string
  goal: string
  schedule: string
  triggerType: string
  providerPolicy: string
  memoryScope: string
  enabled: boolean
  toolBindings: string[]
  createdAt: string
  updatedAt: string
}

export interface StellarAction {
  id: string
  userId?: string
  description: string
  actionType: string
  parameters: Record<string, unknown> | string
  cluster: string
  namespace?: string
  scheduledAt?: string
  status: 'pending_approval' | 'approved' | 'running' | 'completed' | 'failed' | 'rejected' | string
  confirmToken?: string
  cronExpr?: string
  approvedBy?: string
  approvedAt?: string
  executedAt?: string
  outcome?: string
  rejectReason?: string
  createdBy: string
  createdAt: string
}

export interface StellarClusterEvent {
  id: string
  cluster_name: string
  namespace: string
  event_type: string
  reason: string
  message?: string
  involved_object_kind?: string
  involved_object_name?: string
  last_seen: string
}

export interface StellarOperationalState {
  generatedAt: string
  clustersWatching: string[]
  eventCounts: { critical: number; warning: number; info: number } & Record<string, number>
  recentEvents: StellarClusterEvent[]
  unreadAlerts?: number
  activeMissionIds: string[]
  pendingActionIds: string[]
}

export interface ProviderSession {
  provider: string
  model: string
  configId?: string
  source: 'request' | 'user-default' | 'env-default' | 'fallback'
}

export interface StellarDigest {
  generatedAt: string
  windowHours: number
  overallHealth: string
  incidents: string[]
  changes: string[]
  recommendedActions: string[]
}
