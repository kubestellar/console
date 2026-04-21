/**
 * Shared types, interfaces, and constants for the mission system.
 *
 * Extracted from useMissions.tsx (#8624) to reduce the file size and improve
 * TypeScript type-checking performance. All symbols are re-exported from
 * useMissions.tsx so existing imports remain valid.
 */

export type MissionStatus =
  | 'pending'
  | 'running'
  | 'waiting_input'
  | 'completed'
  | 'failed'
  | 'saved'
  | 'blocked'
  | 'cancelling'
  | 'cancelled'

/**
 * Mission statuses that are NOT considered "active" in the sidebar list,
 * the active counter, or the toggle button badge (#5946, #5947).
 *
 * - `saved`  : library entries the user hasn't run yet
 * - `completed` / `failed` / `cancelled` : terminal states — the mission is done
 *
 * Everything else (`pending`, `running`, `waiting_input`, `blocked`, `cancelling`)
 * is treated as active because the user may still need to take action on it.
 */
export const INACTIVE_MISSION_STATUSES: ReadonlySet<MissionStatus> = new Set([
  'saved',
  'completed',
  'failed',
  'cancelled',
])

/** True if the mission is currently active (i.e. not saved/terminal). */
export function isActiveMission(mission: Pick<Mission, 'status'>): boolean {
  return !INACTIVE_MISSION_STATUSES.has(mission.status)
}

export interface MissionMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  /** Agent that generated this message (for assistant messages) */
  agent?: string
}

export type MissionFeedback = 'positive' | 'negative' | null

export interface MatchedResolution {
  id: string
  title: string
  similarity: number
  source: 'personal' | 'shared'
}

export interface Mission {
  id: string
  title: string
  description: string
  type: 'upgrade' | 'troubleshoot' | 'analyze' | 'deploy' | 'repair' | 'custom' | 'maintain'
  status: MissionStatus
  progress?: number
  cluster?: string
  messages: MissionMessage[]
  createdAt: Date
  updatedAt: Date
  context?: Record<string, unknown>
  feedback?: MissionFeedback
  /** Current step/action the agent is performing */
  currentStep?: string
  /** Token usage statistics */
  tokenUsage?: {
    input: number
    output: number
    total: number
  }
  /** AI agent used for this mission */
  agent?: string
  /** Resolutions that were auto-matched for this mission */
  matchedResolutions?: MatchedResolution[]
  /** Structured preflight error when mission is blocked */
  preflightError?: import('../lib/missions/preflightCheck').PreflightError
  /** Original imported mission data (for saved/library missions) */
  importedFrom?: {
    title: string
    description: string
    missionClass?: string
    cncfProject?: string
    steps?: Array<{ title: string; description: string }>
    tags?: string[]
  }
}

export interface StartMissionParams {
  title: string
  description: string
  type: Mission['type']
  cluster?: string
  initialPrompt: string
  context?: Record<string, unknown>
  /** When true, injects --dry-run=server instructions into the prompt */
  dryRun?: boolean
  /**
   * When true, skip the review-prompt dialog and start immediately.
   * Defaults to false — all missions show the review dialog unless
   * explicitly opted out (e.g., the sidebar text input where the user
   * already composed the prompt). (#6455)
   */
  skipReview?: boolean
}

/**
 * #7086/#7087/#7094/#7100/#7101 — A queued pending-review entry. Each entry
 * carries a pre-generated `missionId` so callers receive a valid ID
 * synchronously, even before the user confirms the review dialog. The queue
 * replaces the old single-slot `pendingReview` to support concurrent
 * mission requests without overwriting each other.
 */
export interface PendingReviewEntry {
  params: StartMissionParams
  /** Pre-generated mission ID returned to the caller immediately */
  missionId: string
}

export interface SaveMissionParams {
  title: string
  description: string
  type: Mission['type']
  missionClass?: string
  cncfProject?: string
  steps?: Array<{ title: string; description: string }>
  tags?: string[]
  initialPrompt: string
  /** Optional context (e.g. orbitConfig) stored on the mission */
  context?: Record<string, unknown>
}

/** Fields that can be updated on a saved (not-yet-run) mission */
export interface SavedMissionUpdates {
  description?: string
  steps?: Array<{ title: string; description: string }>
  cluster?: string
}
