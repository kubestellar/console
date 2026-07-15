import type { AlertConditionType, AlertSeverity } from '../../types/alerts'

/** Trigger condition for when a runbook should auto-activate */
export interface RunbookTrigger {
  conditionType: AlertConditionType
  severity?: AlertSeverity
}

/** A single evidence-gathering step in a runbook */
export interface EvidenceStep {
  id: string
  label: string
  /** Source of evidence — determines which API to call */
  source: 'mcp' | 'gadget' | 'events'
  /** Tool name to invoke (e.g., 'get_events', 'trace_dns') */
  tool: string
  /** Arguments with template variables: {{cluster}}, {{namespace}}, {{resource}} */
  args: Record<string, string>
  /** If true, skip this step without failing if the tool is unavailable */
  optional?: boolean
}

/** A structured investigation runbook */
export interface Runbook {
  id: string
  title: string
  description: string
  /** When to auto-trigger this runbook */
  triggers: RunbookTrigger[]
  /** Ordered evidence-gathering steps */
  evidenceSteps: EvidenceStep[]
  /** AI analysis prompt template — {{evidence}} is replaced with gathered data */
  analysisPrompt: string
}

/** Result of a single evidence step execution */
export interface EvidenceStepResult {
  stepId: string
  label: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped'
  data?: unknown
  error?: string
  durationMs?: number
}

/** Result of a full runbook execution */
export interface RunbookResult {
  runbookId: string
  runbookTitle: string
  stepResults: EvidenceStepResult[]
  enrichedPrompt: string
  startedAt: string
  completedAt: string
}

/** Context passed to runbook execution */
export interface RunbookContext {
  cluster?: string
  namespace?: string
  resource?: string
  resourceKind?: string
  alertMessage?: string
  alertDetails?: Record<string, unknown>
}
