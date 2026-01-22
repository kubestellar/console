import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react'

export type MissionStatus = 'pending' | 'running' | 'waiting_input' | 'completed' | 'failed'

export interface MissionMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
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

  // Actions
  startMission: (params: StartMissionParams) => string
  sendMessage: (missionId: string, content: string) => void
  cancelMission: (missionId: string) => void
  dismissMission: (missionId: string) => void
  rateMission: (missionId: string, feedback: MissionFeedback) => void
  setActiveMission: (missionId: string | null) => void
  markMissionAsRead: (missionId: string) => void
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

const KKC_AGENT_WS_URL = 'ws://127.0.0.1:8585/ws'
const MISSIONS_STORAGE_KEY = 'klaude_missions'
const UNREAD_MISSIONS_KEY = 'klaude_unread_missions'

// Load missions from localStorage
function loadMissions(): Mission[] {
  try {
    const stored = localStorage.getItem(MISSIONS_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Convert date strings back to Date objects
      return parsed.map((m: Mission) => ({
        ...m,
        createdAt: new Date(m.createdAt),
        updatedAt: new Date(m.updatedAt),
        messages: m.messages.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
      }))
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

  // Connect to KKC agent WebSocket
  const ensureConnection = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve, reject) => {
      try {
        wsRef.current = new WebSocket(KKC_AGENT_WS_URL)

        wsRef.current.onopen = () => {
          console.log('[Missions] Connected to KKC agent')
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
          console.log('[Missions] Connection closed')
          wsRef.current = null
        }

        wsRef.current.onerror = () => {
          reject(new Error('Failed to connect to KKC agent'))
        }
      } catch (err) {
        reject(err)
      }
    })
  }, [])

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
        // Streaming response from Claude
        const payload = message.payload as { content?: string; done?: boolean }
        const lastMsg = m.messages[m.messages.length - 1]

        if (lastMsg?.role === 'assistant' && !payload.done) {
          // Append to existing assistant message
          return {
            ...m,
            status: 'running' as MissionStatus,
            currentStep: 'Generating response...',
            updatedAt: new Date(),
            messages: [
              ...m.messages.slice(0, -1),
              { ...lastMsg, content: lastMsg.content + (payload.content || '') }
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
        const payload = message.payload as { content?: string; output?: string }
        pendingRequests.current.delete(message.id)
        markMissionAsUnread(missionId)

        return {
          ...m,
          status: 'waiting_input' as MissionStatus,
          currentStep: undefined,
          updatedAt: new Date(),
          messages: [
            ...m.messages,
            {
              id: `msg-${Date.now()}`,
              role: 'assistant' as const,
              content: payload.content || payload.output || 'Task completed.',
              timestamp: new Date(),
            }
          ]
        }
      } else if (message.type === 'error') {
        const payload = message.payload as { message?: string }
        pendingRequests.current.delete(message.id)

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
              content: `Error: ${payload.message || 'Unknown error'}`,
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
        type: 'claude',
        payload: {
          prompt: params.initialPrompt,
          sessionId: missionId,
        }
      }))
    }).catch(err => {
      setMissions(prev => prev.map(m =>
        m.id === missionId ? {
          ...m,
          status: 'failed',
          messages: [
            ...m.messages,
            {
              id: `msg-${Date.now()}`,
              role: 'system',
              content: `Failed to connect to KKC agent: ${err.message}`,
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

      wsRef.current?.send(JSON.stringify({
        id: requestId,
        type: 'claude',
        payload: {
          prompt: content,
          sessionId: missionId,
        }
      }))
    })
  }, [ensureConnection])

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
    // TODO: Send feedback to analytics endpoint when available
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
      startMission,
      sendMessage,
      cancelMission,
      dismissMission,
      rateMission,
      setActiveMission,
      markMissionAsRead,
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
