/**
 * localStorage persistence helpers for the mission system.
 *
 * Extracted from useMissions.tsx (#8624) to reduce the file size and improve
 * TypeScript type-checking performance.
 */

import { getDemoMode } from './useDemoMode'
import { DEMO_MISSIONS } from '../mocks/demoMissions'
import type { Mission } from './useMissionTypes'
import { INACTIVE_MISSION_STATUSES } from './useMissionTypes'

export const MISSIONS_STORAGE_KEY = 'kc_missions'
/**
 * #6668 — Window (ms) during which a `storage` event for MISSIONS_STORAGE_KEY
 * is treated as an echo of our own write and ignored. Real browsers do not
 * fire storage events in the same tab that made the write, so this is only
 * a guard against test shims / polyfills.
 *
 * #7095 — Reduced from 50ms to 5ms. The original 50ms window was wide enough
 * that two tabs interacting simultaneously could blind each other's state
 * changes (split-brain). 5ms is still sufficient to suppress same-tab echoes
 * from test shims/polyfills but tight enough that genuine cross-tab writes
 * arriving within a few ms of a local write are still honored.
 */
export const CROSS_TAB_ECHO_IGNORE_MS = 5
export const UNREAD_MISSIONS_KEY = 'kc_unread_missions'
export const SELECTED_AGENT_KEY = 'kc_selected_agent'
export const KAGENTI_SELECTED_AGENT_KEY = 'kc_kagenti_selected_agent'

/** Pre-converted demo missions for demo mode — showcases all mission types */
export const DEMO_MISSIONS_AS_MISSIONS: Mission[] = DEMO_MISSIONS.map(m => ({
  ...m,
  type: m.type as Mission['type'],
  status: m.status as Mission['status'],
}))

// Maximum number of completed/failed missions to retain when pruning for quota.
// Active (pending/running/waiting_input) and saved (library) missions are always kept.
export const MAX_COMPLETED_MISSIONS = 50

/** Load missions from localStorage */
export function loadMissions(): Mission[] {
  try {
    const stored = localStorage.getItem(MISSIONS_STORAGE_KEY)
    if (stored) {
      let parsed: unknown
      try {
        parsed = JSON.parse(stored)
      } catch (parseErr: unknown) {
        console.error('[Missions] Corrupted localStorage JSON — clearing:', parseErr)
        localStorage.removeItem(MISSIONS_STORAGE_KEY)
        return getDemoMode() ? DEMO_MISSIONS_AS_MISSIONS : []
      }
      if (!Array.isArray(parsed)) {
        console.warn('[Missions] localStorage value is not an array — clearing')
        localStorage.removeItem(MISSIONS_STORAGE_KEY)
        return getDemoMode() ? DEMO_MISSIONS_AS_MISSIONS : []
      }
      // In demo mode, replace stale demo data with fresh demo missions
      // (catches both empty arrays and outdated demo entries without steps)
      if (getDemoMode() && Array.isArray(parsed) && (
        parsed.length === 0 ||
        parsed.some((m: { id?: string }) => m.id?.startsWith('demo-'))
      )) {
        return DEMO_MISSIONS_AS_MISSIONS
      }
      // Convert date strings back to Date objects
      // Mark running missions for auto-reconnection instead of failing them
      return parsed.map((m: Mission) => {
        const mission = {
          ...m,
          createdAt: new Date(m.createdAt),
          updatedAt: new Date(m.updatedAt),
          messages: (m.messages ?? []).map(msg => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
        }
        // Mark running/waiting_input missions for reconnection — they'll be
        // resumed when WS connects (#6912, #6913).
        if (mission.status === 'running' || mission.status === 'waiting_input') {
          return {
            ...mission,
            currentStep: 'Reconnecting...',
            context: { ...mission.context, needsReconnect: true }
          }
        }
        // Missions stuck in 'pending' state after a page reload cannot be resumed —
        // the backend never received the chat request (we only transition to
        // 'running' after ensureConnection resolves and wsSend is called), so
        // replaying it now would risk a duplicate execution on agents that are
        // not idempotent. Fail the mission with a clear message prompting the
        // user to retry manually (#5931).
        if (mission.status === 'pending') {
          return {
            ...mission,
            status: 'failed',
            currentStep: undefined,
            updatedAt: new Date(),
            messages: [
              ...(mission.messages || []),
              {
                id: `msg-pending-reload-${mission.id}-${Date.now()}`,
                role: 'system' as const,
                content: 'Page was reloaded before this mission could start. Please retry the mission.',
                timestamp: new Date() }
            ]
          }
        }
        // Missions stuck in 'cancelling' after a page reload should be finalized
        if (mission.status === 'cancelling') {
          return {
            ...mission,
            status: 'failed',
            currentStep: undefined,
            messages: [
              ...(mission.messages || []),
              {
                id: `msg-cancel-${mission.id}-${Date.now()}`,
                role: 'system' as const,
                content: 'Mission cancelled by user (page was reloaded during cancellation).',
                timestamp: new Date() }
            ]
          }
        }
        return mission
      })
    }
  } catch (e: unknown) {
    // issue 6437 — If the persisted payload is unparseable (the previous
    // saveMissions pass may have been interrupted mid-write, or quota
    // pressure corrupted it), fully clear the key instead of leaving a
    // broken entry that will keep crashing every load. The user loses
    // their history, which is strictly better than an unusable app.
    console.error('[Missions] Failed to parse kc_missions, clearing:', e)
    try {
      localStorage.removeItem(MISSIONS_STORAGE_KEY)
    } catch {
      // If removeItem itself throws (e.g., private mode), nothing we can do.
    }
  }

  // In demo mode, seed with orbit demo missions so the feature is visible
  if (getDemoMode()) {
    return DEMO_MISSIONS_AS_MISSIONS
  }

  return []
}

/** Save missions to localStorage, pruning old completed/failed missions if quota is exceeded */
export function saveMissions(missions: Mission[]) {
  try {
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))
  } catch (e: unknown) {
    // QuotaExceededError: DOMException with name 'QuotaExceededError', or legacy
    // browsers that use numeric code 22 instead of the named exception.
    // Pattern matches useMetricsHistory for consistency across the codebase.
    const isQuotaError = e instanceof DOMException
      && (e.name === 'QuotaExceededError' || e.code === 22)
    if (isQuotaError) {
      console.warn('[Missions] localStorage quota exceeded, pruning old missions')
      // Keep active missions (pending/running/cancelling/waiting_input/blocked) unconditionally
      const active = missions.filter(m =>
        m.status === 'running' || m.status === 'pending' || m.status === 'waiting_input' || m.status === 'blocked' || m.status === 'cancelling'
      )
      // Keep saved/library missions unconditionally — they are small (no chat history)
      const saved = missions.filter(m => m.status === 'saved')
      // Only prune completed/failed/cancelled missions by age (#5935)
      const completedOrFailed = missions
        .filter(m => m.status === 'completed' || m.status === 'failed' || m.status === 'cancelled')
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, MAX_COMPLETED_MISSIONS)
      const pruned = [...active, ...saved, ...completedOrFailed]
      try {
        localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(pruned))
        return
      } catch {
        // Still too large — strip chat messages from completed missions (#5695)
        console.warn('[Missions] still full after count-pruning, stripping chat messages')
        const stripped = pruned.map(m =>
          (m.status === 'completed' || m.status === 'failed' || m.status === 'cancelled')
            ? { ...m, messages: (m.messages || []).slice(-3) } // keep only last 3 messages
            : m
        )
        try {
          localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(stripped))
          return
        } catch {
          // Absolute last resort — clear missions storage
          console.error('[Missions] localStorage still full after stripping messages, clearing missions')
          localStorage.removeItem(MISSIONS_STORAGE_KEY)
        }
      }
    } else {
      console.error('Failed to save missions to localStorage:', e)
    }
  }
}

/** Load unread mission IDs from localStorage */
export function loadUnreadMissionIds(): Set<string> {
  try {
    const stored = localStorage.getItem(UNREAD_MISSIONS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (!Array.isArray(parsed)) return new Set()
      return new Set(parsed)
    }
  } catch (e: unknown) {
    console.error('Failed to load unread missions from localStorage:', e)
  }
  return new Set()
}

/** Save unread mission IDs to localStorage */
export function saveUnreadMissionIds(ids: Set<string>) {
  try {
    localStorage.setItem(UNREAD_MISSIONS_KEY, JSON.stringify([...ids]))
  } catch (e: unknown) {
    console.error('Failed to save unread missions to localStorage:', e)
  }
}

/** Merge remotely-loaded missions with local missions, preferring newer updatedAt */
export function mergeMissions(prev: Mission[], reloaded: Mission[]): Mission[] {
  const remoteById = new Map(reloaded.map(m => [m.id, m]))
  const merged: Mission[] = []
  const seen = new Set<string>()

  for (const local of prev) {
    seen.add(local.id)
    const remote = remoteById.get(local.id)
    if (!remote) {
      if (!INACTIVE_MISSION_STATUSES.has(local.status)) {
        merged.push(local)
      }
      continue
    }
    const localTime = new Date(local.updatedAt).getTime()
    const remoteTime = new Date(remote.updatedAt).getTime()
    // #9699 — When timestamps are identical (same-millisecond burst-write from
    // Tab A), `remoteTime >= localTime` used to unconditionally pick the remote
    // copy, silently discarding local edits made in the same millisecond.
    // Tie-break by message count: the version with more messages contains
    // more user actions and should win. If counts also match, prefer remote
    // (already-persisted) as before.
    if (remoteTime === localTime) {
      merged.push((remote.messages || []).length >= (local.messages || []).length ? remote : local)
    } else {
      merged.push(remoteTime > localTime ? remote : local)
    }
  }
  for (const remote of reloaded) {
    if (!seen.has(remote.id)) {
      merged.push(remote)
    }
  }
  // #7309 — Enforce the completed-missions cap after merge so cross-tab
  // syncing cannot re-introduce a mission that was trimmed by the other tab.
  const active = merged.filter(m => !INACTIVE_MISSION_STATUSES.has(m.status))
  const inactive = merged
    .filter(m => INACTIVE_MISSION_STATUSES.has(m.status))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, MAX_COMPLETED_MISSIONS)
  return [...active, ...inactive]
}

export function getSelectedKagentiAgentFromStorage(): { name: string; namespace: string } | null {
  try {
    const value = localStorage.getItem(KAGENTI_SELECTED_AGENT_KEY)
    if (!value) return null
    const [namespace, name] = value.split('/')
    if (!namespace || !name) return null
    return { namespace, name }
  } catch {
    return null
  }
}
