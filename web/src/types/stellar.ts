export interface StellarNotification {
  id: string
  userId: string
  type: string
  severity: 'info' | 'warning' | 'critical' | string
  title: string
  body: string
  cluster?: string
  namespace?: string
  missionId?: string
  actionId?: string
  dedupeKey?: string
  read: boolean
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
  userId: string
  description: string
  actionType: string
  parameters: string
  cluster: string
  namespace?: string
  scheduledAt?: string
  cronExpr?: string
  status: string
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
  eventCounts: Record<string, number>
  recentEvents: StellarClusterEvent[]
  unreadAlerts: number
  activeMissionIds: string[]
  pendingActionIds: string[]
}

export interface StellarDigest {
  generatedAt: string
  windowHours: number
  overallHealth: string
  incidents: string[]
  changes: string[]
  recommendedActions: string[]
}
