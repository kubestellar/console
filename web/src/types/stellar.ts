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
  actionHints?: string[]
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
  source: 'request' | 'user-default' | 'env-default' | 'fallback' | 'auto'
  isCli?: boolean
}

export interface StellarTask {
  id: string
  sessionId: string
  userId: string
  cluster: string
  title: string
  description: string
  status: 'open' | 'in_progress' | 'blocked' | 'done' | 'dismissed' | string
  priority: number
  source: 'user' | 'stellar' | 'watcher' | 'scheduler' | string
  parentId?: string
  dueAt?: string
  completedAt?: string
  contextJson?: string
  createdAt: string
  updatedAt: string
}

export interface StellarObservation {
  id: string
  summary: string
  suggest?: string
  reasoning?: string
  ts?: string
}

export interface StellarDigest {
  generatedAt: string
  windowHours: number
  overallHealth: string
  incidents: string[]
  changes: string[]
  recommendedActions: string[]
}

export interface StellarWatch {
  id: string
  cluster: string
  namespace: string
  resourceKind: string
  resourceName: string
  reason: string
  status: 'active' | 'resolved' | 'dismissed'
  lastUpdate: string
  lastChecked?: string
  createdAt: string
  updatedAt: string
}

export interface StellarActivity {
  id: string
  userId: string
  ts: string
  kind:
    | 'evaluated'
    | 'decided_solve'
    | 'decided_skip'
    | 'auto_fixed'
    | 'auto_fix_failed'
    | 'solve_started'
    | 'solve_resolved'
    | 'solve_escalated'
    | 'solve_exhausted'
    | 'approval_superseded'
    | 'approval_bumped'
    | string
  eventId?: string
  solveId?: string
  cluster?: string
  namespace?: string
  workload?: string
  title: string
  detail?: string
  severity: 'info' | 'warning' | 'critical' | string
}

export interface StellarSolve {
  id: string
  eventId: string
  userId: string
  cluster: string
  namespace: string
  workload: string
  status: 'running' | 'resolved' | 'escalated' | 'exhausted' | string
  actionsTaken: number
  limitHit?: string
  summary: string
  error?: string
  startedAt: string
  endedAt?: string
}

export interface StellarSolveProgress {
  solveId: string
  eventId: string
  // Stellar v2 autonomous phases: investigating → root_cause → solving →
  // resolved | escalated | exhausted. Older deterministic-loop phases are
  // still accepted so cached SSE messages don't break parsing.
  step:
    | 'investigating'
    | 'root_cause'
    | 'solving'
    | 'resolved'
    | 'escalated'
    | 'exhausted'
    | 'reading'
    | 'planning'
    | 'acting'
    | 'observing'
    | 'verifying'
    | string
  message: string
  actionsTaken: number
  status: string
  /** 0-100 progress percentage emitted by the backend. */
  percent?: number
}

export interface StellarDigestPayload {
  userId: string
  autoFixed: number
  escalated: number
  paused: number
  summary: string
  eventIds: string[]
}

export interface StellarAuditEntry {
  id: string
  ts: string
  userId: string
  action: string
  entityType: string
  entityId: string
  cluster: string
  detail: string
}
