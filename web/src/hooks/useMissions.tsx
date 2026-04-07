import { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react'
import type { AgentInfo, AgentsListPayload, AgentSelectedPayload, ChatStreamPayload } from '../types/agent'
import { AgentCapabilityToolExec } from '../types/agent'
import { getDemoMode } from './useDemoMode'
import { addCategoryTokens, setActiveTokenCategory } from './useTokenUsage'
import { detectIssueSignature, findSimilarResolutionsStandalone, generateResolutionPromptContext } from './useResolutions'
import { LOCAL_AGENT_WS_URL, LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { emitMissionStarted, emitMissionCompleted, emitMissionError, emitMissionRated } from '../lib/analytics'
import { scanForMaliciousContent } from '../lib/missions/scanner/malicious'
import { runPreflightCheck, type PreflightError } from '../lib/missions/preflightCheck'
import { kubectlProxy } from '../lib/kubectlProxy'

export type MissionStatus = 'pending' | 'running' | 'waiting_input' | 'completed' | 'failed' | 'saved' | 'blocked' | 'cancelling'

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
  preflightError?: PreflightError
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

interface MissionContextValue {
  missions: Mission[]
  activeMission: Mission | null
  isSidebarOpen: boolean
  isSidebarMinimized: boolean
  isFullScreen: boolean
  /** Number of missions with unread updates */
  unreadMissionCount: number
  /** IDs of missions with unread updates */
  unreadMissionIds: Set<string>
  /** Available AI agents */
  agents: AgentInfo[]
  /** Currently selected agent */
  selectedAgent: string | null
  /** Default agent */
  defaultAgent: string | null
  /** Whether agents are loading */
  agentsLoading: boolean
  /** Whether AI is disabled (user selected 'none' or no agent) */
  isAIDisabled: boolean

  // Actions
  startMission: (params: StartMissionParams) => string
  saveMission: (params: SaveMissionParams) => string
  runSavedMission: (missionId: string, cluster?: string) => void
  updateSavedMission: (missionId: string, updates: SavedMissionUpdates) => void
  sendMessage: (missionId: string, content: string) => void
  retryPreflight: (missionId: string) => void
  cancelMission: (missionId: string) => void
  dismissMission: (missionId: string) => void
  renameMission: (missionId: string, newTitle: string) => void
  rateMission: (missionId: string, feedback: MissionFeedback) => void
  setActiveMission: (missionId: string | null) => void
  markMissionAsRead: (missionId: string) => void
  selectAgent: (agentName: string) => void
  connectToAgent: () => void
  toggleSidebar: () => void
  openSidebar: () => void
  closeSidebar: () => void
  minimizeSidebar: () => void
  expandSidebar: () => void
  setFullScreen: (isFullScreen: boolean) => void
}

interface StartMissionParams {
  title: string
  description: string
  type: Mission['type']
  cluster?: string
  initialPrompt: string
  context?: Record<string, unknown>
  /** When true, injects --dry-run=server instructions into the prompt */
  dryRun?: boolean
}

interface SaveMissionParams {
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

const MissionContext = createContext<MissionContextValue | null>(null)

const MISSIONS_STORAGE_KEY = 'kc_missions'
const UNREAD_MISSIONS_KEY = 'kc_unread_missions'
const SELECTED_AGENT_KEY = 'kc_selected_agent'

/** Delay before auto-reconnecting interrupted missions after WS opens */
const MISSION_RECONNECT_DELAY_MS = 500
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

// Load missions from localStorage
function loadMissions(): Mission[] {
  try {
    const stored = localStorage.getItem(MISSIONS_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Convert date strings back to Date objects
      // Mark running missions for auto-reconnection instead of failing them
      return parsed.map((m: Mission) => {
        const mission = {
          ...m,
          createdAt: new Date(m.createdAt),
          updatedAt: new Date(m.updatedAt),
          messages: m.messages.map(msg => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
        }
        // Mark running missions for reconnection - they'll be resumed when WS connects
        if (mission.status === 'running') {
          return {
            ...mission,
            currentStep: 'Reconnecting...',
            context: { ...mission.context, needsReconnect: true }
          }
        }
        // Missions stuck in 'cancelling' after a page reload should be finalized
        if (mission.status === 'cancelling') {
          return {
            ...mission,
            status: 'failed',
            currentStep: undefined,
            messages: [
              ...mission.messages,
              {
                id: `msg-${Date.now()}`,
                role: 'system' as const,
                content: 'Mission cancelled by user (page was reloaded during cancellation).',
                timestamp: new Date() }
            ]
          }
        }
        return mission
      })
    }
  } catch (e) {
    console.error('Failed to load missions from localStorage:', e)
  }
  return []
}

// Maximum number of completed/failed missions to retain when pruning for quota.
// Active (pending/running/waiting_input) and saved (library) missions are always kept.
const MAX_COMPLETED_MISSIONS = 50

// Save missions to localStorage, pruning old completed/failed missions if quota is exceeded
function saveMissions(missions: Mission[]) {
  try {
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))
  } catch (e) {
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
      // Only prune completed/failed missions by age
      const completedOrFailed = missions
        .filter(m => m.status === 'completed' || m.status === 'failed')
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, MAX_COMPLETED_MISSIONS)
      const pruned = [...active, ...saved, ...completedOrFailed]
      try {
        localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(pruned))
        return
      } catch (retryError) {
        // Still too large — clear missions storage as last resort
        console.error('[Missions] localStorage still full after pruning, clearing missions', retryError)
        localStorage.removeItem(MISSIONS_STORAGE_KEY)
      }
    } else {
      console.error('Failed to save missions to localStorage:', e)
    }
  }
}

// Load unread mission IDs from localStorage
function loadUnreadMissionIds(): Set<string> {
  try {
    const stored = localStorage.getItem(UNREAD_MISSIONS_KEY)
    if (stored) {
      return new Set(JSON.parse(stored))
    }
  } catch (e) {
    console.error('Failed to load unread missions from localStorage:', e)
  }
  return new Set()
}

// Save unread mission IDs to localStorage
function saveUnreadMissionIds(ids: Set<string>) {
  try {
    localStorage.setItem(UNREAD_MISSIONS_KEY, JSON.stringify([...ids]))
  } catch (e) {
    console.error('Failed to save unread missions to localStorage:', e)
  }
}

export function MissionProvider({ children }: { children: ReactNode }) {
  const [missions, setMissions] = useState<Mission[]>(() => loadMissions())
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [unreadMissionIds, setUnreadMissionIds] = useState<Set<string>>(() => loadUnreadMissionIds())

  // Agent state
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [defaultAgent, setDefaultAgent] = useState<string | null>(null)
  const [agentsLoading, setAgentsLoading] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const pendingRequests = useRef<Map<string, string>>(new Map()) // requestId -> missionId
  // Track last stream timestamp per mission to detect tool-use gaps (for creating new chat bubbles)
  const lastStreamTimestamp = useRef<Map<string, number>>(new Map()) // missionId -> timestamp
  // Track cancel acknowledgment timeouts — missionId -> timeout handle
  const cancelTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  // Ref to always hold the latest missions state — avoids stale closure in sendMessage (#3322)
  const missionsRef = useRef<Mission[]>(missions)
  missionsRef.current = missions
  // Refs to always hold the latest activeMissionId and isSidebarOpen — avoids stale closures in markMissionAsUnread
  const activeMissionIdRef = useRef(activeMissionId)
  activeMissionIdRef.current = activeMissionId
  const isSidebarOpenRef = useRef(isSidebarOpen)
  isSidebarOpenRef.current = isSidebarOpen
  // Refs to always hold the latest selectedAgent and defaultAgent — avoids stale closures in startMission/executeMission (#4228)
  const selectedAgentRef = useRef(selectedAgent)
  selectedAgentRef.current = selectedAgent
  const defaultAgentRef = useRef(defaultAgent)
  defaultAgentRef.current = defaultAgent
  // Ref to always hold the latest handleAgentMessage — avoids reconnecting WebSocket when the handler changes
  const handleAgentMessageRef = useRef<(message: { id: string; type: string; payload?: unknown }) => void>(() => {})
  // Ref to track pending WebSocket reconnection timeout so it can be cleared on unmount (#3318)
  const wsReconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Tracks consecutive reconnection attempts for exponential backoff (#3870)
  const wsReconnectAttempts = useRef(0)
  const STREAM_GAP_THRESHOLD_MS = 8000 // If >8s gap between stream chunks, create new message bubble (tool-use gap)

  // Maximum number of WebSocket send retries before giving up
  const WS_SEND_MAX_RETRIES = 3
  // Delay between WebSocket send retries in milliseconds
  const WS_SEND_RETRY_DELAY_MS = 1000

  /**
   * Send a message over the WebSocket with retry logic.
   * Makes one immediate attempt, then retries up to WS_SEND_MAX_RETRIES
   * additional times with WS_SEND_RETRY_DELAY_MS between attempts.
   * Calls onFailure (if provided) when all retries are exhausted.
   */
  const wsSend = (data: string, onFailure?: () => void): void => {
    let retries = 0
    const trySend = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(data)
        return
      }
      if (retries < WS_SEND_MAX_RETRIES) {
        retries++
        setTimeout(trySend, WS_SEND_RETRY_DELAY_MS)
      } else {
        console.error('[Missions] WebSocket send failed after retries — socket not open')
        onFailure?.()
      }
    }
    trySend()
  }

  // Save missions whenever they change
  useEffect(() => {
    saveMissions(missions)
  }, [missions])

  // Save unread IDs whenever they change
  useEffect(() => {
    saveUnreadMissionIds(unreadMissionIds)
  }, [unreadMissionIds])

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
          const isInactive = !!lastStreamTs && (now - lastStreamTs) > MISSION_INACTIVITY_TIMEOUT_MS
          const isTimedOut = elapsed > MISSION_TIMEOUT_MS

          if (!isTimedOut && !isInactive) return m

          // Clean up pending request and stream tracker for this mission
          for (const [reqId, mId] of pendingRequests.current.entries()) {
            if (mId === m.id) pendingRequests.current.delete(reqId)
          }
          lastStreamTimestamp.current.delete(m.id)

          emitMissionError(m.type, isInactive ? 'mission_inactivity' : 'mission_timeout')

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
        wsRef.current = new WebSocket(LOCAL_AGENT_WS_URL)

        wsRef.current.onopen = () => {
          clearTimeout(timeout)
          // Reset reconnection backoff on successful connection (#3870)
          wsReconnectAttempts.current = 0
          // Fetch available agents on connect
          fetchAgents()

          // Auto-reconnect interrupted missions (#2379)
          // Collect missions that need reconnection via a ref so the side
          // effect (WebSocket sends) happens OUTSIDE the state updater.
          // React StrictMode may invoke state updaters twice, which would
          // cause duplicate reconnection requests if the send lived inside.
          const missionsToReconnect: Mission[] = []

          setMissions(prev => {
            const candidates = prev.filter(m =>
              m.status === 'running' && m.context?.needsReconnect
            )

            if (candidates.length > 0) {
              // Snapshot missions for the side effect scheduled below
              missionsToReconnect.push(...candidates)

              // Clear the needsReconnect flag and update step (pure state update)
              return prev.map(m =>
                m.context?.needsReconnect
                  ? {
                      ...m,
                      currentStep: 'Resuming...',
                      context: { ...m.context, needsReconnect: false }
                    }
                  : m
              )
            }
            return prev
          })

          // Side effect: schedule reconnection OUTSIDE the state updater
          if (missionsToReconnect.length > 0) {
            setTimeout(() => {
              missionsToReconnect.forEach(mission => {
                // Find the last user message to re-send
                const userMessages = mission.messages.filter(msg => msg.role === 'user')
                const lastUserMessage = userMessages[userMessages.length - 1]

                if (lastUserMessage && wsRef.current?.readyState === WebSocket.OPEN) {
                  // Determine which agent to use - prefer claude-code for tool execution
                  const agentToUse = mission.agent || 'claude-code'

                  const requestId = `claude-reconnect-${Date.now()}-${mission.id}`
                  pendingRequests.current.set(requestId, mission.id)

                  // Build history from all messages except system messages
                  const history = mission.messages
                    .filter(msg => msg.role === 'user' || msg.role === 'assistant')
                    .map(msg => ({
                      role: msg.role,
                      content: msg.content }))

                  const mId = mission.id
                  wsSend(JSON.stringify({
                    id: requestId,
                    type: 'chat',
                    payload: {
                      prompt: lastUserMessage.content,
                      sessionId: mId,
                      agent: agentToUse,
                      history: history }
                  }), () => {
                    setMissions(prev => prev.map(m =>
                      m.id === mId ? { ...m, status: 'failed', currentStep: 'WebSocket reconnect failed' } : m
                    ))
                  })
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
          } catch (e) {
            console.error('[Missions] Failed to parse message:', e)
          }
        }

        wsRef.current.onclose = () => {
          clearTimeout(timeout)
          wsRef.current = null
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

          // Fail any pending missions that were waiting for a response
          if (pendingRequests.current.size > 0) {
            const errorContent = `**Local Agent Not Connected**

Install the console locally with the KubeStellar Console agent to use AI missions.`

            const pendingMissionIds = new Set(pendingRequests.current.values())
            setMissions(prev => prev.map(m => {
              if (pendingMissionIds.has(m.id) && m.status === 'running') {
                return {
                  ...m,
                  status: 'failed',
                  currentStep: undefined,
                  messages: [
                    ...m.messages,
                    {
                      id: `msg-${Date.now()}-${m.id}`,
                      role: 'system',
                      content: errorContent,
                      timestamp: new Date() }
                  ]
                }
              }
              return m
            }))
            pendingRequests.current.clear()
          }
        }

        wsRef.current.onerror = () => {
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
          setAgentsLoading(false)
          reject(new Error('CONNECTION_FAILED'))
        }
      } catch (err) {
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

  // Finalize a cancelling mission — transitions from 'cancelling' to 'failed'
  // and clears any pending cancel timeout.
  const finalizeCancellation = (missionId: string, message: string) => {
    // Clear the timeout if one is pending
    const timeout = cancelTimeouts.current.get(missionId)
    if (timeout) {
      clearTimeout(timeout)
      cancelTimeouts.current.delete(missionId)
    }

    // Purge ALL pending request IDs that map to this mission so that late
    // responses (from earlier failed or in-flight requests) are dropped at
    // the lookup stage in handleAgentMessage (#4499).
    for (const [reqId, mId] of pendingRequests.current.entries()) {
      if (mId === missionId) pendingRequests.current.delete(reqId)
    }
    lastStreamTimestamp.current.delete(missionId)

    setMissions(prev => prev.map(m =>
      m.id === missionId && m.status === 'cancelling' ? {
        ...m,
        status: 'failed',
        currentStep: undefined,
        updatedAt: new Date(),
        messages: [
          ...m.messages,
          {
            id: `msg-${Date.now()}`,
            role: 'system',
            content: message,
            timestamp: new Date() }
        ]
      } : m
    ))
  }

  // Handle messages from the agent
  const handleAgentMessage = (message: { id: string; type: string; payload?: unknown }) => {
    // Handle agent-related messages (no mission ID needed)
    if (message.type === 'agents_list') {
      const payload = message.payload as AgentsListPayload
      setAgents(payload.agents)
      setDefaultAgent(payload.defaultAgent)
      // Prefer persisted selection if the agent is still available.
      // If persisted is 'none' but an agent IS available, auto-select it
      // so AI mode is on by default when the agent is present.
      const persisted = localStorage.getItem(SELECTED_AGENT_KEY)
      const hasAvailableAgent = payload.agents.some(a => a.available)
      const persistedAvailable = persisted && persisted !== 'none' && payload.agents.some(a => a.name === persisted && a.available)

      // When auto-selecting, prefer agents that execute commands directly over
      // agents that only suggest commands (e.g. copilot-cli). This prevents
      // missions from returning kubectl commands as text instead of running them (#3609).
      const SUGGEST_ONLY_AGENTS = new Set(['copilot-cli', 'gh-copilot'])
      const bestAvailable = hasAvailableAgent
        ? (payload.agents.find(a => a.available && ((a.capabilities ?? 0) & AgentCapabilityToolExec) !== 0 && !SUGGEST_ONLY_AGENTS.has(a.name))?.name
          || payload.agents.find(a => a.available && !SUGGEST_ONLY_AGENTS.has(a.name))?.name
          || payload.agents.find(a => a.available)?.name
          || null)
        : null
      const resolved = persistedAvailable ? persisted : (payload.selected || payload.defaultAgent || bestAvailable)
      setSelectedAgent(resolved)
      // If we restored a persisted agent that differs from the server's selection, tell the server
      if (persistedAvailable && persisted !== payload.selected && wsRef.current?.readyState === WebSocket.OPEN) {
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
    if (message.type === 'cancel_ack' || message.type === 'cancel_confirmed') {
      const payload = message.payload as { sessionId?: string; success?: boolean; message?: string }
      const cancelledMissionId = payload.sessionId
      if (cancelledMissionId) {
        if (payload.success === false) {
          finalizeCancellation(cancelledMissionId, payload.message || 'Mission cancellation failed — the backend reported an error.')
        } else {
          finalizeCancellation(cancelledMissionId, 'Mission cancelled by user.')
        }
      }
      return
    }

    const missionId = pendingRequests.current.get(message.id)
    if (!missionId) return

    setMissions(prev => prev.map(m => {
      if (m.id !== missionId) return m

      // Discard messages for missions that have already reached a terminal state
      // (failed, completed). This prevents stale responses from a previously
      // failed request from overwriting state after cancellation (#4499).
      if (m.status === 'failed' || m.status === 'completed') {
        pendingRequests.current.delete(message.id)
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
        // Track token delta for category usage
        if (payload.tokens?.total) {
          const previousTotal = m.tokenUsage?.total ?? 0
          const delta = payload.tokens.total - previousTotal
          if (delta > 0) {
            addCategoryTokens(delta, 'missions')
          }
        }
        return {
          ...m,
          currentStep: payload.step || m.currentStep,
          progress: payload.progress ?? m.progress,
          tokenUsage: payload.tokens ? {
            input: payload.tokens.input ?? m.tokenUsage?.input ?? 0,
            output: payload.tokens.output ?? m.tokenUsage?.output ?? 0,
            total: payload.tokens.total ?? m.tokenUsage?.total ?? 0 } : m.tokenUsage,
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

        if (lastMsg?.role === 'assistant' && !payload.done && m.status === 'running' && !hasGap) {
          // Append to existing assistant message mid-stream (no gap detected)
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
          // First chunk OR gap detected - create new assistant message
          return {
            ...m,
            status: 'running' as MissionStatus,
            currentStep: 'Generating response...',
            updatedAt: new Date(),
            agent: payload.agent || m.agent,
            messages: [
              ...m.messages,
              {
                id: `msg-${Date.now()}`,
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

          // Clear active token tracking
          setActiveTokenCategory(null)
          if (m.status === 'running') {
            emitMissionCompleted(m.type, Math.round((Date.now() - m.createdAt.getTime()) / 1000))
          }
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

        // Clear active token tracking and emit completion event
        setActiveTokenCategory(null)
        if (m.status === 'running') {
          emitMissionCompleted(m.type, Math.round((Date.now() - m.createdAt.getTime()) / 1000))
        }

        const resultContent = chatPayload.content || (payload as { output?: string }).output || 'Task completed.'
        // Check ALL assistant messages since the last user message for streamed content
        // (streaming may split into multiple bubbles due to tool-use gaps)
        const lastUserIdx = m.messages.map(msg => msg.role).lastIndexOf('user')
        const streamedSinceUser = m.messages
          .slice(lastUserIdx + 1)
          .filter(msg => msg.role === 'assistant')
          .map(msg => msg.content)
          .join('')
        // Skip adding result message if content was already received via streaming
        const alreadyStreamed = streamedSinceUser.length > 0 &&
          resultContent.length > 0 &&
          streamedSinceUser.startsWith(resultContent.slice(0, Math.min(resultContent.length, streamedSinceUser.length)))

        return {
          ...m,
          status: 'waiting_input' as MissionStatus,
          currentStep: undefined,
          updatedAt: new Date(),
          agent: chatPayload.agent || m.agent,
          tokenUsage,
          messages: alreadyStreamed ? m.messages : [
            ...m.messages,
            {
              id: `msg-${Date.now()}`,
              role: 'assistant' as const,
              content: resultContent,
              timestamp: new Date(),
              agent: chatPayload.agent || m.agent }
          ]
        }
      } else if (message.type === 'error') {
        const payload = message.payload as { code?: string; message?: string }
        pendingRequests.current.delete(message.id)
        emitMissionError(m.type, payload.code || 'unknown')

        // Create helpful error message based on error code
        let errorContent = payload.message || 'Unknown error'
        if (payload.code === 'no_agent' || payload.code === 'agent_unavailable') {
          errorContent = `**Mission interrupted — agent not available**\n\nThe AI agent was disconnected or is not reachable. This often happens after a page refresh.\n\n**To fix:**\n1. Make sure your agent (e.g., Claude Code, bob) is running\n2. Select the agent from the top navbar\n3. Click **Retry Mission** below to rerun your request`
        } else if (payload.code === 'authentication_error') {
          errorContent = '**Authentication Error — Agent CLI Needs Attention**\n\nThis is not a console issue. The AI agent\'s API token has expired or is invalid.\n\n**To fix:** Run `/login` in your Claude Code terminal to refresh your OAuth token, or update your API key in [Settings →](/settings).\n\nOnce re-authenticated, retry your message.'
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
          errorContent = '**Authentication Error — Agent CLI Needs Attention**\n\nThis is not a console issue. The AI agent\'s API token has expired or is invalid.\n\n**To fix:** Run `/login` in your Claude Code terminal to refresh your OAuth token, or update your API key in [Settings →](/settings).\n\nOnce re-authenticated, retry your message.'
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
              id: `msg-${Date.now()}`,
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
   * Shared prompt-enhancement pipeline: cluster targeting, dry-run injection,
   * non-interactive terminal handling, and resolution matching.
   * Used by both startMission and runSavedMission to avoid duplication (#4768).
   */
  const buildEnhancedPrompt = (params: StartMissionParams): {
    enhancedPrompt: string
    matchedResolutions: MatchedResolution[]
    isInstallMission: boolean
  } => {
    // Inject cluster targeting into the prompt sent to the agent
    let enhancedPrompt = params.initialPrompt
    if (params.cluster) {
      const clusterList = params.cluster.split(',').map(c => c.trim()).filter(Boolean)
      if (clusterList.length === 1) {
        enhancedPrompt = `Target cluster: ${clusterList[0]}\nIMPORTANT: All kubectl commands MUST use --context=${clusterList[0]}\n\n${enhancedPrompt}`
      } else {
        enhancedPrompt = `Target clusters: ${clusterList.join(', ')}\nIMPORTANT: Perform the following on each cluster using their respective kubectl contexts.\n\n${enhancedPrompt}`
      }
    }

    // Inject dry-run instructions for server-side validation without actual changes
    if (params.dryRun) {
      enhancedPrompt += '\n\nCRITICAL — DRY RUN MODE:\n' +
        'This is a DRY RUN deployment. You MUST NOT create, modify, or delete any actual resources.\n' +
        'For every kubectl apply, create, or delete command, append --dry-run=server to perform server-side validation only.\n' +
        'For every helm install or helm upgrade command, append --dry-run to simulate without installing.\n' +
        'Report what WOULD be deployed, including:\n' +
        '- Resources that would be created (with their kinds, names, and namespaces)\n' +
        '- Any validation errors the server returns\n' +
        '- Any missing prerequisites (CRDs, namespaces, RBAC)\n' +
        'Conclude with a summary: "DRY RUN COMPLETE — N resources validated, M errors found."\n'
    }

    // Remind the agent that it runs in a non-interactive terminal (no stdin).
    // This prevents commands that prompt for user input from hanging (#3767).
    const isInstallMission = params.type === 'deploy' || /install/i.test(params.title)
    if (isInstallMission) {
      enhancedPrompt += '\n\nIMPORTANT: You are running in a non-interactive terminal with NO stdin support. ' +
        'Never run commands that require interactive input (login prompts, confirmation dialogs, browser OAuth flows). ' +
        'Always use non-interactive flags (--yes, -y, --non-interactive, --no-input, --batch) or pipe "yes" where needed. ' +
        'If a step requires interactive authentication, stop and tell the user to complete it manually in their own terminal first.'
    }

    // Auto-match and inject resolution context for relevant mission types
    let matchedResolutions: MatchedResolution[] = []

    // Match resolutions for troubleshooting-related missions (not deploy/upgrade)
    if (params.type !== 'deploy' && params.type !== 'upgrade') {
      // Detect issue signature from mission content
      const content = `${params.title} ${params.description} ${params.initialPrompt}`
      const signature = detectIssueSignature(content)

      if (signature.type && signature.type !== 'Unknown') {
        // Find similar resolutions from history
        const similarResolutions = findSimilarResolutionsStandalone(
          { type: signature.type, resourceKind: signature.resourceKind, errorPattern: signature.errorPattern },
          { minSimilarity: 0.4, limit: 3 }
        )

        if (similarResolutions.length > 0) {
          // Store matched resolutions for display
          matchedResolutions = similarResolutions.map(sr => ({
            id: sr.resolution.id,
            title: sr.resolution.title,
            similarity: sr.similarity,
            source: sr.source }))

          // Inject resolution context into the prompt
          const resolutionContext = generateResolutionPromptContext(similarResolutions)
          enhancedPrompt = params.initialPrompt + resolutionContext
        }
      }
    }

    return { enhancedPrompt, matchedResolutions, isInstallMission }
  }

  /**
   * Build system messages for non-interactive mode and auto-matched resolutions.
   * Shared between startMission and runSavedMission (#4768).
   */
  const buildSystemMessages = (
    isInstallMission: boolean,
    matchedResolutions: MatchedResolution[],
  ): MissionMessage[] => {
    const messages: MissionMessage[] = []

    // Warn the user that interactive terminal input is not supported (#3767)
    if (isInstallMission) {
      messages.push({
        id: `msg-${Date.now()}-nointeractive`,
        role: 'system',
        content: '**Non-interactive mode:** This terminal does not support interactive input. ' +
          'If a tool requires browser-based login or manual confirmation, the agent will ask you to run that step in your own terminal first.',
        timestamp: new Date() })
    }

    // Add system message if resolutions were auto-matched
    if (matchedResolutions.length > 0) {
      const resolutionNames = matchedResolutions.map(r =>
        `• **${r.title}** (${Math.round(r.similarity * 100)}% match, ${r.source === 'personal' ? 'your history' : 'team knowledge'})`
      ).join('\n')

      messages.push({
        id: `msg-${Date.now()}-resolutions`,
        role: 'system',
        content: `🔍 **Found ${matchedResolutions.length} similar resolution${matchedResolutions.length > 1 ? 's' : ''} from your knowledge base:**\n\n${resolutionNames}\n\n_This context has been automatically provided to the AI to help solve the problem faster._`,
        timestamp: new Date() })
    }

    return messages
  }

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
    const preflightPromise = missionNeedsCluster
      ? runPreflightCheck(
          (args, opts) => kubectlProxy.exec(args, opts),
          params.cluster?.split(',')[0]?.trim(),
        )
      : Promise.resolve({ ok: true } as { ok: true })

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
                id: `msg-${Date.now()}-preflight`,
                role: 'system' as const,
                content: `**Preflight Check Failed**\n\nThe mission cannot proceed because cluster access verification failed. See the details below for how to fix this.\n\nError: ${preflight.error?.message || 'Unknown error'}`,
                timestamp: new Date() }
            ]
          } : m
        ))
        emitMissionError(params.type || 'custom', preflight.error?.code || 'preflight_unknown')
        return
      }

      // Preflight passed — proceed to send to agent
      executeMission(missionId, enhancedPrompt, params)
    }).catch(() => {
      // Preflight itself threw unexpectedly — still allow mission to proceed
      // (don't block on preflight infrastructure failures)
      executeMission(missionId, enhancedPrompt, params)
    })
   
  }

  const startMission = (params: StartMissionParams): string => {
    const missionId = `mission-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const { enhancedPrompt, matchedResolutions, isInstallMission } = buildEnhancedPrompt(params)

    // Build initial messages
    const initialMessages: MissionMessage[] = [
      {
        id: `msg-${Date.now()}`,
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

  /**
   * Internal: send mission to agent after preflight passes.
   * Extracted from startMission to allow reuse from retryPreflight.
   */
  const executeMission = (
    missionId: string,
    enhancedPrompt: string,
    params: { context?: Record<string, unknown>; type?: string },
  ) => {
    // Send to agent
    ensureConnection().then(() => {
      const requestId = `claude-${Date.now()}`
      pendingRequests.current.set(requestId, missionId)

      setMissions(prev => prev.map(m =>
        m.id === missionId ? { ...m, status: 'running', currentStep: 'Connecting to agent...' } : m
      ))

      // Track token usage for this mission
      setActiveTokenCategory('missions')

      wsSend(JSON.stringify({
        id: requestId,
        type: 'chat',
        payload: {
          prompt: enhancedPrompt, // Send enhanced prompt with resolution context to AI
          sessionId: missionId,
          agent: selectedAgentRef.current || undefined,
          // Include mission context for the agent to use
          context: params.context }
      }), () => {
        setMissions(prev => prev.map(m =>
          m.id === missionId ? { ...m, status: 'failed', currentStep: 'WebSocket connection lost' } : m
        ))
      })

      // Update status after message is sent
      setTimeout(() => {
        setMissions(prev => prev.map(m =>
          m.id === missionId && m.currentStep === 'Connecting to agent...'
            ? { ...m, currentStep: 'Waiting for response...' }
            : m
        ))
      }, STATUS_WAITING_DELAY_MS)

      // Update status while AI is processing
      setTimeout(() => {
        setMissions(prev => prev.map(m =>
          m.id === missionId && m.currentStep === 'Waiting for response...'
            ? { ...m, currentStep: `Processing with ${selectedAgentRef.current || 'AI'}...` }
            : m
        ))
      }, STATUS_PROCESSING_DELAY_MS)
    }).catch(() => {
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
              id: `msg-${Date.now()}`,
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

    const clusterContext = mission.cluster?.split(',')[0]?.trim()

    runPreflightCheck(
      (args, opts) => kubectlProxy.exec(args, opts),
      clusterContext,
    ).then(preflight => {
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
                id: `msg-${Date.now()}-preflight-retry`,
                role: 'system' as const,
                content: `**Preflight Check Still Failing**\n\nError: ${preflight.error?.message || 'Unknown error'}`,
                timestamp: new Date() }
            ]
          } : m
        ))
        return
      }

      // Preflight passed — build prompt and execute
      const lastUserMsg = mission.messages.find(m => m.role === 'user')
      let prompt = lastUserMsg?.content || mission.description
      if (mission.cluster) {
        const clusterList = mission.cluster.split(',').map(c => c.trim()).filter(Boolean)
        if (clusterList.length === 1) {
          prompt = `Target cluster: ${clusterList[0]}\nIMPORTANT: All kubectl commands MUST use --context=${clusterList[0]}\n\n${prompt}`
        } else {
          prompt = `Target clusters: ${clusterList.join(', ')}\nIMPORTANT: Perform the following on each cluster using their respective kubectl contexts.\n\n${prompt}`
        }
      }

      setMissions(prev => prev.map(m =>
        m.id === missionId ? {
          ...m,
          preflightError: undefined,
          messages: [
            ...m.messages,
            {
              id: `msg-${Date.now()}-preflight-ok`,
              role: 'system' as const,
              content: '**Preflight check passed** — proceeding with mission execution.',
              timestamp: new Date() }
          ]
        } : m
      ))

      executeMission(missionId, prompt, { context: mission.context, type: mission.type })
    }).catch(() => {
      // Preflight threw unexpectedly — allow mission to proceed
      const lastUserMsg = mission.messages.find(m => m.role === 'user')
      const prompt = lastUserMsg?.content || mission.description
      executeMission(missionId, prompt, { context: mission.context, type: mission.type })
    })
  }

  // Save a mission to library without running it
  const saveMission = (params: SaveMissionParams): string => {
    const missionId = `mission-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

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
            id: `msg-${Date.now()}`,
            role: 'system' as const,
            content: `**Mission blocked:** Imported mission contains potentially unsafe content:\n\n${findings.map(f => `- ${f.message}: \`${f.match}\` (in ${f.location})`).join('\n')}\n\nPlease review and edit the mission before running.`,
            timestamp: new Date() }]
        } : m))
        return
      }
    }

    // Build the base prompt from saved mission data
    const basePrompt = mission.importedFrom?.steps
      ? `${mission.description}\n\nSteps:\n${mission.importedFrom.steps.map((s, i) => `${i + 1}. ${s.title}: ${s.description}`).join('\n')}`
      : mission.description

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
            id: `msg-${Date.now()}`,
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
    // Guard against double-cancel: if already cancelling, don't schedule another timeout
    if (cancelTimeouts.current.has(missionId)) return

    // Immediately purge ALL pending request IDs for this mission so that late
    // responses (from earlier failed or in-flight requests) are dropped before
    // finalizeCancellation runs (#4499).
    for (const [reqId, mId] of pendingRequests.current.entries()) {
      if (mId === missionId) pendingRequests.current.delete(reqId)
    }
    lastStreamTimestamp.current.delete(missionId)

    // Try WebSocket first (fastest path when connected)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        id: `cancel-${Date.now()}`,
        type: 'cancel_chat',
        payload: { sessionId: missionId } }))
    } else {
      // HTTP fallback — WS may be disconnected during long agent runs.
      // Use the response to determine if cancellation succeeded.
      fetch(`${LOCAL_AGENT_HTTP_URL}/cancel-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: missionId }) }).then(response => {
        if (response.ok) {
          finalizeCancellation(missionId, 'Mission cancelled by user.')
        } else {
          finalizeCancellation(missionId, 'Mission cancellation failed — backend returned an error. The mission may still be running.')
        }
      }).catch(() => {
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
            id: `msg-${Date.now()}`,
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

    // Track token usage for this mission
    setActiveTokenCategory('missions')

    setMissions(prev => prev.map(m => {
      if (m.id !== missionId) return m
      return {
        ...m,
        status: 'running',
        currentStep: 'Processing...',
        updatedAt: new Date(),
        messages: [
          ...m.messages,
          {
            id: `msg-${Date.now()}`,
            role: 'user',
            content,
            timestamp: new Date() }
        ]
      }
    }))

    ensureConnection().then(() => {
      const requestId = `claude-${Date.now()}`
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
              id: `msg-${Date.now()}`,
              role: 'system',
              content: 'Lost connection to local agent. Please ensure the agent is running and try again.',
              timestamp: new Date() }
          ]
        } : m
      ))
    })
  }

  // Dismiss/remove a mission from the list
  const dismissMission = (missionId: string) => {
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

  // Select an AI agent
  const selectAgent = (agentName: string) => {
    // Persist immediately so the choice survives page refresh
    localStorage.setItem(SELECTED_AGENT_KEY, agentName)
    setSelectedAgent(agentName)
    // Skip WebSocket message for 'none' — no backend agent to select
    if (agentName === NONE_AGENT) return
    ensureConnection().then(() => {
      wsSend(JSON.stringify({
        id: `select-agent-${Date.now()}`,
        type: 'select_agent',
        payload: { agent: agentName }
      }), () => {
        console.error('[Missions] Failed to send agent selection after retries')
      })
    }).catch(err => {
      console.error('[Missions] Failed to select agent:', err)
    })
  }

  // Connect to agent (for AgentSelector in navbar)
  const connectToAgent = () => {
    ensureConnection().catch(err => {
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
    return () => {
      if (wsReconnectTimer.current) {
        clearTimeout(wsReconnectTimer.current)
        wsReconnectTimer.current = null
      }
      // Clear all cancel acknowledgment timeouts
      for (const timeout of cancelTimeoutsRef.values()) {
        clearTimeout(timeout)
      }
      cancelTimeoutsRef.clear()
      wsRef.current?.close()
    }
  }, [])

  return (
    <MissionContext.Provider value={{
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
      startMission,
      saveMission,
      runSavedMission,
      updateSavedMission,
      sendMessage,
      retryPreflight,
      cancelMission,
      dismissMission,
      renameMission,
      rateMission,
      setActiveMission,
      markMissionAsRead,
      selectAgent,
      connectToAgent,
      toggleSidebar,
      openSidebar,
      closeSidebar,
      minimizeSidebar,
      expandSidebar,
      setFullScreen: handleSetFullScreen }}>
      {children}
    </MissionContext.Provider>
  )
}

/**
 * Safe fallback for when useMissions is called outside MissionProvider.
 *
 * This can happen transiently during error-boundary recovery, stale chunk
 * re-evaluation, or portal rendering in BaseModal (createPortal to
 * document.body). Rather than throwing (which triggers cascading GA4
 * runtime errors on /insights), return a no-op stub so the UI degrades
 * gracefully until the provider tree re-mounts.
 */
const MISSIONS_FALLBACK: MissionContextValue = {
  missions: [],
  activeMission: null,
  isSidebarOpen: false,
  isSidebarMinimized: false,
  isFullScreen: false,
  unreadMissionCount: 0,
  unreadMissionIds: new Set<string>(),
  agents: [],
  selectedAgent: null,
  defaultAgent: null,
  agentsLoading: false,
  isAIDisabled: true,
  startMission: () => '',
  saveMission: () => '',
  runSavedMission: () => {},
  updateSavedMission: () => {},
  sendMessage: () => {},
  retryPreflight: () => {},
  cancelMission: () => {},
  dismissMission: () => {},
  renameMission: () => {},
  rateMission: () => {},
  setActiveMission: () => {},
  markMissionAsRead: () => {},
  selectAgent: () => {},
  connectToAgent: () => {},
  toggleSidebar: () => {},
  openSidebar: () => {},
  closeSidebar: () => {},
  minimizeSidebar: () => {},
  expandSidebar: () => {},
  setFullScreen: () => {} }

export function useMissions() {
  const context = useContext(MissionContext)
  if (!context) {
    if (import.meta.env.DEV) {
      console.warn('useMissions was called outside MissionProvider — returning safe fallback')
    }
    return MISSIONS_FALLBACK
  }
  return context
}
