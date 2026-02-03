import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react'
import type { AgentInfo, AgentsListPayload, AgentSelectedPayload, ChatStreamPayload } from '../types/agent'
import { getDemoMode } from './useDemoMode'

export type MissionStatus = 'pending' | 'running' | 'waiting_input' | 'completed' | 'failed'

export interface MissionMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  /** Agent that generated this message (for assistant messages) */
  agent?: string
}

export type MissionFeedback = 'positive' | 'negative' | null

export interface Mission {
  id: string
  title: string
  description: string
  type: 'upgrade' | 'troubleshoot' | 'analyze' | 'deploy' | 'repair' | 'custom'
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

  // Actions
  startMission: (params: StartMissionParams) => string
  sendMessage: (missionId: string, content: string) => void
  cancelMission: (missionId: string) => void
  dismissMission: (missionId: string) => void
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
}

const MissionContext = createContext<MissionContextValue | null>(null)

const KC_AGENT_WS_URL = 'ws://127.0.0.1:8585/ws'
const MISSIONS_STORAGE_KEY = 'kc_missions'
const UNREAD_MISSIONS_KEY = 'kc_unread_missions'
const SELECTED_AGENT_KEY = 'kc_selected_agent'

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
        return mission
      })
    }
  } catch (e) {
    console.error('Failed to load missions from localStorage:', e)
  }
  return []
}

// Save missions to localStorage
function saveMissions(missions: Mission[]) {
  try {
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))
  } catch (e) {
    console.error('Failed to save missions to localStorage:', e)
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

  // Save missions whenever they change
  useEffect(() => {
    saveMissions(missions)
  }, [missions])

  // Save unread IDs whenever they change
  useEffect(() => {
    saveUnreadMissionIds(unreadMissionIds)
  }, [unreadMissionIds])

  // Fetch available agents
  const fetchAgents = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        id: `list-agents-${Date.now()}`,
        type: 'list_agents',
      }))
    }
  }, [])

  // Connect to local agent WebSocket
  const ensureConnection = useCallback(() => {
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

      // Connection timeout - 5 seconds
      const timeout = setTimeout(() => {
        if (wsRef.current) {
          wsRef.current.close()
          wsRef.current = null
        }
        setAgentsLoading(false)
        reject(new Error('CONNECTION_TIMEOUT'))
      }, 5000)

      try {
        wsRef.current = new WebSocket(KC_AGENT_WS_URL)

        wsRef.current.onopen = () => {
          clearTimeout(timeout)
          console.log('[Missions] Connected to local agent')
          // Fetch available agents on connect
          fetchAgents()

          // Auto-reconnect interrupted missions
          setMissions(prev => {
            const missionsToReconnect = prev.filter(m =>
              m.status === 'running' && m.context?.needsReconnect
            )

            if (missionsToReconnect.length > 0) {
              console.log(`[Missions] Auto-reconnecting ${missionsToReconnect.length} interrupted mission(s)`)

              // Schedule reconnection after a short delay to let state settle
              setTimeout(() => {
                missionsToReconnect.forEach(mission => {
                  // Find the last user message to re-send
                  const userMessages = mission.messages.filter(msg => msg.role === 'user')
                  const lastUserMessage = userMessages[userMessages.length - 1]

                  if (lastUserMessage && wsRef.current?.readyState === WebSocket.OPEN) {
                    // Determine which agent to use - prefer claude-code for tool execution
                    const agentToUse = mission.agent || 'claude-code'
                    console.log(`[Missions] Resuming mission ${mission.id} with agent: ${agentToUse}`)
                    console.log(`[Missions] Last message: "${lastUserMessage.content.substring(0, 50)}..."`)

                    const requestId = `claude-reconnect-${Date.now()}-${mission.id}`
                    pendingRequests.current.set(requestId, mission.id)

                    // Build history from all messages except system messages
                    const history = mission.messages
                      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
                      .map(msg => ({
                        role: msg.role,
                        content: msg.content,
                      }))

                    wsRef.current?.send(JSON.stringify({
                      id: requestId,
                      type: 'chat',
                      payload: {
                        prompt: lastUserMessage.content,
                        sessionId: mission.id,
                        agent: agentToUse,
                        history: history,
                      }
                    }))
                  }
                })
              }, 500)

              // Clear the needsReconnect flag and update step
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

          resolve()
        }

        wsRef.current.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            handleAgentMessage(message)
          } catch (e) {
            console.error('[Missions] Failed to parse message:', e)
          }
        }

        wsRef.current.onclose = () => {
          clearTimeout(timeout)
          console.log('[Missions] Connection closed')
          wsRef.current = null
          setAgentsLoading(false) // Stop loading spinner on disconnect
          setAgents([]) // Clear agents so "Configure AI" button shows

          // Fail any pending missions that were waiting for a response
          if (pendingRequests.current.size > 0) {
            const errorContent = `**Local Agent Not Connected**

The AI missions feature requires the local agent to be running.

**To get started:**
1. Install and run the console locally:
   \`\`\`
   curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/start-dev.sh | bash
   \`\`\`
2. Open the console: http://localhost:5174
3. [⚙️ Configure API Keys →](/settings) for Claude, OpenAI, or Gemini`

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
                      timestamp: new Date(),
                    }
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
          reject(new Error('CONNECTION_FAILED'))
        }
      } catch (err) {
        clearTimeout(timeout)
        reject(err)
      }
    })
  }, [fetchAgents])

  // Mark a mission as having unread content (not currently being viewed)
  const markMissionAsUnread = useCallback((missionId: string) => {
    // Only mark as unread if it's not the active mission
    if (missionId !== activeMissionId || !isSidebarOpen) {
      setUnreadMissionIds(prev => {
        const next = new Set(prev)
        next.add(missionId)
        return next
      })
    }
  }, [activeMissionId, isSidebarOpen])

  // Handle messages from the agent
  const handleAgentMessage = useCallback((message: { id: string; type: string; payload?: unknown }) => {
    // Handle agent-related messages (no mission ID needed)
    if (message.type === 'agents_list') {
      const payload = message.payload as AgentsListPayload
      setAgents(payload.agents)
      setDefaultAgent(payload.defaultAgent)
      // Prefer persisted selection if the agent is still available
      const persisted = localStorage.getItem(SELECTED_AGENT_KEY)
      const persistedAvailable = persisted && payload.agents.some(a => a.name === persisted && a.available)
      const resolved = persistedAvailable ? persisted : (payload.selected || payload.defaultAgent)
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

    const missionId = pendingRequests.current.get(message.id)
    if (!missionId) return

    setMissions(prev => prev.map(m => {
      if (m.id !== missionId) return m

      if (message.type === 'progress') {
        // Progress update from agent (e.g., "Querying cluster...", "Analyzing logs...")
        const payload = message.payload as {
          step?: string
          progress?: number
          tokens?: { input?: number; output?: number; total?: number }
        }
        return {
          ...m,
          currentStep: payload.step || m.currentStep,
          progress: payload.progress ?? m.progress,
          tokenUsage: payload.tokens ? {
            input: payload.tokens.input ?? m.tokenUsage?.input ?? 0,
            output: payload.tokens.output ?? m.tokenUsage?.output ?? 0,
            total: payload.tokens.total ?? m.tokenUsage?.total ?? 0,
          } : m.tokenUsage,
          updatedAt: new Date(),
        }
      } else if (message.type === 'stream') {
        // Streaming response from agent
        const payload = message.payload as ChatStreamPayload
        const lastMsg = m.messages[m.messages.length - 1]

        if (lastMsg?.role === 'assistant' && !payload.done && m.status === 'running') {
          // Append to existing assistant message mid-stream, preserve agent
          return {
            ...m,
            status: 'running' as MissionStatus,
            currentStep: 'Generating response...',
            updatedAt: new Date(),
            agent: payload.agent || m.agent, // Update mission agent if provided
            messages: [
              ...m.messages.slice(0, -1),
              { ...lastMsg, content: lastMsg.content + (payload.content || ''), agent: payload.agent || lastMsg.agent }
            ]
          }
        } else if (!payload.done && payload.content) {
          // First chunk - create new assistant message with agent
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
                agent: payload.agent || m.agent,
              }
            ]
          }
        } else if (payload.done) {
          // Stream complete - mark as unread
          pendingRequests.current.delete(message.id)
          markMissionAsUnread(missionId)
          return {
            ...m,
            status: 'waiting_input' as MissionStatus,
            currentStep: undefined,
            updatedAt: new Date(),
          }
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
          total: chatPayload.usage.totalTokens,
        } : m.tokenUsage

        return {
          ...m,
          status: 'waiting_input' as MissionStatus,
          currentStep: undefined,
          updatedAt: new Date(),
          agent: chatPayload.agent || m.agent,
          tokenUsage,
          messages: [
            ...m.messages,
            {
              id: `msg-${Date.now()}`,
              role: 'assistant' as const,
              content: chatPayload.content || (payload as { output?: string }).output || 'Task completed.',
              timestamp: new Date(),
              agent: chatPayload.agent || m.agent,
            }
          ]
        }
      } else if (message.type === 'error') {
        const payload = message.payload as { code?: string; message?: string }
        pendingRequests.current.delete(message.id)

        // Create helpful error message based on error code
        let errorContent = payload.message || 'Unknown error'
        if (payload.code === 'no_agent' || payload.code === 'agent_unavailable') {
          errorContent = `${payload.message}\n\n[Configure API Keys →](/settings)\n\nAdd your API key for Claude, OpenAI, or Gemini to use AI missions.`
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
              timestamp: new Date(),
            }
          ]
        }
      }

      return m
    }))
  }, [])

  // Start a new mission
  const startMission = useCallback((params: StartMissionParams): string => {
    const missionId = `mission-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const mission: Mission = {
      id: missionId,
      title: params.title,
      description: params.description,
      type: params.type,
      status: 'pending',
      cluster: params.cluster,
      messages: [
        {
          id: `msg-${Date.now()}`,
          role: 'user',
          content: params.initialPrompt,
          timestamp: new Date(),
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      context: params.context,
      agent: selectedAgent || defaultAgent || undefined,
    }

    setMissions(prev => [mission, ...prev])
    setActiveMissionId(missionId)
    setIsSidebarOpen(true)

    // Send to agent
    ensureConnection().then(() => {
      const requestId = `claude-${Date.now()}`
      pendingRequests.current.set(requestId, missionId)

      setMissions(prev => prev.map(m =>
        m.id === missionId ? { ...m, status: 'running', currentStep: 'Connecting to agent...' } : m
      ))

      wsRef.current?.send(JSON.stringify({
        id: requestId,
        type: 'chat',
        payload: {
          prompt: params.initialPrompt,
          sessionId: missionId,
          agent: selectedAgent || undefined,
        }
      }))

      // Update status after message is sent
      setTimeout(() => {
        setMissions(prev => prev.map(m =>
          m.id === missionId && m.currentStep === 'Connecting to agent...'
            ? { ...m, currentStep: 'Waiting for response...' }
            : m
        ))
      }, 500)

      // Update status while AI is processing
      setTimeout(() => {
        setMissions(prev => prev.map(m =>
          m.id === missionId && m.currentStep === 'Waiting for response...'
            ? { ...m, currentStep: `Processing with ${selectedAgent || 'AI'}...` }
            : m
        ))
      }, 3000)
    }).catch(() => {
      const errorContent = `**Local Agent Not Connected**

The AI missions feature requires the local agent to be running.

**To get started:**
1. Install and run the console locally:
   \`\`\`
   curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/start-dev.sh | bash
   \`\`\`
2. Open the console: http://localhost:5174
3. [⚙️ Configure API Keys →](/settings) for Claude, OpenAI, or Gemini`

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
              timestamp: new Date(),
            }
          ]
        } : m
      ))
    })

    return missionId
  }, [ensureConnection])

  // Send a follow-up message
  const sendMessage = useCallback((missionId: string, content: string) => {
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
            timestamp: new Date(),
          }
        ]
      }
    }))

    ensureConnection().then(() => {
      const requestId = `claude-${Date.now()}`
      pendingRequests.current.set(requestId, missionId)

      // Get the mission to access its message history
      const mission = missions.find(m => m.id === missionId)
      const history = mission?.messages
        .filter(msg => msg.role === 'user' || msg.role === 'assistant')
        .map(msg => ({
          role: msg.role,
          content: msg.content,
        })) || []

      wsRef.current?.send(JSON.stringify({
        id: requestId,
        type: 'chat',
        payload: {
          prompt: content,
          sessionId: missionId,
          agent: selectedAgent || undefined,
          history: history, // Include conversation history for context
        }
      }))
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
              timestamp: new Date(),
            }
          ]
        } : m
      ))
    })
  }, [ensureConnection, missions, selectedAgent])

  // Cancel a running mission
  const cancelMission = useCallback((missionId: string) => {
    setMissions(prev => prev.map(m =>
      m.id === missionId ? {
        ...m,
        status: 'failed',
        updatedAt: new Date(),
        messages: [
          ...m.messages,
          {
            id: `msg-${Date.now()}`,
            role: 'system',
            content: 'Mission cancelled by user.',
            timestamp: new Date(),
          }
        ]
      } : m
    ))
  }, [])

  // Dismiss/remove a mission from the list
  const dismissMission = useCallback((missionId: string) => {
    setMissions(prev => prev.filter(m => m.id !== missionId))
    if (activeMissionId === missionId) {
      setActiveMissionId(null)
    }
  }, [activeMissionId])

  // Rate a mission (thumbs up/down feedback)
  const rateMission = useCallback((missionId: string, feedback: MissionFeedback) => {
    setMissions(prev => prev.map(m =>
      m.id === missionId ? { ...m, feedback, updatedAt: new Date() } : m
    ))
    // Analytics integration: Would POST feedback to /api/analytics/missions endpoint when available
    // For now, feedback is stored locally in component state only
    console.log(`[Missions] Feedback for ${missionId}: ${feedback}`)
  }, [])

  // Set active mission
  const setActiveMission = useCallback((missionId: string | null) => {
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
  }, [])

  // Mark a specific mission as read
  const markMissionAsRead = useCallback((missionId: string) => {
    setUnreadMissionIds(prev => {
      if (prev.has(missionId)) {
        const next = new Set(prev)
        next.delete(missionId)
        return next
      }
      return prev
    })
  }, [])

  // Select an AI agent
  const selectAgent = useCallback((agentName: string) => {
    // Persist immediately so the choice survives page refresh
    localStorage.setItem(SELECTED_AGENT_KEY, agentName)
    setSelectedAgent(agentName)
    ensureConnection().then(() => {
      wsRef.current?.send(JSON.stringify({
        id: `select-agent-${Date.now()}`,
        type: 'select_agent',
        payload: { agent: agentName }
      }))
    }).catch(err => {
      console.error('[Missions] Failed to select agent:', err)
    })
  }, [ensureConnection])

  // Connect to agent (for AgentSelector in navbar)
  const connectToAgent = useCallback(() => {
    ensureConnection().catch(err => {
      console.error('[Missions] Failed to connect to agent:', err)
    })
  }, [ensureConnection])

  // Sidebar controls
  const toggleSidebar = useCallback(() => setIsSidebarOpen(prev => !prev), [])
  const openSidebar = useCallback(() => {
    setIsSidebarOpen(true)
    setIsSidebarMinimized(false) // Expand when opening
  }, [])
  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false)
    setIsFullScreen(false) // Exit fullscreen when closing
  }, [])
  const minimizeSidebar = useCallback(() => setIsSidebarMinimized(true), [])
  const expandSidebar = useCallback(() => setIsSidebarMinimized(false), [])

  // Fullscreen controls
  const handleSetFullScreen = useCallback((fullScreen: boolean) => {
    setIsFullScreen(fullScreen)
  }, [])

  // Get active mission object
  const activeMission = missions.find(m => m.id === activeMissionId) || null

  // Cleanup on unmount
  useEffect(() => {
    return () => {
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
      startMission,
      sendMessage,
      cancelMission,
      dismissMission,
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
      setFullScreen: handleSetFullScreen,
    }}>
      {children}
    </MissionContext.Provider>
  )
}

export function useMissions() {
  const context = useContext(MissionContext)
  if (!context) {
    throw new Error('useMissions must be used within a MissionProvider')
  }
  return context
}
