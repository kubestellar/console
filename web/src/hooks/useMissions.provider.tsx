import { useState, useRef, useEffect, useMemo, ReactNode } from 'react'
import type { AgentInfo, AgentsListPayload, AgentSelectedPayload, ChatStreamPayload } from '../types/agent'
import { AgentCapabilityToolExec } from '../types/agent'
import type { Mission, MissionMessage, MissionStatus, MissionFeedback, StartMissionParams, PendingReviewEntry, SaveMissionParams, SavedMissionUpdates } from './useMissionTypes'
import { MissionContext, generateRequestId } from './useMissions.context'
import { getDemoMode } from './useDemoMode'
import { addCategoryTokens, setActiveTokenCategory, clearActiveTokenCategory } from './useTokenUsage'
import { LOCAL_AGENT_WS_URL, LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { useLocalAgent } from './useLocalAgent'
import { agentFetch } from './mcp/shared'
import { appendWsAuthToken } from '../lib/utils/wsAuth'
import { emitError, emitMissionStarted, emitMissionCompleted, emitMissionError, emitMissionRated } from '../lib/analytics'
import { scanForMaliciousContent } from '../lib/missions/scanner/malicious'
import { MS_PER_MINUTE, SECONDS_PER_DAY } from '../lib/constants/time'
import { runPreflightCheck, type PreflightResult } from '../lib/missions/preflightCheck'
import { kubectlProxy } from '../lib/kubectlProxy'
import { kagentiProviderChat, fetchKagentiProviderAgents } from '../lib/kagentiProviderBackend'
import { ConfirmMissionPromptDialog } from '../components/missions/ConfirmMissionPromptDialog'
import {
  MISSIONS_STORAGE_KEY, CROSS_TAB_ECHO_IGNORE_MS,
  SELECTED_AGENT_KEY,
  loadMissions, saveMissions, loadUnreadMissionIds, saveUnreadMissionIds,
  mergeMissions, getSelectedKagentiAgentFromStorage,
} from './useMissionStorage'
import {
  generateMessageId, buildEnhancedPrompt, buildSystemMessages,
  stripInteractiveArtifacts, buildSavedMissionPrompt,
} from './useMissionPromptBuilder'

const MISSION_RECONNECT_DELAY_MS = 500
/**
 * Maximum age (ms) a disconnected mission may have before auto-resume is
 * considered unsafe (#6371). Agents purge sessions after a short idle
 * window, so resuming a mission whose last update was hours ago is very
 * likely to hit a GONE/not_found session on the backend — or worse, land
 * the user's prompt in a disjointed new thread. Past this threshold the
 * mission is transitioned to `failed` with an actionable message so the
 * user can explicitly retry instead of the agent silently replaying a
 * half-finished prompt. 30 minutes is conservative: it covers lunch/
 * meeting gaps while still protecting against overnight reconnects.
 */
const MISSION_RECONNECT_MAX_AGE_MS = 30 * MS_PER_MINUTE
/**
 * issue 6429 — Cap how many prior messages we re-append to the prompt on
 * reconnect. Long-running missions can accumulate hundreds of turns; some
 * agents (notably ones with 8k–32k token budgets) reject the payload
 * outright with HTTP 413. We always keep the most recent
 * MAX_RESENT_MESSAGES items (which always include the last user message
 * that is re-sent separately) and drop anything older.
 */
const MAX_RESENT_MESSAGES = 20
/** Initial delay (ms) before auto-reconnecting WebSocket after close */
const WS_RECONNECT_INITIAL_DELAY_MS = 1_000
/** Maximum delay (ms) between reconnection attempts (backoff cap) */
const WS_RECONNECT_MAX_DELAY_MS = 30_000
/** Maximum number of consecutive reconnection attempts before giving up */
const WS_RECONNECT_MAX_RETRIES = 10
/** Maximum time (ms) to wait for a WebSocket connection to open */
const WS_CONNECTION_TIMEOUT_MS = 5_000
/** Delay before showing "Waiting for response..." status */
const STATUS_WAITING_DELAY_MS = 500
/** Delay before showing "Processing with AI..." status */
const STATUS_PROCESSING_DELAY_MS = 3_000

/**
 * Maximum time (ms) a mission is allowed to stay in "running" state before the
 * frontend considers it timed out and transitions it to "failed".  This acts as
 * a client-side safety net in case the backend timeout fires but the error
 * message is lost (e.g., WebSocket reconnect race), or the backend itself is
 * unreachable.  Matches the backend missionExecutionTimeout (5 min) plus a
 * small grace period for network latency.
 */
const MISSION_TIMEOUT_MS = 300_000 // 5 minutes
/** How often (ms) the frontend checks for timed-out missions */
const MISSION_TIMEOUT_CHECK_INTERVAL_MS = 15_000 // 15 seconds
/**
 * If streaming has started (at least one chunk received) but no new chunk
 * arrives within this window, the agent is assumed to be stuck waiting on a
 * tool call (e.g., an APISIX gateway that never responds) and the mission is
 * failed early with an actionable message (#3079).
 */
const MISSION_INACTIVITY_TIMEOUT_MS = 90_000 // 90 seconds of stream silence
/**
 * Maximum time (ms) the frontend waits for backend acknowledgment after sending
 * a cancel request. If the backend doesn't respond within this window, the
 * frontend transitions the mission from 'cancelling' to 'failed' as a safety net.
 */
const CANCEL_ACK_TIMEOUT_MS = 10_000 // 10 seconds

/**
 * WebSocket message types the frontend accepts as a dedicated cancel
 * acknowledgement (#8106). Kept as named constants to avoid magic strings
 * and to make the protocol contract easy to audit. The backend currently
 * emits `result` messages with `{cancelled, sessionId}` shape instead, which
 * is handled as a compatibility path in the message router.
 */
const CANCEL_ACK_MESSAGE_TYPE = 'cancel_ack'
const CANCEL_CONFIRMED_MESSAGE_TYPE = 'cancel_confirmed'

/**
 * Maximum time (ms) a mission may sit in 'waiting_input' with no new
 * assistant/result message before the frontend treats it as stuck and
 * transitions it to 'failed' (#5936). This state is entered when a streaming
 * turn ends without a final 'result' message; if the backend never sends
 * one (lost event, disconnected agent, etc.) the mission would otherwise
 * hang indefinitely.
 */
const WAITING_INPUT_TIMEOUT_MS = 600_000 // 10 minutes

/**
 * Patterns that identify system messages generated when the local agent is
 * unreachable. Used by both the reconnect useEffect (#10525) and the retry
 * path in sendMessage to strip stale errors from chat history.
 */
const AGENT_DISCONNECT_ERROR_PATTERNS = [
  'Local Agent Not Connected',
  'agent not available',
  'agent not responding',
] as const

/** Returns true when a MissionMessage is a stale agent-disconnect error. */
function isStaleAgentErrorMessage(msg: MissionMessage): boolean {
  return (
    msg.role === 'system' &&
    AGENT_DISCONNECT_ERROR_PATTERNS.some(pattern => msg.content.includes(pattern))
  )
}

export function MissionProvider({ children }: { children: ReactNode }) {
  const [missions, setMissions] = useState<Mission[]>(() => loadMissions())
  const { isConnected: isAgentConnected } = useLocalAgent()
  // #7313 — Restore the active mission ID from localStorage so a reload
  // remembers which mission was selected. Sidebar visibility is restored
  // separately via SIDEBAR_OPEN_STORAGE_KEY (kc_mission_sidebar_open).
  const ACTIVE_MISSION_STORAGE_KEY = 'kc_active_mission_id'
  /** Persists the sidebar open/closed state so it survives page refresh. */
  const SIDEBAR_OPEN_STORAGE_KEY = 'kc_mission_sidebar_open'
  const [activeMissionId, setActiveMissionId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_MISSION_STORAGE_KEY) || null
    } catch { return null }
  })
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    // Restore the sidebar's open/closed state from localStorage.
    // If the user had it open before refresh, it reopens. If closed,
    // it stays closed. Simple and predictable — no heuristics about
    // mission status or demo mode.
    //
    // One-time migration for users who visited before #8436: if the
    // new key doesn't exist yet but the old kc_active_mission_id does,
    // default to closed and write the new key so the old heuristic
    // never runs again. This prevents the sidebar from force-opening
    // on every refresh for existing users who had a stale active ID.
    try {
      const persisted = localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY)
      if (persisted !== null) {
        // New key exists — use it directly.
        return persisted === 'true'
      }
      // New key missing (first visit after #8436). Default to closed
      // and seed the key so subsequent refreshes use the new path.
      localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, 'false')
      return false
    } catch { return false }
  })
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(false)

  // #7087/#7101 — Pending review queue: stash mission params here when the
  // user needs to review/edit the prompt. Changed from a single slot to a
  // queue so concurrent mission requests don't overwrite each other.
  const [pendingReviewQueue, setPendingReviewQueue] = useState<PendingReviewEntry[]>([])
  const [unreadMissionIds, setUnreadMissionIds] = useState<Set<string>>(() => loadUnreadMissionIds())

  // Agent state
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [defaultAgent, setDefaultAgent] = useState<string | null>(null)
  const [agentsLoading, setAgentsLoading] = useState(false)

  // #6667 — Tracks whether the provider has unmounted. All async completion
  // handlers (WebSocket onclose, scheduled reconnect timers, fetch .then
  // callbacks, etc.) must check this before calling setState, or React
  // emits "cannot update state on unmounted component" warnings and in the
  // worst case schedules a new reconnect setTimeout after the provider has
  // been torn down. Set to true in the main cleanup effect below.
  const unmountedRef = useRef(false)
  // #6668 — Timestamp of the most recent local write to MISSIONS_STORAGE_KEY.
  // Used by the storage event listener to suppress echoes of our own write
  // in environments that (incorrectly) deliver same-tab storage events.
  const lastWrittenAtRef = useRef<number>(0)
  // #7323 — Guard against storage event bounce loops. When set, the save
  // effect skips writing to localStorage (the data came from another tab).
  const suppressNextSaveRef = useRef(false)
  const wsRef = useRef<WebSocket | null>(null)
  const pendingRequests = useRef<Map<string, string>>(new Map()) // requestId -> missionId
  // Track last stream timestamp per mission to detect tool-use gaps (for creating new chat bubbles)
  const lastStreamTimestamp = useRef<Map<string, number>>(new Map()) // missionId -> timestamp
  // Track cancel acknowledgment timeouts — missionId -> timeout handle
  const cancelTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  /**
   * Mission IDs for which cancellation has been requested by the user.
   *
   * This ref is set synchronously at the very top of `cancelMission` so that
   * a terminal WebSocket message (result / stream-done) arriving in the same
   * event-loop tick can still observe the cancel intent even if React has not
   * yet committed the 'cancelling' status transition (#6370). Without this
   * ref, the race between `cancelMission`'s `setMissions` update and the
   * result handler's `setMissions` update could leave the mission stuck in
   * 'completed' instead of transitioning cancelling → cancelled.
   *
   * Entries are cleared when `finalizeCancellation` runs or when a retry
   * reuses the mission ID via `executeMission`.
   */
  const cancelIntents = useRef<Set<string>>(new Set())
  // Track waiting_input watchdog timers — missionId -> timeout handle (#5936).
  // Prevents missions from getting stuck in 'waiting_input' indefinitely if
  // the backend never delivers a final result message.
  const waitingInputTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  // Refs to always hold the latest values — avoids stale closures in callbacks.
  // #6789 — Ref writes belong in useEffect, not the component body, to avoid
  // impure render functions in React concurrent mode.
  const missionsRef = useRef<Mission[]>(missions)
  const activeMissionIdRef = useRef(activeMissionId)
  const isSidebarOpenRef = useRef(isSidebarOpen)
  const selectedAgentRef = useRef(selectedAgent)
  const defaultAgentRef = useRef(defaultAgent)
  useEffect(() => { missionsRef.current = missions }, [missions])
  useEffect(() => {
    activeMissionIdRef.current = activeMissionId
    // #7313 — Persist active mission ID so reloads restore the sidebar view
    try {
      if (activeMissionId) {
        localStorage.setItem(ACTIVE_MISSION_STORAGE_KEY, activeMissionId)
      } else {
        localStorage.removeItem(ACTIVE_MISSION_STORAGE_KEY)
      }
    } catch { /* localStorage unavailable */ }
  }, [activeMissionId])
  useEffect(() => {
    isSidebarOpenRef.current = isSidebarOpen
    // Persist so the next page load restores the same state.
    try { localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, String(isSidebarOpen)) } catch { /* ok */ }
  }, [isSidebarOpen])
  useEffect(() => { selectedAgentRef.current = selectedAgent }, [selectedAgent])
  useEffect(() => { defaultAgentRef.current = defaultAgent }, [defaultAgent])
  // Ref to always hold the latest handleAgentMessage — avoids reconnecting WebSocket when the handler changes
  const handleAgentMessageRef = useRef<(message: { id: string; type: string; payload?: unknown }) => void>(() => {})
  // Ref to track pending WebSocket reconnection timeout so it can be cleared on unmount (#3318)
  const wsReconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Tracks consecutive reconnection attempts for exponential backoff (#3870)
  const wsReconnectAttempts = useRef(0)
  /**
   * #6375 — Flips true only after the first application-layer message has
   * been received on the current WebSocket. Used to gate the exponential
   * backoff reset. A pure transport `onopen` is NOT enough: corporate WAFs
   * can let the TCP/TLS handshake through but drop the WebSocket upgrade
   * frame, causing `onopen` to fire and `onclose` to fire in the same tick.
   * Without this guard, `wsReconnectAttempts` was reset on every `onopen`
   * and the backoff never grew past the initial delay.
   */
  const connectionEstablished = useRef(false)
  /**
   * #6376 — Set of missionIds currently executing a background tool call.
   * While a mission has an in-flight tool (tool_exec / tool_use / tool_call
   * frame observed but no matching tool_result yet), the inactivity
   * watchdog is paused for that mission. Kubernetes tool calls can legally
   * take several minutes (waiting on a LoadBalancer, a long kubectl wait,
   * etc.) and failing the mission mid-tool would leave the cluster in a
   * partially-mutated state while the agent keeps running server-side.
   */
  const toolsInFlight = useRef<Map<string, number>>(new Map()) // missionId -> openToolCount
  /**
   * #6378 — Monotonic counter per mission used to build unique React keys
   * when a streaming message is split into a new bubble after STREAM_GAP_THRESHOLD_MS.
   * Two splits within the same millisecond previously collided on
   * `msg-${Date.now()}` and caused React key warnings + rendering glitches.
   */
  const streamSplitCounter = useRef<Map<string, number>>(new Map())
  /**
   * #7082 — Monotonic counter incremented on every WS open. The reconnect
   * timeout captures the current value and bails if the counter has changed
   * by the time it fires. This prevents React StrictMode double-invocation
   * of the onopen handler from dispatching duplicate chat_request payloads.
   */
  const wsOpenEpoch = useRef(0)
  const STREAM_GAP_THRESHOLD_MS = 8000 // If >8s gap between stream chunks, create new message bubble (tool-use gap)

  // Maximum number of WebSocket send retries before giving up
  const WS_SEND_MAX_RETRIES = 3
  // Delay between WebSocket send retries in milliseconds
  const WS_SEND_RETRY_DELAY_MS = 1000

  // #6629 — Track in-flight wsSend retry timers so they can be cleared on
  // unmount. Without this, a provider unmount while a retry was still
  // pending would leak the setTimeout handle and could call
  // `wsRef.current.send` on a dying socket (or worse, call the user-supplied
  // `onFailure` after the component tree had already gone away).
  const wsSendRetryTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  // #7106 — Track per-mission status-update timers (STATUS_WAITING_DELAY_MS,
  // STATUS_PROCESSING_DELAY_MS) so they can be cleared when a mission is
  // cancelled, dismissed, or the provider unmounts.
  const missionStatusTimers = useRef<Map<string, Set<ReturnType<typeof setTimeout>>>>(new Map())

  /**
   * Send a message over the WebSocket with retry logic.
   * Makes one immediate attempt, then retries up to WS_SEND_MAX_RETRIES
   * additional times with WS_SEND_RETRY_DELAY_MS between attempts.
   * Calls onFailure (if provided) when all retries are exhausted.
   */
  const wsSend = (data: string, onFailure?: () => void): void => {
    let retries = 0
    // #7327 — Extended retries for CONNECTING state so messages aren't
    // dropped during network flapping. When the socket is actively
    // connecting we use a shorter retry interval.
    const WS_SEND_CONNECTING_RETRY_DELAY_MS = 250
    const WS_SEND_CONNECTING_MAX_RETRIES = 12 // 12 * 250ms = 3s
    const trySend = () => {
      // #7305 — Guard against sending on a closed socket after unmount.
      // A retry timer can fire across the unmount boundary.
      if (unmountedRef.current) return
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(data)
        return
      }
      const isConnecting = wsRef.current?.readyState === WebSocket.CONNECTING
      const maxRetries = isConnecting ? WS_SEND_CONNECTING_MAX_RETRIES : WS_SEND_MAX_RETRIES
      const delay = isConnecting ? WS_SEND_CONNECTING_RETRY_DELAY_MS : WS_SEND_RETRY_DELAY_MS
      if (retries < maxRetries) {
        retries++
        // #6629 — ref-tracked so unmount cleanup can cancel pending retries.
        const handle = setTimeout(() => {
          wsSendRetryTimers.current.delete(handle)
          trySend()
        }, delay)
        wsSendRetryTimers.current.add(handle)
      } else {
        console.error('[Missions] WebSocket send failed after retries — socket not open')
        // #7077 — Guard against post-unmount failure callback execution.
        // wsSend retries via setTimeout; if the component unmounts before a
        // retry fires, onFailure holds a stale closure over setMissions and
        // would trigger "cannot update unmounted component" errors.
        if (!unmountedRef.current) {
          onFailure?.()
        }
      }
    }
    trySend()
  }

  // Save missions whenever they change.
  //
  // #6668 — Cross-tab overwrite guard. Previously, two tabs each running
  // their own MissionProvider would each unconditionally write their local
  // state to `kc_missions` on every change. Tab A completes a mission and
  // writes; Tab B's next render also writes its (older) state, erasing
  // Tab A's completion. We mark our own writes with `lastWrittenAt` so
  // the storage listener below can ignore echoes of our own write.
  useEffect(() => {
    // #7323 — Skip save if the state update came from a cross-tab storage event
    // to prevent bouncing writes between tabs.
    if (suppressNextSaveRef.current) {
      suppressNextSaveRef.current = false
      return
    }
    // #9617 — Debounce saves to avoid JSON.stringify on every SSE chunk.
    // During streaming, missions update on every chunk (~50ms). Without
    // debouncing, saveMissions runs synchronous JSON.stringify on the full
    // mission array for every chunk, blocking the main thread.
    const timer = setTimeout(() => {
      lastWrittenAtRef.current = Date.now()
      saveMissions(missions)
    }, 500)
    return () => clearTimeout(timer)
  }, [missions])

  // #6668 — Listen for cross-tab mission updates. When another tab writes
  // to `kc_missions`, re-load missions from storage so the completion or
  // dismissal made in that tab is visible here too. The storage event does
  // NOT fire in the same tab that made the write, so there is no echo
  // loop. `lastWrittenAtRef` is still consulted as a belt-and-suspenders
  // guard against pathological environments (test shims, polyfills) that
  // echo their own writes.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== MISSIONS_STORAGE_KEY) return
      // Ignore events fired within CROSS_TAB_ECHO_IGNORE_MS of our own
      // write — guards against environments that echo storage events.
      // Applied BEFORE the newValue null-check so our own last-resort
      // `localStorage.removeItem(kc_missions)` on quota error doesn't
      // round-trip and clear our in-memory state.
      const sinceWrite = Date.now() - (lastWrittenAtRef.current ?? 0)
      if (sinceWrite < CROSS_TAB_ECHO_IGNORE_MS) return
      if (unmountedRef.current) return
      // #6758 (Copilot on PR #6755) — When another tab calls
      // `localStorage.removeItem(kc_missions)` (for example as a
      // last-resort clear after a QuotaExceededError), `e.newValue` is
      // `null`. The old code silently dropped that event and left this
      // tab's local state out of sync with storage. Treat a remote
      // removal as a remote reset: clear local missions to match.
      //
      // #6762 (Copilot on PR #6760) — A remote reset must also clear
      // every piece of state that is logically derivative of `missions`;
      // otherwise stale entries keep pointing at missions that no longer
      // exist. Specifically:
      //   - `unreadMissionIds` — IDs here reference mission IDs; leaving
      //     them populated produces a non-zero `unreadMissionCount` badge
      //     for missions that were just cleared.
      //   - `activeMissionId` — a pointer into `missions`; must be
      //     cleared so the sidebar / detail view doesn't dangle on a
      //     deleted mission.
      //   - `cancelTimeouts` (ref) — timeout handles keyed by mission ID
      //     from in-flight cancel requests; the missions they reference
      //     are gone, so clear them to avoid leaked timers firing
      //     against non-existent state.
      //   - `pendingRequests` (ref) — requestId → missionId map for
      //     in-flight WS requests; the target missions are gone.
      //   - `lastStreamTimestamp` (ref) — per-mission streaming gap
      //     tracker, also keyed by mission ID.
      //
      // Persistent UI state (sidebar open / minimized / full-screen,
      // selected agent, default agent) is intentionally NOT reset — it
      // is not derivative of `missions` and should survive a remote
      // mission wipe.
      if (e.newValue === null) {
        try {
          // #7430 — Suppress the save effect so clearing missions doesn't
          // write `[]` back to localStorage and bounce an event to the
          // other tab, creating an infinite cross-tab wipe loop.
          suppressNextSaveRef.current = true
          setMissions([])
          // #6767 — `new Set()` defaults to `Set<any>`; keep type-safety by
          // matching the `Set<string>` declaration of `unreadMissionIds`.
          setUnreadMissionIds(new Set<string>())
          setActiveMissionId(null)
          // #6767 — Clear ALL mission-derived refs, not just the three from
          // #6762. Any ref keyed by missionId references missions that were
          // just wiped; leaving them populated leaks timers and/or makes
          // future messages target stale mission IDs.
          for (const timeout of cancelTimeouts.current.values()) {
            clearTimeout(timeout)
          }
          cancelTimeouts.current.clear()
          // #6767 — Timeout handles must be cleared individually before
          // dropping the Map, otherwise the watchdog fires against a
          // non-existent mission.
          for (const timeout of waitingInputTimeouts.current.values()) {
            clearTimeout(timeout)
          }
          waitingInputTimeouts.current.clear()
          cancelIntents.current.clear()
          pendingRequests.current.clear()
          lastStreamTimestamp.current.clear()
          toolsInFlight.current.clear()
          streamSplitCounter.current.clear()
          // #7106 — Clear all per-mission status-update timers
          for (const timers of missionStatusTimers.current.values()) {
            for (const handle of timers) {
              clearTimeout(handle)
            }
          }
          missionStatusTimers.current.clear()
        } catch (err: unknown) {
          // #6767 — Message is issue-agnostic; this branch now covers
          // #6758, #6762, and #6767 follow-ups.
          console.warn('[Missions] Cross-tab remote reset detected — failed to clear local mission state to match:', err)
        }
        return
      }
      try {
        // #7088 — Merge instead of replace. The old code did a full replace,
        // causing last-write-wins data loss when two tabs updated different
        // missions concurrently. See mergeMissions() in useMissionStorage.ts
        // for the full merge strategy.
        const reloaded = loadMissions()
        // #7323 — Suppress the save effect for this setMissions call
        // since the data came from another tab's write.
        suppressNextSaveRef.current = true
        // #7088 — Smart merge by updatedAt instead of full replace
        setMissions(prev => mergeMissions(prev, reloaded))
        // #7105 — Reconcile derived state against the reloaded mission list.
        const reloadedIds = new Set(reloaded.map(m => m.id))
        setActiveMissionId(prev => (prev && !reloadedIds.has(prev) ? null : prev))
        setUnreadMissionIds(prev => {
          const next = new Set([...prev].filter(id => reloadedIds.has(id)))
          return next.size === prev.size ? prev : next
        })
      } catch (err: unknown) {
        console.warn('[Missions] issue 6668 — failed to reload from cross-tab write:', err)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Save unread IDs whenever they change
  useEffect(() => {
    saveUnreadMissionIds(unreadMissionIds)
  }, [unreadMissionIds])

  // #10525 — Clear stale agent-unavailable errors when the agent reconnects.
  // When a mission fails because the local agent was disconnected, the error
  // message gets locked into the chat history. Once the agent reconnects, we
  // transition those failed missions back to 'saved' so the user can retry
  // cleanly without seeing the stale "Local Agent Not Connected" error.
  const prevAgentConnected = useRef(isAgentConnected)
  useEffect(() => {
    const wasConnected = prevAgentConnected.current
    prevAgentConnected.current = isAgentConnected
    if (!wasConnected && isAgentConnected) {
      setMissions(prev => {
        const hasStale = prev.some(m =>
          m.status === 'failed' &&
          (m.messages || []).some(isStaleAgentErrorMessage)
        )
        if (!hasStale) return prev
        return prev.map(m => {
          if (m.status !== 'failed') return m
          if (!(m.messages || []).some(isStaleAgentErrorMessage)) return m
          const cleanedMessages = (m.messages || []).filter(msg => !isStaleAgentErrorMessage(msg))
          return {
            ...m,
            status: 'saved' as MissionStatus,
            currentStep: undefined,
            messages: cleanedMessages,
          }
        })
      })
    }
  }, [isAgentConnected])

  // Periodically check for missions stuck in "running" state.
  // Two failure conditions are detected (#2375, #3079):
  //
  //   1. Total timeout — mission has been running for >5 min (backend safety net).
  //      Fires when updatedAt (last ANY update) is stale beyond MISSION_TIMEOUT_MS.
  //
  //   2. Stream inactivity — streaming started (first chunk received) but no new
  //      chunk has arrived in >90 s.  This catches agents stuck mid-tool-call
  //      (e.g., kubectl waiting on an APISIX gateway that never responds) without
  //      having to wait the full 5 minutes.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()

      setMissions(prev => {
        const hasIssue = prev.some(m => {
          if (m.status !== 'running') return false
          // #6376 — pause inactivity check while a background tool call is
          // in flight. Long-running Kubernetes operations (wait for LB,
          // kubectl wait, long helm install) can legitimately exceed the
          // 90s stream-silence window, and failing the mission mid-tool
          // leaves the cluster partially mutated while the agent keeps
          // working server-side.
          const openTools = toolsInFlight.current.get(m.id) ?? 0
          if (openTools > 0) {
            // Still enforce the hard 5-minute total timeout, but not the
            // stream-silence timeout.
            if ((now - new Date(m.updatedAt).getTime()) > MISSION_TIMEOUT_MS) return true
            return false
          }
          if ((now - new Date(m.updatedAt).getTime()) > MISSION_TIMEOUT_MS) return true
          const lastStreamTs = lastStreamTimestamp.current.get(m.id)
          if (lastStreamTs && (now - lastStreamTs) > MISSION_INACTIVITY_TIMEOUT_MS) return true
          return false
        })
        if (!hasIssue) return prev

        return prev.map(m => {
          if (m.status !== 'running') return m

          const elapsed = now - new Date(m.updatedAt).getTime()
          const lastStreamTs = lastStreamTimestamp.current.get(m.id)
          const openTools = toolsInFlight.current.get(m.id) ?? 0
          // #6376 — see comment above: while a tool call is in flight, only
          // the total 5-minute timeout can fire, not the stream-silence one.
          const isInactive = openTools === 0 && !!lastStreamTs && (now - lastStreamTs) > MISSION_INACTIVITY_TIMEOUT_MS
          const isTimedOut = elapsed > MISSION_TIMEOUT_MS

          if (!isTimedOut && !isInactive) return m

          // Clean up pending request and stream tracker for this mission
          for (const [reqId, mId] of pendingRequests.current.entries()) {
            if (mId === m.id) pendingRequests.current.delete(reqId)
          }
          lastStreamTimestamp.current.delete(m.id)

          emitMissionError(
            m.type,
            isInactive ? 'mission_inactivity' : 'mission_timeout',
            isInactive
              ? `stalled_after_${Math.round((now - (lastStreamTs ?? now)) / 1000)}s`
              : `elapsed_${Math.round(elapsed / 1000)}s`
          )

          const errorContent = isInactive
            ? `**Agent Not Responding**\n\nThe AI agent started responding but stopped for over ${Math.round(MISSION_INACTIVITY_TIMEOUT_MS / 60_000)} minutes. This usually means the agent is stuck waiting for a tool call to return (e.g., a Kubernetes API call or APISIX gateway request that is not responding).\n\nYou can:\n- **Retry** the mission — the issue may be transient\n- **Check cluster connectivity** — ensure the target cluster API server is reachable\n- **Cancel** and try a simpler or more specific request`
            : `**Mission Timed Out**\n\nThis mission has been running for over ${Math.round(MISSION_TIMEOUT_MS / 60_000)} minutes without completing. It has been automatically stopped.\n\nYou can:\n- **Retry** the mission with the same or a different prompt\n- **Try a simpler request** that requires less processing\n- **Check your AI provider** configuration in [Settings](/settings)`

          return {
            ...m,
            status: 'failed' as MissionStatus,
            currentStep: undefined,
            updatedAt: new Date(),
            messages: [
              ...m.messages,
              {
                id: `msg-timeout-${Date.now()}-${m.id}`,
                role: 'system' as const,
                content: errorContent,
                timestamp: new Date() }
            ]
          }
        })
      })
    }, MISSION_TIMEOUT_CHECK_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [])

  // Fetch available agents
  const fetchAgents = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        id: `list-agents-${Date.now()}`,
        type: 'list_agents' }))
    }
  }

  // Connect to local agent WebSocket
  const ensureConnection = () => {
    // In demo mode, skip WebSocket connection to avoid console errors
    if (getDemoMode()) {
      return Promise.reject(new Error('Agent unavailable in demo mode'))
    }
    // #6667 — Refuse to start a new connection if the provider has already
    // unmounted. Without this guard, a setAgentsLoading(true) call below
    // would fire on a torn-down component. Can happen when an `onclose`
    // handler schedules a reconnect timer just before unmount; the timer
    // still fires after the cleanup effect has run.
    if (unmountedRef.current) {
      return Promise.reject(new Error('MissionProvider unmounted'))
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve, reject) => {
      // Show loading state while connecting
      setAgentsLoading(true)

      // Connection timeout — nullify handlers before closing to prevent the
      // onclose handler from scheduling a cascading reconnection (#4929).
      const timeout = setTimeout(() => {
        const ws = wsRef.current
        if (ws) {
          ws.onclose = null
          ws.onerror = null
          ws.onopen = null
          ws.onmessage = null
          ws.close()
          wsRef.current = null
        }
        setAgentsLoading(false)
        reject(new Error('CONNECTION_TIMEOUT'))
      }, WS_CONNECTION_TIMEOUT_MS)

      try {
        // #6375 — arm the "not yet established" guard for this socket.
        // The backoff is reset later, after the first application-layer
        // message actually arrives, not here.
        connectionEstablished.current = false
        wsRef.current = new WebSocket(appendWsAuthToken(LOCAL_AGENT_WS_URL))

        wsRef.current.onopen = () => {
          clearTimeout(timeout)
          // NOTE: Do NOT reset wsReconnectAttempts here. Corporate WAFs can
          // let the TCP/TLS handshake through and still drop the WebSocket
          // upgrade frame, causing onopen → onclose in the same event-loop
          // tick. The backoff is reset in handleAgentMessage on the first
          // real application-layer frame (#6375).
          // #7082 — Bump the open epoch. The reconnect timeout below captures
          // this value and bails if it has changed, preventing duplicate sends
          // when React StrictMode double-invokes the onopen handler.
          const epoch = ++wsOpenEpoch.current
          // Fetch available agents on connect
          fetchAgents()

          // Auto-reconnect interrupted missions (#2379)
          // Collect missions that need reconnection via a ref so the side
          // effect (WebSocket sends) happens OUTSIDE the state updater.
          // React StrictMode may invoke state updaters twice, which would
          // cause duplicate reconnection requests if the send lived inside.
          const missionsToReconnect: Mission[] = []
          // Missions that have already had one reconnect attempt — don't
          // replay the prompt again; fail them instead (#5930).
          const missionsToFailDuplicate: string[] = []
          // Missions whose last update was so long ago that the backend
          // session is almost certainly gone. Don't auto-resume these —
          // mark them as needing a manual restart (#6371).
          const missionsToMarkStale: string[] = []

          // #7074 — Build the waiting_input set SYNCHRONOUSLY from the ref
          // before entering the state updater. If React batches or delays the
          // setMissions commit, the set built inside the updater could be
          // empty, causing watchdogs to never restart for hanging missions.
          const waitingInputMissionIds = new Set(
            (missionsRef.current || [])
              .filter(m => m.status === 'waiting_input' && m.context?.needsReconnect)
              .map(m => m.id)
          )

          setMissions(prev => {
            const candidates = prev.filter(m =>
              (m.status === 'running' || m.status === 'waiting_input') && m.context?.needsReconnect
            )

            if (candidates.length > 0) {
              // Split candidates into first-attempt (safe to replay) vs
              // already-attempted (unsafe — would duplicate execution on
              // non-idempotent agents, see #5930) vs stale (backend session
              // has very likely expired, see #6371).
              const now = Date.now()
              for (const m of candidates) {
                const ageMs = now - new Date(m.updatedAt).getTime()
                if (ageMs > MISSION_RECONNECT_MAX_AGE_MS) {
                  missionsToMarkStale.push(m.id)
                } else if (m.context?.reconnectAttempted) {
                  missionsToFailDuplicate.push(m.id)
                } else {
                  missionsToReconnect.push(m)
                }
              }

              // Clear the needsReconnect flag and mark reconnectAttempted
              // so a subsequent reconnect won't replay the prompt again.
              return prev.map(m => {
                if (!m.context?.needsReconnect) return m
                if (missionsToMarkStale.includes(m.id)) {
                  // Issue 9157: if the agent's LAST message was a substantive
                  // assistant response, the mission almost certainly completed
                  // before the session went stale — the only thing missing is
                  // the explicit `done` event. Marking such missions 'failed'
                  // contradicts the visible chat history and tells users to
                  // retry work that actually finished. Promote them to
                  // 'completed' with a softer note instead. Truly-failed
                  // (no assistant response, or last message is a system
                  // message) keeps the original 'failed' + retry CTA.
                  const lastMsg = m.messages[m.messages.length - 1]
                  const lastWasSuccessfulAssistant =
                    lastMsg !== undefined &&
                    lastMsg.role === 'assistant' &&
                    lastMsg.content.trim().length > 0
                  if (lastWasSuccessfulAssistant) {
                    return {
                      ...m,
                      status: 'completed' as MissionStatus,
                      currentStep: undefined,
                      updatedAt: new Date(),
                      context: {
                        ...m.context,
                        needsReconnect: false },
                      messages: [
                        ...m.messages,
                        {
                          id: `msg-reconnect-stale-success-${m.id}-${Date.now()}`,
                          role: 'system' as const,
                          content: `_Session expired before we could confirm completion. The agent's last response is preserved above — marking this mission complete._`,
                          timestamp: new Date() }
                      ]
                    }
                  }
                  // No (successful) assistant response on record — really did
                  // get stranded. Keep the original failed-with-retry-CTA
                  // behaviour. #6384 item 2 (dup of #6380): rely on status
                  // 'failed' + the explicit system message; a separate
                  // `needsRestart` flag was never read anywhere.
                  return {
                    ...m,
                    status: 'failed' as MissionStatus,
                    currentStep: undefined,
                    updatedAt: new Date(),
                    context: {
                      ...m.context,
                      needsReconnect: false },
                    messages: [
                      ...m.messages,
                      {
                        id: `msg-reconnect-stale-${m.id}-${Date.now()}`,
                        role: 'system' as const,
                        content: `**Mission session expired**\n\nThe connection to the agent was lost more than ${Math.round(MISSION_RECONNECT_MAX_AGE_MS / 60_000)} minutes ago. The agent has likely purged this session, so auto-resume is unsafe — it could crash the agent or land your prompt in a disjointed thread.\n\n**Click Retry Mission** to start a fresh session with the same prompt.`,
                        timestamp: new Date() }
                    ]
                  }
                }
                if (missionsToFailDuplicate.includes(m.id)) {
                  return {
                    ...m,
                    status: 'failed' as MissionStatus,
                    currentStep: undefined,
                    updatedAt: new Date(),
                    context: { ...m.context, needsReconnect: false },
                    messages: [
                      ...m.messages,
                      {
                        id: `msg-reconnect-abort-${m.id}-${Date.now()}`,
                        role: 'system' as const,
                        content: 'Connection was lost twice during this mission. To avoid duplicating an in-flight action, the mission was stopped. Please retry it manually.',
                        timestamp: new Date() }
                    ]
                  }
                }
                return {
                  ...m,
                  currentStep: 'Resuming...',
                  context: { ...m.context, needsReconnect: false, reconnectAttempted: true }
                }
              })
            }
            return prev
          })

          // Side effect: schedule reconnection OUTSIDE the state updater.
          // #6832 — Deduplicate by mission ID. React StrictMode may invoke the
          // state updater twice, pushing the same mission into the array twice.
          // Without dedup, two wsSend calls fire per reconnecting mission.
          const seenIds = new Set<string>()
          const dedupedMissions = missionsToReconnect.filter(m => {
            if (seenIds.has(m.id)) return false
            seenIds.add(m.id)
            return true
          })
          if (dedupedMissions.length > 0) {
            // #6837 — Optimistically seed toolsInFlight for every resumed
            // mission so the inactivity watchdog knows a tool *may* be
            // running. Without this, a tool_result arriving for a tool whose
            // tool_start was lost (pre-reconnect) would decrement from 0,
            // and the watchdog would be active during a legitimately
            // long-running tool call. The count resets to the real value
            // once the first tool_start or tool_result frame arrives.
            const OPTIMISTIC_TOOLS_IN_FLIGHT = 1
            for (const mission of dedupedMissions) {
              toolsInFlight.current.set(mission.id, OPTIMISTIC_TOOLS_IN_FLIGHT)
            }
            setTimeout(() => {
              // #7082 — If the WS epoch has changed since onopen fired,
              // another connection cycle has started (e.g. StrictMode
              // double-invoke or rapid reconnect). Skip this batch to
              // avoid duplicate chat_request payloads.
              if (wsOpenEpoch.current !== epoch) return
              dedupedMissions.forEach(mission => {
                // #6914 — Check if the mission was cancelled during the
                // reconnect delay. Without this guard, a user who cancels
                // during the MISSION_RECONNECT_DELAY_MS window would still
                // have their prompt resent to the backend.
                if (cancelIntents.current.has(mission.id)) {
                  finalizeCancellation(mission.id, 'Mission cancelled by user during reconnect.')
                  return
                }
                const currentState = missionsRef.current.find(m => m.id === mission.id)
                if (currentState && (currentState.status === 'cancelled' || currentState.status === 'failed' || currentState.status === 'cancelling')) {
                  return
                }

                // Find the last user message to re-send
                const userMessages = mission.messages.filter(msg => msg.role === 'user')
                const lastUserMessage = userMessages[userMessages.length - 1]

                if (lastUserMessage && wsRef.current?.readyState === WebSocket.OPEN) {
                  // Determine which agent to use - prefer claude-code for tool execution
                  const agentToUse = mission.agent || 'claude-code'

                  // Tag the reconnect with a deterministic resumeKey per
                  // mission — backends that support resume-by-key can
                  // de-duplicate on this key and avoid replaying actions
                  // that were already (partially) processed (#5930).
                  const resumeKey = `resume-${mission.id}`
                  const requestId = generateRequestId('claude-reconnect')
                  pendingRequests.current.set(requestId, mission.id)

                  // Build history from all messages except system messages.
                  // issue 6429 — Cap at MAX_RESENT_MESSAGES to avoid HTTP 413
                  // against small-context agents. Keep the most recent items;
                  // older turns are dropped with a warning.
                  //
                  // issue 6444(A) — Backends (see pkg/agent/provider_claudecode.go
                  // buildPromptWithHistory) concatenate `history` then append
                  // `prompt`. If the last user message is included in BOTH
                  // `history` and `prompt`, it's seen twice by the model.
                  // Exclude the trailing user turn from `history` so `prompt`
                  // is the single source of truth for the new message.
                  const fullHistory = mission.messages
                    .filter(msg => msg.role === 'user' || msg.role === 'assistant')
                    .map(msg => ({
                      role: msg.role,
                      content: msg.content }))
                  // Drop the trailing user message if it matches the one being
                  // re-sent as `prompt` (it is, by construction, since we took
                  // the last user message from the same list).
                  const historyWithoutLastUser = (() => {
                    for (let i = fullHistory.length - 1; i >= 0; i--) {
                      if (fullHistory[i].role === 'user') {
                        return [...fullHistory.slice(0, i), ...fullHistory.slice(i + 1)]
                      }
                    }
                    return fullHistory
                  })()
                  const history = historyWithoutLastUser.slice(-MAX_RESENT_MESSAGES)
                  if (historyWithoutLastUser.length > MAX_RESENT_MESSAGES) {
                    console.warn(
                      `[Missions] issue 6429 — truncated reconnect history from ${historyWithoutLastUser.length} to ${MAX_RESENT_MESSAGES} messages to avoid oversized payload`,
                    )
                  }

                  const mId = mission.id
                  wsSend(JSON.stringify({
                    id: requestId,
                    type: 'chat',
                    payload: {
                      prompt: lastUserMessage.content,
                      sessionId: mId,
                      agent: agentToUse,
                      history: history,
                      resumeKey: resumeKey,
                      isResume: true }
                  }), () => {
                    // #7076 — Clear stale optimistic toolsInFlight entry on
                    // failure. Without this, the paused watchdog is never
                    // un-paused if the mission ID is later reused.
                    toolsInFlight.current.delete(mId)
                    // #7077 — Guard against post-unmount setState. The retry
                    // timer in wsSend can fire after the component unmounts,
                    // reaching onFailure with a stale closure over setMissions.
                    if (unmountedRef.current) return
                    setMissions(prev => prev.map(m =>
                      m.id === mId ? { ...m, status: 'failed', currentStep: 'WebSocket reconnect failed' } : m
                    ))
                  })

                  // #6916 — Restart the waiting_input timeout watchdog for
                  // missions that were in waiting_input before disconnect.
                  // The original timer was cleared on disconnect; without
                  // restarting it the mission could hang indefinitely.
                  if (waitingInputMissionIds.has(mId)) {
                    startWaitingInputTimeout(mId)
                  }
                }
              })
            }, MISSION_RECONNECT_DELAY_MS)
          }

          resolve()
        }

        wsRef.current.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            handleAgentMessageRef.current(message)
          } catch (e: unknown) {
            console.error('[Missions] Failed to parse message:', e)
          }
        }

        wsRef.current.onclose = () => {
          clearTimeout(timeout)
          wsRef.current = null
          // #6667 — If the provider has already unmounted, short-circuit
          // everything below: do NOT set state, do NOT schedule a
          // reconnect timer. The cleanup effect will have already cleared
          // timers and nulled handlers, but `onclose` can still fire during
          // teardown if the close was initiated here and the runtime
          // delivers the event in the same tick.
          if (unmountedRef.current) return
          setAgentsLoading(false) // Stop loading spinner on disconnect
          // Don't clear agents - keep them cached for display
          // Users can still see available agents even if temporarily disconnected

          // Auto-reconnect with exponential backoff (if not in demo mode).
          // Store the timer handle so it can be cleared on unmount (#3318).
          // Gives up after WS_RECONNECT_MAX_RETRIES to avoid infinite loops (#3870).
          if (!getDemoMode() && wsReconnectAttempts.current < WS_RECONNECT_MAX_RETRIES) {
            const attempt = wsReconnectAttempts.current
            const delay = Math.min(
              WS_RECONNECT_INITIAL_DELAY_MS * Math.pow(2, attempt),
              WS_RECONNECT_MAX_DELAY_MS,
            )
            wsReconnectAttempts.current = attempt + 1
            console.warn(
              `[Missions] WebSocket closed. Reconnecting in ${delay}ms (attempt ${attempt + 1}/${WS_RECONNECT_MAX_RETRIES})`,
            )
            wsReconnectTimer.current = setTimeout(() => {
              wsReconnectTimer.current = null
              // #6667 — Belt-and-suspenders: re-check unmount status when
              // the timer fires in case the cleanup effect ran between
              // scheduling and firing. `ensureConnection` also checks
              // this, but bailing here avoids an extra rejected promise
              // in the console.
              if (unmountedRef.current) return
              ensureConnection().catch((err: unknown) => {
                console.error('[Missions] WebSocket reconnection failed:', err)
              })
            }, delay)
          } else if (!getDemoMode()) {
            console.warn(
              `[Missions] WebSocket reconnection abandoned after ${WS_RECONNECT_MAX_RETRIES} attempts. ` +
              'Will retry on next user interaction.',
            )
          }

          // #7073 — Clear cancelTimeouts on WS close. Without this, orphaned
          // timeout handles leak and fire later against a reconnected or
          // dismissed mission, causing state corruption or memory leaks.
          for (const handle of cancelTimeouts.current.values()) {
            clearTimeout(handle)
          }
          cancelTimeouts.current.clear()

          // #6836 — Cancel pending wsSend retry timers so they don't fire
          // on the dead socket. The main unmount effect also clears these,
          // but onclose fires on transient disconnects (not just unmount).
          for (const handle of wsSendRetryTimers.current) {
            clearTimeout(handle)
          }
          wsSendRetryTimers.current.clear()

          // Transient disconnect handling (#5929): instead of failing running
          // missions immediately, mark them with needsReconnect so that the
          // auto-reconnect loop (above) can resume them once the WebSocket
          // re-opens. We only fail missions permanently when the reconnect
          // retries have been exhausted (handled in the `else if` branch
          // below). The pending request IDs are cleared because a new request
          // ID will be issued on reconnect — keeping them would cause late
          // responses from the dead socket to be misattributed (#4499).
          const isGivingUp = getDemoMode() || wsReconnectAttempts.current >= WS_RECONNECT_MAX_RETRIES
          if (pendingRequests.current.size > 0) {
            const pendingMissionIds = new Set(pendingRequests.current.values())

            if (isGivingUp) {
              const errorContent = `**Agent Disconnected**

The WebSocket connection to the agent at \`${LOCAL_AGENT_WS_URL}\` was lost and reconnection attempts were exhausted. Please verify the agent is running and reachable, then retry the mission.`
              setMissions(prev => prev.map(m => {
                if (pendingMissionIds.has(m.id) && (m.status === 'running' || m.status === 'waiting_input')) {
                  return {
                    ...m,
                    status: 'failed',
                    currentStep: undefined,
                    messages: [
                      ...m.messages,
                      {
                        id: generateMessageId(m.id),
                        role: 'system',
                        content: errorContent,
                        timestamp: new Date() }
                    ]
                  }
                }
                return m
              }))
            } else {
              // Transient disconnect — keep mission in 'running'/'waiting_input'
              // but mark it as needing reconnect (#6912). The UI will show
              // "Reconnecting..." and the onopen handler will resume the mission.
              setMissions(prev => prev.map(m => {
                if (pendingMissionIds.has(m.id) && (m.status === 'running' || m.status === 'waiting_input')) {
                  return {
                    ...m,
                    currentStep: 'Reconnecting...',
                    context: { ...m.context, needsReconnect: true } }
                }
                return m
              }))
            }
            pendingRequests.current.clear()
          }
        }

        wsRef.current.onerror = () => {
          // #6440 — Architecture note for future readers who wonder why this
          // sweeper doesn't filter by `agentId`: the console uses a SINGLE
          // WebSocket connection to a SINGLE kc-agent process. There is no
          // per-agent sub-connection and no `agentId` field on Mission
          // objects. When this WS errors, by definition every in-flight
          // mission on it is affected, so scoping the sweep by pending
          // request (done below since #5851) is the correct granularity.
          // If the backend ever grows a true multi-agent fan-out, the sweep
          // must be re-scoped by agent — but until then, narrowing further
          // would be incorrect, not safer.
          clearTimeout(timeout)
          // Forcibly close the socket and clear the ref to prevent zombie
          // connections. Nullify onclose first so the close doesn't trigger
          // a cascading reconnection attempt (#4929).
          const ws = wsRef.current
          if (ws) {
            ws.onclose = null
            ws.close()
            wsRef.current = null
          }
          // Transient disconnect handling (#5929): only fail missions
          // permanently when reconnection attempts are exhausted. Otherwise
          // mark them as needing reconnect so onopen can resume them.
          // Don't sweep all running missions — only those tied to pending
          // requests, as others may belong to a different WS session (#5851).
          const isGivingUp = getDemoMode() || wsReconnectAttempts.current >= WS_RECONNECT_MAX_RETRIES
          if (pendingRequests.current.size > 0) {
            const affectedMissionIds = new Set(pendingRequests.current.values())
            if (isGivingUp) {
              const errorContent = `**Agent Disconnected**\n\nThe WebSocket connection failed and reconnection attempts were exhausted. Please verify the agent is running and try again.`
              setMissions(prev => prev.map(m => {
                if (!affectedMissionIds.has(m.id)) return m
                if (m.status !== 'running' && m.status !== 'waiting_input') return m
                return { ...m, status: 'failed' as MissionStatus, currentStep: 'Connection failed',
                  messages: [...m.messages, { id: generateMessageId('ws-error'), role: 'system' as const, content: errorContent, timestamp: new Date() }] }
              }))
            } else {
              setMissions(prev => prev.map(m => {
                if (!affectedMissionIds.has(m.id)) return m
                if (m.status !== 'running' && m.status !== 'waiting_input') return m
                return { ...m, currentStep: 'Reconnecting...', context: { ...m.context, needsReconnect: true } }
              }))
            }
            pendingRequests.current.clear()
          }
          // #6377 — belt-and-suspenders: always clear any lingering
          // pendingRequests entries on a hard error, even if the size === 0
          // branch above wasn't entered. Late responses from the dead
          // socket must not be misattributed.
          pendingRequests.current.clear()
          // #6836 — Cancel pending wsSend retry timers on error so they
          // don't fire on the dead/closed socket.
          for (const handle of wsSendRetryTimers.current) {
            clearTimeout(handle)
          }
          wsSendRetryTimers.current.clear()
          // #6376 — drop any tool-in-flight tracking for the dead socket;
          // the agent will re-report status after the reconnect.
          toolsInFlight.current.clear()
          // #6410 — also clear the remaining per-mission tracking state so
          // nothing is carried over from the dead socket. `waitingInputTimeouts`
          // holds real setTimeout handles and must be clearTimeout'd first
          // (just `.clear()` would leak the timers and they could fire after
          // reconnect, flipping missions to `failed`).
          for (const t of waitingInputTimeouts.current.values()) {
            clearTimeout(t)
          }
          waitingInputTimeouts.current.clear()
          lastStreamTimestamp.current.clear()
          streamSplitCounter.current.clear()
          // #7106 — Clear status-update timers on WS error
          for (const timers of missionStatusTimers.current.values()) {
            for (const handle of timers) {
              clearTimeout(handle)
            }
          }
          missionStatusTimers.current.clear()
          setAgentsLoading(false)
          reject(new Error('CONNECTION_FAILED'))
        }
      } catch (err: unknown) {
        clearTimeout(timeout)
        reject(err)
      }
    })
  }

  // Mark a mission as having unread content (not currently being viewed)
  const markMissionAsUnread = (missionId: string) => {
    // Only mark as unread if it's not the active mission
    // Read from refs so this callback is always current without needing to be recreated
    if (missionId !== activeMissionIdRef.current || !isSidebarOpenRef.current) {
      setUnreadMissionIds(prev => {
        const next = new Set(prev)
        next.add(missionId)
        return next
      })
    }
  }

  // #7106 — Clear tracked status-update timers for a mission.
  const clearMissionStatusTimers = (missionId: string) => {
    const timers = missionStatusTimers.current.get(missionId)
    if (timers) {
      for (const handle of timers) {
        clearTimeout(handle)
      }
      missionStatusTimers.current.delete(missionId)
    }
  }

  // Clear the waiting_input watchdog timer for a mission, if one is set (#5936).
  const clearWaitingInputTimeout = (missionId: string) => {
    const t = waitingInputTimeouts.current.get(missionId)
    if (t) {
      clearTimeout(t)
      waitingInputTimeouts.current.delete(missionId)
    }
  }

  // Start (or restart) the waiting_input watchdog for a mission (#5936).
  // If the mission is still in 'waiting_input' after WAITING_INPUT_TIMEOUT_MS,
  // it is transitioned to 'failed' with an actionable error message. This
  // prevents the UI from hanging forever when a backend 'result' message is
  // lost or the agent disconnects silently after streaming ends.
  const startWaitingInputTimeout = (missionId: string) => {
    clearWaitingInputTimeout(missionId)
    const handle = setTimeout(() => {
      waitingInputTimeouts.current.delete(missionId)
      // Purge pending request IDs for this mission — late responses must not
      // overwrite the failed state.
      for (const [reqId, mId] of pendingRequests.current.entries()) {
        if (mId === missionId) pendingRequests.current.delete(reqId)
      }
      lastStreamTimestamp.current.delete(missionId)
      setMissions(prev => prev.map(m => {
        if (m.id !== missionId || m.status !== 'waiting_input') return m
        emitMissionError(
          m.type,
          'waiting_input_timeout',
          `timeout_after_${Math.round(WAITING_INPUT_TIMEOUT_MS / 1000)}s`
        )
        return {
          ...m,
          status: 'failed' as MissionStatus,
          currentStep: undefined,
          updatedAt: new Date(),
          messages: [
            ...m.messages,
            {
              id: `msg-waiting-timeout-${Date.now()}-${m.id}`,
              role: 'system' as const,
              content: `**No response from agent — mission timed out waiting for input.**\n\nThe agent finished streaming but never delivered a final result within ${Math.round(WAITING_INPUT_TIMEOUT_MS / 60_000)} minutes. This usually means the final result message was lost or the agent disconnected silently.\n\nYou can:\n- **Retry** the mission — the issue may be transient\n- **Check your agent** — make sure it is still running and reachable\n- **Send a new message** to continue the conversation`,
              timestamp: new Date() }
          ]
        }
      }))
    }, WAITING_INPUT_TIMEOUT_MS)
    waitingInputTimeouts.current.set(missionId, handle)
  }

  // Finalize a cancelling mission — transitions from 'cancelling' to 'cancelled'
  // (a distinct terminal state from 'failed', #5935) and clears any pending
  // cancel timeout.
  const finalizeCancellation = (missionId: string, message: string) => {
    // Clear the timeout if one is pending
    const timeout = cancelTimeouts.current.get(missionId)
    if (timeout) {
      clearTimeout(timeout)
      cancelTimeouts.current.delete(missionId)
    }
    // #6370 — clear the cancel intent now that we're finalizing.
    cancelIntents.current.delete(missionId)

    // Purge ALL pending request IDs that map to this mission so that late
    // responses (from earlier failed or in-flight requests) are dropped at
    // the lookup stage in handleAgentMessage (#4499).
    for (const [reqId, mId] of pendingRequests.current.entries()) {
      if (mId === missionId) pendingRequests.current.delete(reqId)
    }
    lastStreamTimestamp.current.delete(missionId)
    streamSplitCounter.current.delete(missionId) // #6410 — terminal state cleanup
    toolsInFlight.current.delete(missionId) // #6410 — terminal state cleanup
    clearWaitingInputTimeout(missionId) // #5936
    clearMissionStatusTimers(missionId) // #7106 — cancel status-update timers

    setMissions(prev => prev.map(m => {
      if (m.id !== missionId) return m
      // Accept any non-terminal status here (not just 'cancelling') because
      // the cancel intent may have been recorded synchronously while the
      // 'cancelling' state transition was still queued (#6370). We never
      // overwrite a completed/failed/cancelled mission — those are the
      // true terminal states.
      if (m.status === 'completed' || m.status === 'failed' || m.status === 'cancelled') return m
      return {
        ...m,
        status: 'cancelled' as MissionStatus,
        currentStep: undefined,
        updatedAt: new Date(),
        messages: [
          ...m.messages,
          {
            id: generateMessageId(),
            role: 'system',
            content: message,
            timestamp: new Date() }
        ]
      }
    }))
  }

  // Handle messages from the agent
  const handleAgentMessage = (message: { id: string; type: string; payload?: unknown }) => {
    // #6375 — First real application-layer frame on this socket means the
    // WebSocket upgrade succeeded all the way through any intermediaries.
    // Only now is it safe to reset the reconnection backoff. Transport-level
    // `onopen` is not sufficient because some WAFs complete the TCP handshake
    // and silently drop the WS upgrade frame, causing onopen → onclose in the
    // same tick and a backoff-reset storm.
    if (!connectionEstablished.current) {
      connectionEstablished.current = true
      wsReconnectAttempts.current = 0
    }
    // Handle agent-related messages (no mission ID needed)
    if (message.type === 'agents_list') {
      const payload = message.payload as AgentsListPayload
      // Sanitize agent metadata — strip interactive prompt artifacts that leak
      // from terminal-based agents (e.g. copilot-cli) into description fields (#5482).
      const sanitizedAgents = (payload.agents ?? []).map(agent => ({
        ...agent,
        description: stripInteractiveArtifacts(agent.description),
        displayName: stripInteractiveArtifacts(agent.displayName),
      }))
      setAgents(sanitizedAgents)
      setDefaultAgent(payload.defaultAgent)
      // Prefer persisted selection if the agent is still available.
      // If persisted is 'none' but an agent IS available, auto-select it
      // so AI mode is on by default when the agent is present.
      const persisted = localStorage.getItem(SELECTED_AGENT_KEY)
      const agents = payload.agents ?? []
      const hasAvailableAgent = agents.some(a => a.available)
      const persistedAvailable = persisted && persisted !== 'none' && agents.some(a => a.name === persisted && a.available)

      // When auto-selecting, prefer agents that execute commands directly over
      // agents that only suggest commands (e.g. copilot-cli). Interactive/suggest-only
      // agents produce terminal prompts instead of executing missions (#3609, #5481).
      const INTERACTIVE_AGENTS = new Set(['copilot-cli'])
      const bestAvailable = hasAvailableAgent
        ? (agents.find(a => a.available && ((a.capabilities ?? 0) & AgentCapabilityToolExec) !== 0 && !INTERACTIVE_AGENTS.has(a.name))?.name
          || agents.find(a => a.available && !INTERACTIVE_AGENTS.has(a.name))?.name
          || agents.find(a => a.available)?.name
          || null)
        : null
      // Filter the backend's defaultAgent if it is interactive — fall through to
      // bestAvailable which already excludes interactive agents (#5481).
      const safeDefaultAgent = payload.defaultAgent && !INTERACTIVE_AGENTS.has(payload.defaultAgent)
        ? payload.defaultAgent
        : null
      const resolved = persistedAvailable ? persisted : (payload.selected || safeDefaultAgent || bestAvailable)
      setSelectedAgent(resolved)
      // #7081 — Always persist the resolved agent preference to localStorage
      // so it survives WS drops. Previously, if the resolved agent came from
      // payload.selected or auto-selection (not the persisted value), a WS
      // disconnect before agent_selected ack would revert to the default on
      // the next handshake because localStorage had no entry.
      if (resolved) {
        localStorage.setItem(SELECTED_AGENT_KEY, resolved)
      }
      // If we restored a persisted agent that differs from the server's selection, tell the server.
      // #6831 — Persist the selection to localStorage at send time (not just on
      // agent_selected ack) so a connection drop between send and ack doesn't
      // silently revert the user's preferred agent on the next reconnect.
      if (persistedAvailable && persisted !== payload.selected && wsRef.current?.readyState === WebSocket.OPEN) {
        localStorage.setItem(SELECTED_AGENT_KEY, persisted)
        wsRef.current.send(JSON.stringify({
          id: `select-agent-${Date.now()}`,
          type: 'select_agent',
          payload: { agent: persisted }
        }))
      }
      setAgentsLoading(false)
      return
    }

    if (message.type === 'agent_selected') {
      const payload = message.payload as AgentSelectedPayload
      setSelectedAgent(payload.agent)
      localStorage.setItem(SELECTED_AGENT_KEY, payload.agent)
      return
    }

    // Handle cancel acknowledgment from backend — the cancel_chat request uses
    // a different ID format (cancel-*) so it won't be in pendingRequests. Match
    // the session ID from the payload instead.
    //
    // #8106 — The WebSocket protocol is inconsistent here: the Go backend's
    // `handleCancelChat` responds with `type: "result"` and payload
    // `{ cancelled, sessionId }` rather than a dedicated `cancel_ack` type.
    // Accept both shapes so missions transition out of `cancelling` immediately
    // regardless of which message type the backend emits. Without this, cancel
    // confirmations fall through to the generic result handler and get dropped
    // (their `id` is `cancel-<ts>`, which is never registered in
    // pendingRequests), leaving the mission stuck in `cancelling` until the
    // client-side fallback timeout fires.
    const isDedicatedCancelAck =
      message.type === CANCEL_ACK_MESSAGE_TYPE ||
      message.type === CANCEL_CONFIRMED_MESSAGE_TYPE
    // #9477 — The backend may send `cancelled` without `sessionId` in the
    // payload (e.g. when the cancel request payload itself had an empty
    // sessionId, or when a proxy strips the field). Previously the check
    // required BOTH `cancelled` AND `sessionId` in the payload, causing the
    // message to fall through to the generic result handler where it was
    // silently dropped (the cancel message's `id` is `cancel-<ts>`, which
    // is never registered in pendingRequests). This left the UI stuck on
    // "Cancelling..." indefinitely. Now we only require `cancelled` in the
    // payload, and fall back to resolving the mission ID from cancelIntents
    // or the missions list when `sessionId`/`id` are absent.
    const isCancelResultMessage =
      message.type === 'result' &&
      !!message.payload &&
      typeof message.payload === 'object' &&
      'cancelled' in (message.payload as Record<string, unknown>)
    if (isDedicatedCancelAck || isCancelResultMessage) {
      const payload = message.payload as {
        sessionId?: string
        id?: string
        success?: boolean
        cancelled?: boolean
        message?: string
      }
      // #7310 — Backend may send `id` instead of `sessionId` in the cancel_ack
      // payload. Check both fields to avoid a permanent cancelling state lock.
      // #9477 — When neither field is present, resolve the mission ID from the
      // active cancel intents or from missions currently in 'cancelling' status.
      let cancelledMissionId = payload.sessionId || payload.id
      if (!cancelledMissionId) {
        // First try cancelIntents — the authoritative set of missions with
        // pending cancellation requests.
        const intentIds = Array.from(cancelIntents.current)
        if (intentIds.length === 1) {
          cancelledMissionId = intentIds[0]
        } else {
          // Fall back to the first mission in 'cancelling' status.
          const cancellingMission = missionsRef.current.find(m => m.status === 'cancelling')
          if (cancellingMission) {
            cancelledMissionId = cancellingMission.id
          }
        }
      }
      if (cancelledMissionId) {
        // Treat either `success === false` (cancel_ack shape) or
        // `cancelled === false` (result shape from handleCancelChat) as a
        // failed cancellation. Any other value means the backend confirmed
        // the cancel.
        const cancelFailed = payload.success === false || payload.cancelled === false
        if (cancelFailed) {
          finalizeCancellation(cancelledMissionId, payload.message || 'Mission cancellation failed — the backend reported an error.')
        } else {
          finalizeCancellation(cancelledMissionId, 'Mission cancelled by user.')
        }
        // Drop the pending request entry so the generic result handler below
        // doesn't double-process this message.
        pendingRequests.current.delete(message.id)
      }
      return
    }

    const missionId = pendingRequests.current.get(message.id)
    if (!missionId) return

    // #6376 — Track background tool-call lifecycle so the inactivity watchdog
    // can pause while a long-running Kubernetes tool is in flight. The agent
    // protocol actually surfaces tool lifecycle events as `type: 'progress'`
    // frames with tool metadata in the payload (see `onProgress` in
    // pkg/agent/server_ai.go). A tool-start frame has `payload.tool` set and
    // no `payload.output`; a tool-result frame has `payload.tool` set AND
    // `payload.output` populated (truncated stdout). Count each shape as +1
    // or -1 respectively. Earlier revisions of this code keyed on
    // `tool_exec`/`tool_use`/`tool_call`/`tool_result`/`tool_done` message
    // types that never reach the frontend — that branch was dead code.
    if (message.type === 'progress') {
      const progressPayload = (message.payload ?? {}) as {
        tool?: string
        output?: string
      }
      if (progressPayload.tool) {
        if (progressPayload.output) {
          // Tool completed — decrement.
          const prevCount = toolsInFlight.current.get(missionId) ?? 0
          // #7078 — Ignore tool_result if prevCount is already 0. An
          // out-of-order or late frame (e.g. dropped tool_start on
          // reconnect) would decrement past zero, breaking future sequence
          // tracking and causing the watchdog to fire prematurely on
          // subsequent legitimate tool calls.
          if (prevCount > 0) {
            const next = prevCount - 1
            if (next === 0) toolsInFlight.current.delete(missionId)
            else toolsInFlight.current.set(missionId, next)
          }
        } else {
          // Tool started — increment.
          const prevCount = toolsInFlight.current.get(missionId) ?? 0
          toolsInFlight.current.set(missionId, prevCount + 1)
        }
        // Bump last stream timestamp so a tool that fires right at the edge
        // of the silence window doesn't trip the watchdog on the next interval.
        lastStreamTimestamp.current.set(missionId, Date.now())
      }
    }

    setMissions(prev => prev.map(m => {
      if (m.id !== missionId) return m

      // Discard messages for missions that have already reached a terminal state
      // (failed, completed, cancelled). This prevents stale responses from a
      // previously failed request from overwriting state after cancellation
      // (#4499, #5935).
      if (m.status === 'failed' || m.status === 'completed' || m.status === 'cancelled') {
        pendingRequests.current.delete(message.id)
        return m
      }

      // #6370 — If cancellation has been REQUESTED (even if the 'cancelling'
      // state transition has not yet been committed by React), treat any
      // terminal message as implicit cancel confirmation. Without this the
      // result handler below could race with `cancelMission`'s state update
      // and overwrite the cancellation intent with a 'completed' status.
      if (cancelIntents.current.has(missionId)) {
        const isTerminalMessage =
          message.type === 'result' ||
          message.type === 'error' ||
          (message.type === 'stream' && (message.payload as { done?: boolean })?.done)
        if (isTerminalMessage) {
          pendingRequests.current.delete(message.id)
          finalizeCancellation(missionId, 'Mission cancelled by user.')
          return m
        }
        // Non-terminal stream chunks while a cancel is in flight: drop them
        // so we don't flash the latest chunk into the UI right before the
        // mission transitions to 'cancelled'.
        return m
      }

      // If the mission is in 'cancelling' state and we receive a terminal message
      // (result, error, or stream-done), treat it as backend confirmation of the
      // cancellation. This handles backends that don't send an explicit cancel_ack.
      if (m.status === 'cancelling') {
        const isTerminalMessage =
          message.type === 'result' ||
          message.type === 'error' ||
          (message.type === 'stream' && (message.payload as { done?: boolean })?.done)
        if (isTerminalMessage) {
          pendingRequests.current.delete(message.id)
          finalizeCancellation(missionId, 'Mission cancelled by user.')
          return m // finalizeCancellation handles the state update via setMissions
        }
        // Ignore non-terminal messages (progress, partial stream) while cancelling
        return m
      }

      if (message.type === 'progress') {
        // Progress update from agent (e.g., "Querying cluster...", "Analyzing logs...")
        const payload = message.payload as {
          step?: string
          progress?: number
          tokens?: { input?: number; output?: number; total?: number }
        }
        // Reset inactivity timer — progress events prove the agent is alive,
        // even during long-running tool calls like `drasi init` (#5360).
        lastStreamTimestamp.current.set(missionId, Date.now())
        // Track token delta for category usage — guard against NaN from
        // malformed WebSocket payloads to prevent corrupted state (#5838)
        const safeTotal = Number(payload.tokens?.total)
        if (!Number.isNaN(safeTotal) && safeTotal > 0) {
          const previousTotal = m.tokenUsage?.total ?? 0
          const delta = safeTotal - previousTotal
          if (delta > 0) {
            addCategoryTokens(delta, 'missions')
          }
        }
        const safeInput = Number(payload.tokens?.input)
        const safeOutput = Number(payload.tokens?.output)
        return {
          ...m,
          currentStep: payload.step || m.currentStep,
          progress: payload.progress ?? m.progress,
          // #7314 — Only overwrite tokenUsage fields when the new value is
          // positive. A zero or NaN total from a payload that omits tokens
          // should not erase historic totals.
          tokenUsage: payload.tokens ? {
            input: !Number.isNaN(safeInput) && safeInput > 0 ? safeInput : (m.tokenUsage?.input ?? 0),
            output: !Number.isNaN(safeOutput) && safeOutput > 0 ? safeOutput : (m.tokenUsage?.output ?? 0),
            total: !Number.isNaN(safeTotal) && safeTotal > 0 ? safeTotal : (m.tokenUsage?.total ?? 0) } : m.tokenUsage,
          updatedAt: new Date() }
      } else if (message.type === 'stream') {
        // Streaming response from agent
        const payload = message.payload as ChatStreamPayload
        const lastMsg = m.messages[m.messages.length - 1]
        const now = Date.now()
        const lastTs = lastStreamTimestamp.current.get(missionId)

        // Check if there's been a gap (indicating tool use happened)
        // If so, start a new message bubble instead of appending
        const hasGap = lastTs && (now - lastTs > STREAM_GAP_THRESHOLD_MS)

        // Update timestamp for next check
        if (!payload.done) {
          lastStreamTimestamp.current.set(missionId, now)
        } else {
          // Clean up on stream complete
          lastStreamTimestamp.current.delete(missionId)
        }

        // #7079 — Also allow appending when the message ID is still in
        // pendingRequests, even if status has shifted to waiting_input due
        // to a premature stream_done. Without this, a late content chunk
        // would create a split bubble instead of being appended.
        const isActiveRequest = pendingRequests.current.has(message.id)
        if (lastMsg?.role === 'assistant' && !payload.done && (m.status === 'running' || m.status === 'waiting_input' || isActiveRequest) && !hasGap) {
          // Append to existing assistant message mid-stream (no gap detected).
          // #6829 — Also allow appending when status is 'waiting_input': if
          // stream_done arrived before the final content chunk (out-of-order
          // delivery), the mission is already 'waiting_input' but we must still
          // append the late chunk instead of creating a split bubble.
          return {
            ...m,
            status: 'running' as MissionStatus,
            currentStep: 'Generating response...',
            updatedAt: new Date(),
            agent: payload.agent || m.agent,
            messages: [
              ...m.messages.slice(0, -1),
              { ...lastMsg, content: lastMsg.content + (payload.content || ''), agent: payload.agent || lastMsg.agent }
            ]
          }
        } else if (!payload.done && payload.content) {
          // First chunk OR gap detected - create new assistant message.
          // #6378 — Include a monotonic per-mission split counter in the key
          // so two splits within the same millisecond (timer resolution on
          // some platforms is 1ms; two chunks coming back-to-back after a
          // tool-use gap is common) don't collide on Date.now() alone and
          // trigger React "duplicate key" warnings + rendering glitches.
          const splitIndex = (streamSplitCounter.current.get(missionId) ?? 0) + 1
          streamSplitCounter.current.set(missionId, splitIndex)
          return {
            ...m,
            status: 'running' as MissionStatus,
            currentStep: 'Generating response...',
            updatedAt: new Date(),
            agent: payload.agent || m.agent,
            messages: [
              ...m.messages,
              {
                id: generateMessageId(`s${splitIndex}`),
                role: 'assistant' as const,
                content: payload.content,
                timestamp: new Date(),
                agent: payload.agent || m.agent }
            ]
          }
        } else if (payload.done) {
          // Stream complete - mark as unread
          // NOTE: Do NOT delete from pendingRequests here. The backend sends a
          // 'result' message after streaming completes. If we delete the request
          // ID now, the result handler (which handles status transition and token
          // tracking) silently drops the message, leaving the mission stuck in
          // 'running' state until the 5-minute client timeout fires (#2973, #2974).
          markMissionAsUnread(missionId)

          // Track token delta for category usage when stream completes with usage data
          if (payload.usage?.totalTokens) {
            const previousTotal = m.tokenUsage?.total ?? 0
            const delta = payload.usage.totalTokens - previousTotal
            if (delta > 0) {
              addCategoryTokens(delta, 'missions')
            }
          }

          // Clear active token tracking for this specific mission (#6016 —
          // per-operation tracking so concurrent missions don't clobber each
          // other's category).
          // NOTE: Do NOT emit analytics completion here — stream-done is not
          // authoritative. The backend sends a separate 'result' message with
          // the final answer; emitMissionCompleted fires there (#5510).
          clearActiveTokenCategory(missionId)
          // Start the watchdog that auto-fails the mission if no final result
          // message arrives within WAITING_INPUT_TIMEOUT_MS (#5936).
          startWaitingInputTimeout(missionId)
          return {
            ...m,
            status: 'waiting_input' as MissionStatus,
            currentStep: undefined,
            updatedAt: new Date() }
        }
      } else if (message.type === 'result') {
        // Complete response - mark as unread
        const payload = message.payload as ChatStreamPayload | { content?: string; output?: string }
        pendingRequests.current.delete(message.id)
        clearWaitingInputTimeout(missionId) // #5936 — result received, cancel watchdog
        // #6410 — mission reached terminal state; drop its per-mission tracking.
        streamSplitCounter.current.delete(missionId)
        toolsInFlight.current.delete(missionId)
        lastStreamTimestamp.current.delete(missionId)
        markMissionAsUnread(missionId)

        // Extract token usage if available
        const chatPayload = payload as ChatStreamPayload
        const tokenUsage = chatPayload.usage ? {
          input: chatPayload.usage.inputTokens,
          output: chatPayload.usage.outputTokens,
          total: chatPayload.usage.totalTokens } : m.tokenUsage

        // Track token delta for category usage
        if (chatPayload.usage?.totalTokens) {
          const previousTotal = m.tokenUsage?.total ?? 0
          const delta = chatPayload.usage.totalTokens - previousTotal
          if (delta > 0) {
            addCategoryTokens(delta, 'missions')
          }
        }

        // Clear active token tracking for this mission and emit completion
        // event (#6016 — per-operation tracking keyed by missionId).
        clearActiveTokenCategory(missionId)
        if (m.status === 'running') {
          // #7326 — Cap duration at 24 hours to prevent numeric overflow
          // from clock skew or backgrounded tabs.
          const rawDuration = Math.round((Date.now() - m.createdAt.getTime()) / 1000)
          const clampedDuration = Math.min(Math.max(rawDuration, 0), SECONDS_PER_DAY)
          emitMissionCompleted(m.type, clampedDuration)
          // Notify data-dependent components (e.g. ACMM scan) so they
          // re-fetch after a mission may have changed the repo's state.
          window.dispatchEvent(new CustomEvent('kc-mission-completed', {
            detail: { missionId, missionType: m.type },
          }))
        }

        const resultContent = chatPayload.content || (payload as { output?: string }).output || 'Task completed.'
        // Check ALL assistant messages since the last user message for streamed content
        // (streaming may split into multiple bubbles due to tool-use gaps)
        const lastUserIdx = m.messages.map(msg => msg.role).lastIndexOf('user')
        // #7320 — When no user messages exist (system-generated missions),
        // limit the lookback to the last MAX_DEDUP_LOOKBACK messages to prevent
        // memory spikes on massive histories.
        const MAX_DEDUP_LOOKBACK = 50
        const sliceStart = lastUserIdx >= 0 ? lastUserIdx + 1 : Math.max(0, m.messages.length - MAX_DEDUP_LOOKBACK)
        const streamedSinceUser = m.messages
          .slice(sliceStart)
          .filter(msg => msg.role === 'assistant')
          .map(msg => msg.content)
          .join('')

        // #5948 — Dedupe streamed vs final response.
        //
        // Previously this check used `streamedSinceUser.startsWith(resultContent.slice(...))`
        // which only matched when the streamed content EXACTLY started with the
        // final result. Small differences (trailing whitespace, newline chunks,
        // punctuation added in the final pass, or the result arriving as a
        // suffix of the stream) caused the dedupe to miss and the same
        // assistant response was appended a second time.
        //
        // The new check normalizes whitespace and matches in BOTH directions
        // (streamed contains result OR result contains streamed). This catches
        // the common cases where the two differ only in trivial formatting.
        /** Collapse whitespace + trim so trivial formatting differences don't defeat dedupe. */
        const normalize = (s: string): string => s.replace(/\s+/g, ' ').trim()
        const normalizedStreamed = normalize(streamedSinceUser)
        const normalizedResult = normalize(resultContent)
        /** Minimum content length required before we consider an overlap a real dedupe match. */
        const DEDUPE_MIN_CONTENT_LEN = 1
        const alreadyStreamed =
          normalizedStreamed.length >= DEDUPE_MIN_CONTENT_LEN &&
          normalizedResult.length >= DEDUPE_MIN_CONTENT_LEN &&
          (
            normalizedStreamed === normalizedResult ||
            normalizedStreamed.includes(normalizedResult) ||
            normalizedResult.includes(normalizedStreamed)
          )

        // Transition to 'completed' when a result message arrives — this is the
        // backend's final answer for the current turn. The 'waiting_input' state
        // is only used while streaming is in progress (stream done w/o result).
        // The UI shows a completion panel with feedback buttons when status is
        // 'completed', so reaching this state is the correct lifecycle end (#5479).
        // #11070 — If the backend flagged this result as an error (e.g. non-zero
        // exit code from a CLI provider), mark the mission 'failed' instead.
        const resultIsError = !!(chatPayload as Record<string, unknown>).isError
        return {
          ...m,
          status: (resultIsError ? 'failed' : 'completed') as MissionStatus,
          currentStep: undefined,
          updatedAt: new Date(),
          agent: chatPayload.agent || m.agent,
          tokenUsage,
          messages: alreadyStreamed ? m.messages : [
            ...m.messages,
            {
              id: generateMessageId(),
              role: 'assistant' as const,
              content: resultContent,
              timestamp: new Date(),
              agent: chatPayload.agent || m.agent }
          ]
        }
      } else if (message.type === 'error') {
        const payload = message.payload as { code?: string; message?: string }
        pendingRequests.current.delete(message.id)
        clearWaitingInputTimeout(missionId) // #5936 — terminal error, cancel watchdog
        // #6410 — mission reached terminal state; drop its per-mission tracking.
        streamSplitCounter.current.delete(missionId)
        toolsInFlight.current.delete(missionId)
        lastStreamTimestamp.current.delete(missionId)
        emitMissionError(m.type, payload.code || 'unknown', payload.message)

        // Create helpful error message based on error code
        let errorContent = payload.message || 'Unknown error'
        if (payload.code === 'no_agent' || payload.code === 'agent_unavailable') {
          errorContent = `**Mission interrupted — agent not available**\n\nThe AI agent was disconnected or is not reachable. This often happens after a page refresh.\n\n**To fix:**\n1. Make sure your agent (e.g., Claude Code, bob) is running\n2. Select the agent from the top navbar\n3. Click **Retry Mission** below to rerun your request`
        } else if (payload.code === 'authentication_error') {
          errorContent = '**Authentication Error — Agent CLI Needs Attention**\n\nThis is not a console issue. The AI agent\'s API token has expired or is invalid.\n\n**To fix:** Restart kc-agent to refresh authentication, or run `gh auth status` in your terminal to verify your credentials. You can also update your API key in [Settings →](/settings).\n\nOnce re-authenticated, retry your message.'
        } else if (payload.code === 'mission_timeout') {
          errorContent = `**Mission Timed Out**\n\n${payload.message}\n\nYou can:\n- **Retry** the mission with the same or a different prompt\n- **Try a simpler request** that requires less processing\n- **Check your AI provider** configuration in [Settings](/settings)`
        }

        // Pattern-match common API provider errors for user-friendly messages
        const combinedErrorText = `${payload.code || ''} ${payload.message || ''}`.toLowerCase()

        // Detect authentication / token expiry errors (HTTP 401/403)
        const isAuthError =
          combinedErrorText.includes('401') ||
          combinedErrorText.includes('403') ||
          combinedErrorText.includes('authentication_error') ||
          combinedErrorText.includes('permission_error') ||
          combinedErrorText.includes('oauth token') ||
          combinedErrorText.includes('token has expired') ||
          combinedErrorText.includes('invalid x-api-key') ||
          combinedErrorText.includes('invalid_api_key') ||
          combinedErrorText.includes('unauthorized') ||
          combinedErrorText.includes('failed to authenticate')

        if (isAuthError) {
          errorContent = '**Authentication Error — Agent CLI Needs Attention**\n\nThis is not a console issue. The AI agent\'s API token has expired or is invalid.\n\n**To fix:** Restart kc-agent to refresh authentication, or run `gh auth status` in your terminal to verify your credentials. You can also update your API key in [Settings →](/settings).\n\nOnce re-authenticated, retry your message.'
        }

        // Detect rate limit / quota errors from the AI provider (HTTP 429)
        const isRateLimit =
          combinedErrorText.includes('429') ||
          combinedErrorText.includes('rate limit') ||
          combinedErrorText.includes('rate_limit') ||
          combinedErrorText.includes('quota') ||
          combinedErrorText.includes('too many requests') ||
          combinedErrorText.includes('resource_exhausted') ||
          combinedErrorText.includes('tokens per min') ||
          combinedErrorText.includes('requests per min')

        if (isRateLimit) {
          errorContent = '**AI Provider Rate Limit Exceeded**\n\nThe AI provider returned a quota/rate limit error (HTTP 429). Please wait a minute before retrying, or switch to a different AI provider.'
        }

        return {
          ...m,
          status: 'failed' as MissionStatus,
          currentStep: undefined,
          updatedAt: new Date(),
          messages: [
            ...m.messages,
            {
              id: generateMessageId(),
              role: 'system' as const,
              content: errorContent,
              timestamp: new Date() }
          ]
        }
      }

      return m
    }))
  }

  // Keep the ref in sync so ensureConnection always calls the latest handler
  handleAgentMessageRef.current = handleAgentMessage

  // Start a new mission
  /**
   * Shared preflight + execute pipeline.
   * Runs preflight permission check and, on success, delegates to executeMission.
   * Used by startMission and runSavedMission to avoid duplicating preflight logic (#4768).
   */
  const preflightAndExecute = (
    missionId: string,
    enhancedPrompt: string,
    params: { cluster?: string; context?: Record<string, unknown>; type?: string },
  ) => {
    const missionNeedsCluster = !!params.cluster || ['deploy', 'repair', 'upgrade'].includes(params.type || '')
    // Run preflight on ALL target clusters, not just the first one (#7177).
    const clusterContexts = params.cluster?.split(',').map(c => c.trim()).filter(Boolean) || []
    const preflightPromise = missionNeedsCluster && clusterContexts.length > 0
      ? Promise.all(
          clusterContexts.map(ctx =>
            runPreflightCheck((args, opts) => kubectlProxy.exec(args, opts), ctx)
          )
        ).then(results => {
          const failed = results.find(r => !r.ok)
          return failed || { ok: true as const }
        })
      : missionNeedsCluster
        ? runPreflightCheck((args, opts) => kubectlProxy.exec(args, opts))
        : Promise.resolve({ ok: true } as PreflightResult)

    preflightPromise.then(preflight => {
      if (!preflight.ok && 'error' in preflight && preflight.error) {
        // Preflight failed — block the mission with a structured error
        setMissions(prev => prev.map(m =>
          m.id === missionId ? {
            ...m,
            status: 'blocked' as MissionStatus,
            currentStep: 'Preflight check failed',
            preflightError: preflight.error,
            messages: [
              ...m.messages,
              {
                id: generateMessageId('preflight'),
                role: 'system' as const,
                content: `**Preflight Check Failed**\n\nThe mission cannot proceed because cluster access verification failed. See the details below for how to fix this.\n\nError: ${preflight.error?.message || 'Unknown error'}`,
                timestamp: new Date() }
            ]
          } : m
        ))
        emitMissionError(
          params.type || 'custom',
          preflight.error?.code || 'preflight_unknown',
          preflight.error?.message
        )
        if (preflight.error?.message) {
          emitError('cluster_access', preflight.error.message)
        }
        return
      }

      // #6384 item 1 (dup of #6381) — if the user clicked Cancel while
      // preflight was running, honor the cancel instead of firing the
      // request off to the agent. Without this guard, executeMission would
      // race with cancelMission and the mission would end up in 'running'
      // despite a cancel being in flight.
      if (cancelIntents.current.has(missionId)) {
        finalizeCancellation(missionId, 'Mission cancelled by user before execution started.')
        return
      }
      // Preflight passed — proceed to send to agent
      executeMission(missionId, enhancedPrompt, params)
    }).catch((err) => {
      // Preflight itself threw unexpectedly — block the mission instead of
      // fail-open to prevent executing without validation (#5846)
      setMissions(prev => prev.map(m =>
        m.id === missionId ? {
          ...m,
          status: 'blocked' as MissionStatus,
          currentStep: 'Preflight check error',
          preflightError: {
            code: 'UNKNOWN_EXECUTION_FAILURE',
            message: err instanceof Error ? err.message : 'Unknown error',
            details: { hint: 'The preflight check threw an unexpected error. Retry or check cluster connectivity.' },
          },
          messages: [
            ...m.messages,
            {
              id: generateMessageId('preflight-error'),
              role: 'system' as const,
              content: `**Preflight Check Error**\n\nThe preflight check encountered an unexpected error. The mission has been blocked to prevent unvalidated execution.\n\nError: ${err instanceof Error ? err.message : 'Unknown error'}`,
              timestamp: new Date() }
          ]
        } : m
      ))
    })
   
  }

  const startMission = (params: StartMissionParams): string => {
    // #7086/#7094/#7100 — Use pre-generated ID from confirmPendingReview if
    // available, otherwise generate a new one. This ensures the ID returned
    // to callers before review confirmation stays valid after confirmation.
    const preGenId = params.context?.__preGeneratedMissionId as string | undefined
    const missionId = preGenId || `mission-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 9)}`
    // Strip the internal marker from context before persisting
    if (preGenId && params.context) {
      const { __preGeneratedMissionId: _, ...cleanContext } = params.context
      params = { ...params, context: Object.keys(cleanContext).length > 0 ? cleanContext : undefined }
    }

    // (#6455, #7087/#7101) When skipReview is not set, queue the params so
    // the UI can show ConfirmMissionPromptDialog. Changed from single-slot
    // to a queue so concurrent requests don't overwrite each other.
    if (!params.skipReview) {
      setPendingReviewQueue(prev => [...prev, { params, missionId }])
      return missionId
    }

    const { enhancedPrompt, matchedResolutions, isInstallMission } = buildEnhancedPrompt(params)

    // Build initial messages
    const initialMessages: MissionMessage[] = [
      {
        id: generateMessageId(),
        role: 'user',
        content: params.initialPrompt, // Show original prompt in UI
        timestamp: new Date() },
      ...buildSystemMessages(isInstallMission, matchedResolutions),
    ]

    const mission: Mission = {
      id: missionId,
      title: params.title,
      description: params.description,
      type: params.type,
      status: 'pending',
      cluster: params.cluster,
      messages: initialMessages,
      createdAt: new Date(),
      updatedAt: new Date(),
      context: params.context,
      agent: selectedAgentRef.current || defaultAgentRef.current || undefined,
      matchedResolutions: matchedResolutions.length > 0 ? matchedResolutions : undefined }

    setMissions(prev => [mission, ...prev])
    setActiveMissionId(missionId)
    setIsSidebarOpen(true)
    setIsSidebarMinimized(false)
    emitMissionStarted(params.type, selectedAgentRef.current || defaultAgentRef.current || 'unknown')

    // Run preflight permission check for missions that target a cluster.
    // This catches missing credentials, expired tokens, RBAC denials, etc.
    // before the agent starts executing mutating steps (#3742).
    preflightAndExecute(missionId, enhancedPrompt, params)

    return missionId
     
  }

  // #7304 — Track missions currently being sent to the agent to prevent
  // duplicate WS requests from double-clicks or rapid keyboard input
  // during the preflight resolution window.
  const executingMissions = useRef<Set<string>>(new Set())

  /**
   * Internal: send mission to agent after preflight passes.
   * Extracted from startMission to allow reuse from retryPreflight.
   */
  const executeMission = (
    missionId: string,
    enhancedPrompt: string,
    params: { context?: Record<string, unknown>; type?: string; dryRun?: boolean },
  ) => {
    const missionType = params.type || 'custom'
    // #6384 item 1 (dup of #6381) — if a cancel intent is already set for
    // this missionId we must not clear it and proceed to send. This
    // scenario happens when the user clicks Cancel after preflightAndExecute
    // kicked off but before executeMission started sending to the agent.
    // Finalize the cancel and return without contacting the backend.
    if (cancelIntents.current.has(missionId)) {
      finalizeCancellation(missionId, 'Mission cancelled by user before execution started.')
      return
    }
    // #7304 — Prevent duplicate execution: if this mission is already being
    // sent to the agent (e.g. double-click during preflight window), bail out.
    if (executingMissions.current.has(missionId)) {
      console.debug(`[Missions] executeMission already in-flight for ${missionId}, skipping duplicate`)
      return
    }
    executingMissions.current.add(missionId)

    // A retry may reuse a missionId that had a previous cancel intent;
    // only clear stale entries once we've confirmed no cancel is pending
    // (#6370). `retryPreflight` and `runSavedMission` route back through
    // `preflightAndExecute`, which checks above; `startMission` reaches
    // this point with a fresh mission ID and an empty cancelIntents entry.
    cancelIntents.current.delete(missionId)

    // Route Kagenti-selected missions through backend SSE proxy instead of
    // local-agent WebSocket, so in-cluster deployments work without kc-agent.
    if (selectedAgentRef.current === 'kagenti') {
      const startedAt = Date.now()
      const assistantMessageId = generateMessageId('kagenti-stream')

      setMissions(prev => prev.map(m =>
        m.id === missionId
          ? { ...m, status: 'running', currentStep: 'Connecting to kagenti...' }
          : m
      ))

      void (async () => {
        let target = getSelectedKagentiAgentFromStorage()
        if (!target) {
          const discovered = await fetchKagentiProviderAgents()
          if ((discovered || []).length > 0) {
            target = {
              namespace: discovered[0].namespace,
              name: discovered[0].name,
            }
          }
        }

        if (!target) {
          executingMissions.current.delete(missionId)
          const errorContent = `**Kagenti Agent Not Selected**\n\nSelect a Kagenti agent in Settings → Agent Backend, then retry this mission.`
          setMissions(prev => prev.map(m =>
            m.id === missionId
              ? {
                  ...m,
                  status: 'failed',
                  currentStep: undefined,
                  messages: [
                    ...m.messages,
                    {
                      id: generateMessageId('kagenti-missing-agent'),
                      role: 'system',
                      content: errorContent,
                      timestamp: new Date(),
                    },
                  ],
                }
              : m
          ))
          emitMissionError(missionType, 'kagenti_agent_missing', 'no_selected_kagenti_agent')
          return
        }

        await kagentiProviderChat(target.name, target.namespace, enhancedPrompt, {
          contextId: missionId,
          onChunk: (text: string) => {
            setMissions(prev => prev.map(m => {
              if (m.id !== missionId) return m

              const idx = m.messages.findIndex(msg => msg.id === assistantMessageId)
              if (idx === -1) {
                return {
                  ...m,
                  currentStep: `Processing with ${selectedAgentRef.current || 'kagenti'}...`,
                  messages: [
                    ...m.messages,
                    {
                      id: assistantMessageId,
                      role: 'assistant',
                      content: text,
                      timestamp: new Date(),
                      agent: selectedAgentRef.current || 'kagenti',
                    },
                  ],
                }
              }

              const nextMessages = [...m.messages]
              nextMessages[idx] = {
                ...nextMessages[idx],
                content: `${nextMessages[idx].content}${text}`,
                timestamp: new Date(),
              }
              return {
                ...m,
                currentStep: `Processing with ${selectedAgentRef.current || 'kagenti'}...`,
                messages: nextMessages,
              }
            }))
          },
          onDone: () => {
            executingMissions.current.delete(missionId)
            const durationMs = Math.max(0, Date.now() - startedAt)
            emitMissionCompleted(missionType, durationMs)

            setMissions(prev => prev.map(m => {
              if (m.id !== missionId) return m

              const hasAssistant = m.messages.some(msg => msg.id === assistantMessageId && msg.content.trim().length > 0)
              return {
                ...m,
                status: 'completed',
                currentStep: undefined,
                updatedAt: new Date(),
                messages: hasAssistant
                  ? m.messages
                  : [
                      ...m.messages,
                      {
                        id: assistantMessageId,
                        role: 'assistant',
                        content: 'Task completed.',
                        timestamp: new Date(),
                        agent: selectedAgentRef.current || 'kagenti',
                      },
                    ],
              }
            }))
          },
          onError: (error: string) => {
            executingMissions.current.delete(missionId)
            emitMissionError(missionType, 'kagenti_chat_error', error)

            setMissions(prev => prev.map(m =>
              m.id === missionId
                ? {
                    ...m,
                    status: 'failed',
                    currentStep: undefined,
                    updatedAt: new Date(),
                    messages: [
                      ...m.messages,
                      {
                        id: generateMessageId('kagenti-error'),
                        role: 'system',
                        content: `**Kagenti Request Failed**\n\n${error}`,
                        timestamp: new Date(),
                      },
                    ],
                  }
                : m
            ))
          },
        })
      })()

      return
    }

    // Send to agent
    ensureConnection().then(() => {
      executingMissions.current.delete(missionId)
      const requestId = generateRequestId()
      pendingRequests.current.set(requestId, missionId)

      setMissions(prev => prev.map(m =>
        m.id === missionId ? { ...m, status: 'running', currentStep: 'Connecting to agent...' } : m
      ))

      // Track token usage for this specific mission (#6016 — keyed by
      // missionId so concurrent missions get independent attribution).
      setActiveTokenCategory(missionId, 'missions')

      wsSend(JSON.stringify({
        id: requestId,
        type: 'chat',
        payload: {
          prompt: enhancedPrompt, // Send enhanced prompt with resolution context to AI
          sessionId: missionId,
          agent: selectedAgentRef.current || undefined,
          // Include mission context for the agent to use
          context: params.context,
          // Server-enforced dry-run gate (#6442): when true, the backend
          // tracks this session as dry-run and rejects mutating kubectl
          // commands at the server level, not just in the prompt.
          dryRun: params.dryRun || false }
      }), () => {
        setMissions(prev => prev.map(m =>
          m.id === missionId ? { ...m, status: 'failed', currentStep: 'WebSocket connection lost' } : m
        ))
      })

      // #7106 — Track status-update timers so they can be cleared on
      // cancel/dismiss/unmount. Without this, delayed callbacks mutate
      // state after the mission lifecycle has ended.
      if (!missionStatusTimers.current.has(missionId)) {
        missionStatusTimers.current.set(missionId, new Set())
      }
      const timers = missionStatusTimers.current.get(missionId)!

      // Update status after message is sent
      const waitingHandle = setTimeout(() => {
        timers.delete(waitingHandle)
        if (unmountedRef.current) return
        setMissions(prev => prev.map(m =>
          m.id === missionId && m.currentStep === 'Connecting to agent...'
            ? { ...m, currentStep: 'Waiting for response...' }
            : m
        ))
      }, STATUS_WAITING_DELAY_MS)
      timers.add(waitingHandle)

      // Update status while AI is processing
      const processingHandle = setTimeout(() => {
        timers.delete(processingHandle)
        if (unmountedRef.current) return
        setMissions(prev => prev.map(m =>
          m.id === missionId && m.currentStep === 'Waiting for response...'
            ? { ...m, currentStep: `Processing with ${selectedAgentRef.current || 'AI'}...` }
            : m
        ))
      }, STATUS_PROCESSING_DELAY_MS)
      timers.add(processingHandle)
    }).catch(() => {
      // #7304 — Clean up the executing guard on connection failure
      executingMissions.current.delete(missionId)
      const errorContent = `**Local Agent Not Connected**

Install the console locally with the KubeStellar Console agent to use AI missions.`

      setMissions(prev => prev.map(m =>
        m.id === missionId ? {
          ...m,
          status: 'failed',
          currentStep: undefined,
          messages: [
            ...m.messages,
            {
              id: generateMessageId(),
              role: 'system',
              content: errorContent,
              timestamp: new Date() }
          ]
        } : m
      ))
    })
  }

  /**
   * Retry preflight check for a blocked mission.
   * If preflight passes, transitions the mission to running and sends to agent.
   */
  const retryPreflight = (missionId: string) => {
    const mission = missionsRef.current.find(m => m.id === missionId)
    if (!mission || mission.status !== 'blocked') return

    // Transition to pending while we re-check
    setMissions(prev => prev.map(m =>
      m.id === missionId ? {
        ...m,
        status: 'pending' as MissionStatus,
        currentStep: 'Re-running preflight check...',
        preflightError: undefined } : m
    ))

    // #7145 — Validate ALL clusters in a multi-cluster mission, not just the
    // first. The cluster field is comma-separated; the old code split on ','
    // and only checked [0], giving a false recovery state when later clusters
    // were still failing.
    const clusterContexts = (mission.cluster || '')
      .split(',')
      .map(c => c.trim())
      .filter(Boolean)

    // Run preflight on every cluster context. If any fails, block the mission.
    const preflightForCluster = clusterContexts.length > 0
      ? clusterContexts
      : [undefined] // No cluster specified — run default preflight once

    Promise.all(
      preflightForCluster.map(ctx =>
        runPreflightCheck(
          (args, opts) => kubectlProxy.exec(args, opts),
          ctx,
        ).then(result => ({ ctx, result }))
      )
    ).then(results => {
      // Find first failing cluster
      const failing = results.find(r => !r.result.ok && 'error' in r.result && r.result.error)
      const preflight = failing ? failing.result : results[0].result
      if (!preflight.ok && 'error' in preflight && preflight.error) {
        // Still failing — re-block
        setMissions(prev => prev.map(m =>
          m.id === missionId ? {
            ...m,
            status: 'blocked' as MissionStatus,
            currentStep: 'Preflight check failed',
            preflightError: preflight.error,
            messages: [
              ...m.messages,
              {
                id: generateMessageId('preflight-retry'),
                role: 'system' as const,
                content: `**Preflight Check Still Failing**\n\nError: ${preflight.error?.message || 'Unknown error'}`,
                timestamp: new Date() }
            ]
          } : m
        ))
        if (preflight.error?.message) {
          emitError('cluster_access', preflight.error.message)
        }
        return
      }

      // #7091 — Preflight passed — rebuild prompt using the full enhancement
      // pipeline (cluster targeting, dry-run, non-interactive, resolution
      // matching) instead of ad-hoc partial reconstruction. The old code
      // only prepended cluster context, losing dry-run instructions,
      // resolution context, and non-interactive handling from the original
      // enriched prompt.
      const lastUserMsg = mission.messages.find(m => m.role === 'user')
      const retryParams: StartMissionParams = {
        title: mission.title,
        description: mission.description,
        type: mission.type,
        cluster: mission.cluster,
        initialPrompt: lastUserMsg?.content || mission.description,
        context: mission.context,
        dryRun: !!mission.context?.dryRun,
      }
      const { enhancedPrompt: prompt } = buildEnhancedPrompt(retryParams)

      setMissions(prev => prev.map(m =>
        m.id === missionId ? {
          ...m,
          preflightError: undefined,
          messages: [
            ...m.messages,
            {
              id: generateMessageId('preflight-ok'),
              role: 'system' as const,
              content: '**Preflight check passed** — proceeding with mission execution.',
              timestamp: new Date() }
          ]
        } : m
      ))

      executeMission(missionId, prompt, { context: mission.context, type: mission.type })
    }).catch((err) => {
      // Preflight threw unexpectedly — re-block instead of fail-open (#5851)
      setMissions(prev => prev.map(m =>
        m.id === missionId ? {
          ...m,
          status: 'blocked' as MissionStatus,
          currentStep: 'Preflight check error',
          preflightError: {
            code: 'UNKNOWN_EXECUTION_FAILURE',
            message: err instanceof Error ? err.message : 'Unknown error',
            details: { hint: 'The preflight check threw an unexpected error. Retry or check cluster connectivity.' },
          },
        } : m
      ))
    })
  }

  // Save a mission to library without running it
  const saveMission = (params: SaveMissionParams): string => {
    const missionId = `mission-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 9)}`

    const mission: Mission = {
      id: missionId,
      title: params.title,
      description: params.description,
      type: params.type,
      status: 'saved',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      context: params.context,
      importedFrom: {
        title: params.title,
        description: params.description,
        missionClass: params.missionClass,
        cncfProject: params.cncfProject,
        steps: params.steps,
        tags: params.tags } }

    setMissions(prev => [mission, ...prev])
    return missionId
  }

  // Run a previously saved mission, optionally targeting a specific cluster.
  // Delegates to the shared prompt-enhancement + preflight + execute pipeline
  // so saved missions get the same checks as freshly-started ones (#4768).
  const runSavedMission = (missionId: string, cluster?: string) => {
    const mission = missions.find(m => m.id === missionId)
    if (!mission || mission.status !== 'saved') return

    // Re-validate imported mission content before execution to catch
    // malicious payloads that may have been modified after initial import scan
    if (mission.importedFrom?.steps) {
      const syntheticExport = {
        version: 'kc-mission-v1',
        title: mission.importedFrom.title || mission.title,
        description: mission.importedFrom.description || mission.description,
        type: mission.type,
        tags: mission.importedFrom.tags || [],
        steps: mission.importedFrom.steps.map(s => ({
          title: s.title,
          description: s.description })) }
      const findings = scanForMaliciousContent(syntheticExport)
      if (findings.length > 0) {
        setMissions(prev => prev.map(m => m.id === missionId ? {
          ...m,
          status: 'failed' as const,
          messages: [...m.messages, {
            id: generateMessageId(),
            role: 'system' as const,
            content: `**Mission blocked:** Imported mission contains potentially unsafe content:\n\n${findings.map(f => `- ${f.message}: \`${f.match}\` (in ${f.location})`).join('\n')}\n\nPlease review and edit the mission before running.`,
            timestamp: new Date() }]
        } : m))
        return
      }
    }

    // Build the base prompt from saved mission data
    const basePrompt = buildSavedMissionPrompt(mission)

    // Build StartMissionParams so we can reuse the shared prompt pipeline
    const params: StartMissionParams = {
      title: mission.title,
      description: mission.description,
      type: mission.type,
      cluster: cluster || undefined,
      initialPrompt: basePrompt,
      context: mission.context }

    // Run the shared prompt-enhancement pipeline (cluster targeting,
    // dry-run, non-interactive handling, resolution matching)
    const { enhancedPrompt, matchedResolutions, isInstallMission } = buildEnhancedPrompt(params)
    const systemMessages = buildSystemMessages(isInstallMission, matchedResolutions)

    // Transition saved mission to pending with proper messages
    setMissions(prev => prev.map(m =>
      m.id === missionId ? {
        ...m,
        status: 'pending' as MissionStatus,
        cluster: cluster || undefined,
        agent: selectedAgentRef.current || defaultAgentRef.current || undefined,
        matchedResolutions: matchedResolutions.length > 0 ? matchedResolutions : undefined,
        messages: [
          {
            id: generateMessageId(),
            role: 'user' as const,
            content: basePrompt, // Show original prompt in UI (not cluster prefix)
            timestamp: new Date() },
          ...systemMessages,
        ],
        updatedAt: new Date() } : m
    ))
    setActiveMissionId(missionId)
    setIsSidebarOpen(true)
    setIsSidebarMinimized(false)
    emitMissionStarted(params.type, selectedAgentRef.current || defaultAgentRef.current || 'unknown')

    // Run preflight permission check, then execute via the shared pipeline
    preflightAndExecute(missionId, enhancedPrompt, params)
  }

  // Cancel a running mission — sends cancel signal to backend to kill agent process.
  // Uses WebSocket if connected, otherwise falls back to HTTP POST endpoint.
  // Sets status to 'cancelling' immediately, then waits for backend acknowledgment
  // before transitioning to final 'failed' state. Falls back to a timeout if no ack.
  const cancelMission = (missionId: string) => {
    // #7080 — Idempotency guard: if a cancel is already in flight (either a
    // timeout is pending or the intent was already recorded), bail out to
    // prevent duplicate setTimeout handles and overlapping finalization.
    if (cancelTimeouts.current.has(missionId) || cancelIntents.current.has(missionId)) return

    // #6370 — Mark the cancel intent synchronously BEFORE any state update or
    // backend call. This is the authoritative signal for the message handler:
    // any terminal message arriving after this point will be routed through
    // `finalizeCancellation` instead of transitioning to 'completed'.
    cancelIntents.current.add(missionId)

    // Pending missions have never been sent to the backend yet (preflight
    // check is still running, or ensureConnection has not resolved). We can
    // short-circuit here and finalize the mission as cancelled without
    // contacting the backend at all (#5932). This also applies to the
    // 'blocked' state where the mission is waiting on preflight resolution.
    const currentMission = missionsRef.current.find(m => m.id === missionId)
    if (currentMission && (currentMission.status === 'pending' || currentMission.status === 'blocked')) {
      // Clean up any tracking just in case
      for (const [reqId, mId] of pendingRequests.current.entries()) {
        if (mId === missionId) pendingRequests.current.delete(reqId)
      }
      lastStreamTimestamp.current.delete(missionId)
      clearMissionStatusTimers(missionId) // #7144 — clean up pending timers
      cancelIntents.current.delete(missionId) // #7144 — clear intent after handling

      // #7144/#7153 — Pre-start missions should be marked 'cancelled', not
      // 'failed'. The user explicitly cancelled; 'failed' misrepresents
      // intent and corrupts mission history.
      setMissions(prev => prev.map(m =>
        m.id === missionId ? {
          ...m,
          status: 'cancelled' as MissionStatus,
          currentStep: undefined,
          preflightError: undefined,
          updatedAt: new Date(),
          messages: [
            ...m.messages,
            {
              id: `msg-cancel-pending-${Date.now()}`,
              role: 'system' as const,
              content: 'Mission cancelled by user before it started.',
              timestamp: new Date() }
          ]
        } : m
      ))
      return
    }

    // Keep pendingRequests intact so that terminal messages (result, stream-done)
    // from the backend can still be matched to the mission. The handler for
    // 'cancelling' missions (below) treats any terminal message as implicit
    // cancel confirmation, so clearing these prematurely caused the mission to
    // stay in 'cancelling' until the client-side timeout (#5476).
    lastStreamTimestamp.current.delete(missionId)

    // Try WebSocket first (fastest path when connected)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        id: `cancel-${Date.now()}`,
        type: 'cancel_chat',
        payload: { sessionId: missionId } }))
    } else {
      // HTTP fallback — WS may be disconnected during long agent runs.
      // Use the response body to determine if cancellation succeeded (#5477).
      agentFetch(`${LOCAL_AGENT_HTTP_URL}/cancel-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ sessionId: missionId }) }).then(async response => {
        // #7303 — Guard against post-unmount finalization from HTTP fallback
        if (unmountedRef.current) return
        if (response.ok) {
          // Check the `cancelled` flag in the response body — HTTP 200 alone
          // does not guarantee the session was actually cancelled (e.g. if the
          // session was already finished or the ID was invalid).
          try {
            const body = await response.json() as { cancelled?: boolean; message?: string }
            if (body.cancelled === false) {
              finalizeCancellation(missionId, body.message || 'Mission cancellation failed — backend indicated the session was not cancelled.')
              return
            }
          } catch {
            // Body parsing failed — treat HTTP 200 as success (best effort)
          }
          finalizeCancellation(missionId, 'Mission cancelled by user.')
        } else {
          finalizeCancellation(missionId, 'Mission cancellation failed — backend returned an error. The mission may still be running.')
        }
      }).catch(() => {
        // #7303 — Guard against post-unmount finalization
        if (unmountedRef.current) return
        // Both WS and HTTP failed — finalize with a warning
        finalizeCancellation(missionId, 'Mission cancelled by user (backend unreachable — cancellation may not have taken effect).')
      })
    }

    // Transition to 'cancelling' immediately for visual feedback
    setMissions(prev => prev.map(m =>
      m.id === missionId ? {
        ...m,
        status: 'cancelling',
        currentStep: 'Cancelling mission...',
        updatedAt: new Date(),
        messages: [
          ...m.messages,
          {
            id: generateMessageId(),
            role: 'system',
            content: 'Cancellation requested — waiting for backend confirmation...',
            timestamp: new Date() }
        ]
      } : m
    ))

    // Safety-net timeout: if the backend never acknowledges, finalize after CANCEL_ACK_TIMEOUT_MS
    // Clear any existing timeout for this mission first to prevent duplicate finalization
    const existingTimeout = cancelTimeouts.current.get(missionId)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }
    const timeoutHandle = setTimeout(() => {
      cancelTimeouts.current.delete(missionId)
      finalizeCancellation(missionId, 'Mission cancelled by user (backend did not confirm cancellation in time).')
    }, CANCEL_ACK_TIMEOUT_MS)
    cancelTimeouts.current.set(missionId, timeoutHandle)
  }

  // Send a follow-up message
  const sendMessage = (missionId: string, content: string) => {
    // Detect stop/cancel keywords — treat as a cancel action
    const STOP_KEYWORDS = ['stop', 'cancel', 'abort', 'halt', 'quit']
    const isStopCommand = STOP_KEYWORDS.some(kw => content.trim().toLowerCase() === kw)
    if (isStopCommand) {
      cancelMission(missionId)
      return
    }

    // Prevent sending while mission is already running or cancelling (#5478).
    // Only stop commands (handled above) are allowed during active execution.
    const currentMission = missionsRef.current.find(m => m.id === missionId)
    if (currentMission && (currentMission.status === 'running' || currentMission.status === 'cancelling')) {
      return
    }
    // Blocked missions are waiting on preflight resolution (missing
    // credentials, RBAC failures, etc.). New input must not bypass that
    // validation — the user has to call retryPreflight after fixing the
    // underlying issue, which will move the mission to 'running' first
    // (#5934). Silently dropping the send here is safe because the UI
    // already disables the input in the blocked state.
    if (currentMission && currentMission.status === 'blocked') {
      return
    }

    // Track token usage for this specific mission (#6016 — keyed by
    // missionId so concurrent missions get independent attribution).
    setActiveTokenCategory(missionId, 'missions')

    setMissions(prev => prev.map(m => {
      if (m.id !== missionId) return m
      // #10525 — When retrying a failed mission, strip stale agent-disconnect
      // error messages so the user doesn't see the old error alongside the new
      // attempt. Only filter when the mission was previously failed.
      const baseMessages = m.status === 'failed'
        ? (m.messages || []).filter(msg => !isStaleAgentErrorMessage(msg))
        : (m.messages || [])
      return {
        ...m,
        status: 'running',
        currentStep: 'Processing...',
        updatedAt: new Date(),
        messages: [
          ...baseMessages,
          {
            id: generateMessageId(),
            role: 'user',
            content,
            timestamp: new Date() }
        ]
      }
    }))

    ensureConnection().then(() => {
      const requestId = generateRequestId()
      pendingRequests.current.set(requestId, missionId)

      // Read from missionsRef to get the latest state including the message
      // we just appended via setMissions above (React state updates are async,
      // so the `missions` closure would be stale here). (#3322)
      const mission = missionsRef.current.find(m => m.id === missionId)
      const history = mission?.messages
        .filter(msg => msg.role === 'user' || msg.role === 'assistant')
        .map(msg => ({
          role: msg.role,
          content: msg.content })) || []

      // If the ref hasn't yet reflected the setMissions update, ensure the
      // current user message is still included in the history payload.
      const lastHistoryContent = history.length > 0 ? history[history.length - 1].content : null
      if (lastHistoryContent !== content) {
        history.push({ role: 'user', content })
      }

      wsSend(JSON.stringify({
        id: requestId,
        type: 'chat',
        payload: {
          prompt: content,
          sessionId: missionId,
          agent: selectedAgentRef.current || undefined,
          history: history, // Include conversation history for context
        }
      }), () => {
        setMissions(prev => prev.map(m =>
          m.id === missionId ? { ...m, status: 'failed', currentStep: 'WebSocket connection lost' } : m
        ))
      })
    }).catch(() => {
      setMissions(prev => prev.map(m =>
        m.id === missionId ? {
          ...m,
          status: 'failed',
          currentStep: undefined,
          messages: [
            ...m.messages,
            {
              id: generateMessageId(),
              role: 'system',
              content: 'Lost connection to local agent. Please ensure the agent is running and try again.',
              timestamp: new Date() }
          ]
        } : m
      ))
    })
  }

  // Edit and resend: remove a user message and everything after it,
  // returning the original content so the UI can populate the input (#10450).
  const editAndResend = (missionId: string, messageId: string): string | null => {
    let removedContent: string | null = null
    setMissions(prev => prev.map(m => {
      if (m.id !== missionId) return m
      const msgIndex = m.messages.findIndex(msg => msg.id === messageId)
      if (msgIndex < 0) return m
      const targetMsg = m.messages[msgIndex]
      if (targetMsg.role !== 'user') return m
      removedContent = targetMsg.content
      return {
        ...m,
        // Truncate from the edited message onward
        messages: m.messages.slice(0, msgIndex),
        // Reset status so the user can re-send
        status: m.status === 'running' || m.status === 'cancelling' ? m.status : 'waiting_input' as MissionStatus,
        updatedAt: new Date(),
      }
    }))
    return removedContent
  }

  // Dismiss/remove a mission from the list
  const dismissMission = (missionId: string) => {
    // Cancel backend execution before removing from UI to prevent
    // invisible continued operations after dismiss (#5816)
    cancelMission(missionId)
    // Clean up pending requests to prevent WS events from triggering
    // setMissions re-renders for a mission that no longer exists (#5835)
    for (const [reqId, mId] of pendingRequests.current.entries()) {
      if (mId === missionId) pendingRequests.current.delete(reqId)
    }
    lastStreamTimestamp.current.delete(missionId)
    // #6410 — mission is being removed from UI; drop per-mission tracking.
    streamSplitCounter.current.delete(missionId)
    toolsInFlight.current.delete(missionId)
    // #7106 — Clear status-update timers to prevent stale mutations
    clearMissionStatusTimers(missionId)
    setMissions(prev => prev.filter(m => m.id !== missionId))
    if (activeMissionId === missionId) {
      setActiveMissionId(null)
    }
  }

  // Rename a mission's display title
  const renameMission = (missionId: string, newTitle: string) => {
    const trimmed = newTitle.trim()
    if (!trimmed) return
    setMissions(prev => prev.map(m => {
      if (m.id === missionId) {
        return { ...m, title: trimmed, updatedAt: new Date() }
      }
      return m
    }))
  }

  // Update a saved mission's description and/or steps before running
  const updateSavedMission = (missionId: string, updates: SavedMissionUpdates) => {
    setMissions(prev => prev.map(m => {
      if (m.id !== missionId || m.status !== 'saved') return m
      const next = { ...m, updatedAt: new Date() }
      if (updates.description !== undefined) {
        next.description = updates.description
        if (next.importedFrom) {
          next.importedFrom = { ...next.importedFrom, description: updates.description }
        }
      }
      if (updates.steps !== undefined && next.importedFrom) {
        next.importedFrom = { ...next.importedFrom, steps: updates.steps }
      }
      if ('cluster' in updates) {
        next.cluster = updates.cluster || undefined
      }
      return next
    }))
  }

  // Rate a mission (thumbs up/down feedback)
  const rateMission = (missionId: string, feedback: MissionFeedback) => {
    setMissions(prev => prev.map(m => {
      if (m.id === missionId) {
        emitMissionRated(m.type, feedback || 'neutral')
        return { ...m, feedback, updatedAt: new Date() }
      }
      return m
    }))
  }

  // Set active mission
  const setActiveMission = (missionId: string | null) => {
    setActiveMissionId(missionId)
    if (missionId) {
      setIsSidebarOpen(true)
      // Mark as read when viewing
      setUnreadMissionIds(prev => {
        if (prev.has(missionId)) {
          const next = new Set(prev)
          next.delete(missionId)
          return next
        }
        return prev
      })
    }
  }

  // Mark a specific mission as read
  const markMissionAsRead = (missionId: string) => {
    setUnreadMissionIds(prev => {
      if (prev.has(missionId)) {
        const next = new Set(prev)
        next.delete(missionId)
        return next
      }
      return prev
    })
  }

  // Special value for "no AI agent" — agent data only, no AI processing
  const NONE_AGENT = 'none'

  // #7308 — Track the pending selectAgent connection to prevent concurrent
  // handshakes when the user rapidly swaps agents.
  const selectAgentPending = useRef<string | null>(null)

  // Select an AI agent
  const selectAgent = (agentName: string) => {
    // Persist immediately so the choice survives page refresh
    localStorage.setItem(SELECTED_AGENT_KEY, agentName)
    setSelectedAgent(agentName)
    // Skip WebSocket message for 'none' — no backend agent to select
    if (agentName === NONE_AGENT) return
    // #7308 — If a previous selectAgent call is still connecting, skip
    // this one. The latest agent name is already persisted above and will
    // be sent on the next explicit action.
    if (selectAgentPending.current !== null) {
      selectAgentPending.current = agentName
      return
    }
    selectAgentPending.current = agentName
    ensureConnection().then(() => {
      const agentToSend = selectAgentPending.current ?? agentName
      selectAgentPending.current = null
      wsSend(JSON.stringify({
        id: `select-agent-${Date.now()}`,
        type: 'select_agent',
        payload: { agent: agentToSend }
      }), () => {
        console.error('[Missions] Failed to send agent selection after retries')
      })
    }).catch((err: unknown) => {
      selectAgentPending.current = null
      console.error('[Missions] Failed to select agent:', err)
    })
  }

  // Connect to agent (for AgentSelector in navbar)
  const connectToAgent = () => {
    // #7075 — Reset the reconnect counter on explicit user-initiated
    // connection requests (e.g. clicking "Reconnect" after giveup).
    // Moved from ensureConnection so auto-reconnect preserves backoff.
    wsReconnectAttempts.current = 0
    ensureConnection().catch((err: unknown) => {
      console.error('[Missions] Failed to connect to agent:', err)
    })
  }

  // Sidebar controls
  const toggleSidebar = () => setIsSidebarOpen(prev => !prev)
  const openSidebar = () => {
    setIsSidebarOpen(true)
    setIsSidebarMinimized(false) // Expand when opening
  }
  const closeSidebar = () => {
    setIsSidebarOpen(false)
    setIsFullScreen(false) // Exit fullscreen when closing
  }
  const minimizeSidebar = () => setIsSidebarMinimized(true)
  const expandSidebar = () => setIsSidebarMinimized(false)

  // Fullscreen controls
  const handleSetFullScreen = (fullScreen: boolean) => {
    setIsFullScreen(fullScreen)
  }

  // Get active mission object
  const activeMission = missions.find(m => m.id === activeMissionId) || null

  // Cleanup on unmount — close WebSocket, cancel pending reconnection timer (#3318),
  // and clear any pending cancel acknowledgment timeouts
  useEffect(() => {
    const cancelTimeoutsRef = cancelTimeouts.current
    const cancelIntentsRef = cancelIntents.current
    const pendingRequestsRef = pendingRequests.current
    const toolsInFlightRef = toolsInFlight.current
    const lastStreamTimestampRef = lastStreamTimestamp.current
    const streamSplitCounterRef = streamSplitCounter.current
    const waitingInputTimeoutsRef = waitingInputTimeouts.current
    const wsSendRetryTimersRef = wsSendRetryTimers.current
    const missionStatusTimersRef = missionStatusTimers.current
    return () => {
      // #6667 — Mark provider as unmounted BEFORE clearing timers, so any
      // in-flight async callback that races cleanup sees this flag and
      // bails without touching React state.
      unmountedRef.current = true
      if (wsReconnectTimer.current) {
        clearTimeout(wsReconnectTimer.current)
        wsReconnectTimer.current = null
      }
      // #6629 — Cancel any in-flight wsSend retry timers so they don't
      // fire on an unmounted provider or touch a dying socket.
      for (const handle of wsSendRetryTimersRef) {
        clearTimeout(handle)
      }
      wsSendRetryTimersRef.clear()
      // Clear all cancel acknowledgment timeouts
      for (const timeout of cancelTimeoutsRef.values()) {
        clearTimeout(timeout)
      }
      cancelTimeoutsRef.clear()
      // Clear any lingering cancel intents (#6370)
      cancelIntentsRef.clear()
      // #6377 — drop pendingRequests so closures over the handler don't
      // pin mission IDs after the provider unmounts. Without this, mounting
      // and unmounting the provider in tests or Storybook leaks a growing
      // Map keyed by stale request IDs.
      pendingRequestsRef.clear()
      toolsInFlightRef.clear()
      lastStreamTimestampRef.clear()
      streamSplitCounterRef.clear()
      // Clear waiting_input watchdogs so they don't fire after unmount
      for (const t of waitingInputTimeoutsRef.values()) {
        clearTimeout(t)
      }
      waitingInputTimeoutsRef.clear()
      // #7106 — Clear all per-mission status-update timers
      for (const timers of missionStatusTimersRef.values()) {
        for (const handle of timers) {
          clearTimeout(handle)
        }
      }
      missionStatusTimersRef.clear()
      // #6410 — nullify handlers BEFORE close(). `onclose` is what schedules
      // reconnection (see `wsReconnectTimer.current = setTimeout(...)` in
      // ensureConnection); if we don't detach it, an unmounted provider can
      // still enqueue reconnect attempts after tear-down. Detach the other
      // handlers too so late events from the dying socket can't touch state
      // on an unmounted component.
      const dyingWs = wsRef.current
      if (dyingWs) {
        dyingWs.onopen = null
        dyingWs.onmessage = null
        dyingWs.onerror = null
        dyingWs.onclose = null
        dyingWs.close()
      }
    }
  }, [])

  // (#6455, #7087/#7094/#7100/#7101) Confirm or cancel the front of the
  // pending review queue. confirmPendingReview now reuses the pre-generated
  // missionId so the caller's reference stays valid.
  const confirmPendingReview = (editedPrompt: string) => {
    const front = pendingReviewQueue[0]
    if (!front) return
    // Dequeue the front entry
    setPendingReviewQueue(prev => prev.slice(1))
    // Reuse the pre-generated missionId — callers already hold this ID.
    // Pass skipReview: true and inject the pre-generated ID via context so
    // startMission uses it instead of generating a new one.
    const params: StartMissionParams = {
      ...front.params,
      initialPrompt: editedPrompt,
      skipReview: true,
      context: { ...front.params.context, __preGeneratedMissionId: front.missionId },
    }
    startMission(params)
  }
  const cancelPendingReview = () => {
    // #7087/#7101 — Discard only the front entry, not the entire queue
    setPendingReviewQueue(prev => prev.slice(1))
  }

  // #6730 — Memoize the context value so consumers of MissionContext don't
  // re-render on every render of MissionProvider. Prior to this fix, the
  // inline object literal created a fresh reference on every parent render,
  // which cascaded through every component that reads the context (the
  // MissionSidebar layout, every card that queries `activeMission`, the
  // global header, etc.) and caused visible jank on sidebar toggle and
  // during message streaming (#6737 reproduced as a side effect).
  //
  // The mutation handlers (startMission, sendMessage, toggleSidebar, …) are
  // plain function declarations inside this component, so they're recreated
  // on every render. Rather than convert all ~20 of them to useCallback
  // (which also doesn't help unless their own deps are stable), we stash
  // them in a ref and expose stable proxy functions that forward to the
  // latest implementation. The proxies themselves have identity lifetime
  // equal to the provider, so the memo below only invalidates when real
  // state changes.
  const handlersRef = useRef({
    startMission, saveMission, runSavedMission, updateSavedMission, sendMessage,
    editAndResend, retryPreflight, cancelMission, dismissMission, renameMission, rateMission,
    setActiveMission, markMissionAsRead, selectAgent, connectToAgent,
    toggleSidebar, openSidebar, closeSidebar, minimizeSidebar, expandSidebar,
    handleSetFullScreen, confirmPendingReview, cancelPendingReview })
  handlersRef.current = {
    startMission, saveMission, runSavedMission, updateSavedMission, sendMessage,
    editAndResend, retryPreflight, cancelMission, dismissMission, renameMission, rateMission,
    setActiveMission, markMissionAsRead, selectAgent, connectToAgent,
    toggleSidebar, openSidebar, closeSidebar, minimizeSidebar, expandSidebar,
    handleSetFullScreen, confirmPendingReview, cancelPendingReview }
  // Stable proxies. Created once via useMemo with an empty dep array; every
  // call forwards to the currently-live handler on `handlersRef.current`.
  const stableHandlers = useMemo(() => ({
    startMission: (...args: Parameters<typeof startMission>) =>
      handlersRef.current.startMission(...args),
    saveMission: (...args: Parameters<typeof saveMission>) =>
      handlersRef.current.saveMission(...args),
    runSavedMission: (...args: Parameters<typeof runSavedMission>) =>
      handlersRef.current.runSavedMission(...args),
    updateSavedMission: (...args: Parameters<typeof updateSavedMission>) =>
      handlersRef.current.updateSavedMission(...args),
    sendMessage: (...args: Parameters<typeof sendMessage>) =>
      handlersRef.current.sendMessage(...args),
    editAndResend: (...args: Parameters<typeof editAndResend>) =>
      handlersRef.current.editAndResend(...args),
    retryPreflight: (...args: Parameters<typeof retryPreflight>) =>
      handlersRef.current.retryPreflight(...args),
    cancelMission: (...args: Parameters<typeof cancelMission>) =>
      handlersRef.current.cancelMission(...args),
    dismissMission: (...args: Parameters<typeof dismissMission>) =>
      handlersRef.current.dismissMission(...args),
    renameMission: (...args: Parameters<typeof renameMission>) =>
      handlersRef.current.renameMission(...args),
    rateMission: (...args: Parameters<typeof rateMission>) =>
      handlersRef.current.rateMission(...args),
    setActiveMission: (...args: Parameters<typeof setActiveMission>) =>
      handlersRef.current.setActiveMission(...args),
    markMissionAsRead: (...args: Parameters<typeof markMissionAsRead>) =>
      handlersRef.current.markMissionAsRead(...args),
    selectAgent: (...args: Parameters<typeof selectAgent>) =>
      handlersRef.current.selectAgent(...args),
    connectToAgent: (...args: Parameters<typeof connectToAgent>) =>
      handlersRef.current.connectToAgent(...args),
    toggleSidebar: () => handlersRef.current.toggleSidebar(),
    openSidebar: () => handlersRef.current.openSidebar(),
    closeSidebar: () => handlersRef.current.closeSidebar(),
    minimizeSidebar: () => handlersRef.current.minimizeSidebar(),
    expandSidebar: () => handlersRef.current.expandSidebar(),
    setFullScreen: (fullScreen: boolean) =>
      handlersRef.current.handleSetFullScreen(fullScreen),
    confirmPendingReview: (editedPrompt: string) =>
      handlersRef.current.confirmPendingReview(editedPrompt),
    cancelPendingReview: () =>
      handlersRef.current.cancelPendingReview(),
  }), [])

  const contextValue = useMemo(() => ({
    missions,
    activeMission,
    isSidebarOpen,
    isSidebarMinimized,
    isFullScreen,
    unreadMissionCount: unreadMissionIds.size,
    unreadMissionIds,
    agents,
    selectedAgent,
    defaultAgent,
    agentsLoading,
    isAIDisabled: selectedAgent === 'none' || !selectedAgent,
    // #7087/#7101 — Expose the front of the queue as pendingReview for
    // backward-compatible consumers, plus the full queue.
    pendingReview: pendingReviewQueue[0] ?? null,
    pendingReviewQueue,
    ...stableHandlers,
  }), [
    missions,
    activeMission,
    isSidebarOpen,
    isSidebarMinimized,
    isFullScreen,
    unreadMissionIds,
    agents,
    selectedAgent,
    defaultAgent,
    agentsLoading,
    pendingReviewQueue,
    stableHandlers,
  ])

  return (
    <MissionContext.Provider value={contextValue}>
      {children}
      {/* #7087/#7101 — Global prompt-review dialog: shows the front of the
          pending review queue. When confirmed/cancelled, the next entry in
          the queue (if any) is shown automatically. */}
      {pendingReviewQueue.length > 0 && (
        <ConfirmMissionPromptDialog
          open={pendingReviewQueue.length > 0}
          missionTitle={pendingReviewQueue[0].params.title}
          missionDescription={pendingReviewQueue[0].params.description}
          initialPrompt={pendingReviewQueue[0].params.initialPrompt}
          onCancel={cancelPendingReview}
          onConfirm={confirmPendingReview}
        />
      )}
    </MissionContext.Provider>
  )
}
