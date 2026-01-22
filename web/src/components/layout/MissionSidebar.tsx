import { useState, useRef, useEffect, useCallback } from 'react'
import {
  X,
  Send,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  MessageSquare,
  Trash2,
  Bot,
  User,
  ArrowUpCircle,
  Search,
  Wrench,
  Rocket,
  Sparkles,
  Hammer,
  PanelRightClose,
  PanelRightOpen,
  ThumbsUp,
  ThumbsDown,
  Maximize2,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useMissions, Mission, MissionStatus } from '../../hooks/useMissions'
import { cn } from '../../lib/cn'

// Rotating status messages for agent thinking
const THINKING_MESSAGES = [
  'Analyzing clusters...',
  'Checking resources...',
  'Reviewing configurations...',
  'Processing request...',
  'Generating response...',
  'Evaluating options...',
  'Inspecting workloads...',
  'Gathering data...',
]

// Animated typing indicator with 3 bouncing dots and optional rotating message
function TypingIndicator({ showMessage = false }: { showMessage?: boolean }) {
  const [messageIndex, setMessageIndex] = useState(0)

  // Rotate through messages every 2 seconds
  useEffect(() => {
    if (!showMessage) return
    const interval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % THINKING_MESSAGES.length)
    }, 2000)
    return () => clearInterval(interval)
  }, [showMessage])

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="flex items-center gap-1">
        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
      </div>
      {showMessage && (
        <span className="text-xs text-muted-foreground animate-pulse">
          {THINKING_MESSAGES[messageIndex]}
        </span>
      )}
    </div>
  )
}

const STATUS_CONFIG: Record<MissionStatus, { icon: typeof Loader2; color: string; label: string }> = {
  pending: { icon: Clock, color: 'text-yellow-400', label: 'Starting...' },
  running: { icon: Loader2, color: 'text-blue-400', label: 'Running' },
  waiting_input: { icon: MessageSquare, color: 'text-purple-400', label: 'Waiting for input' },
  completed: { icon: CheckCircle, color: 'text-green-400', label: 'Completed' },
  failed: { icon: AlertCircle, color: 'text-red-400', label: 'Failed' },
}

const TYPE_ICONS: Record<Mission['type'], typeof ArrowUpCircle> = {
  upgrade: ArrowUpCircle,
  troubleshoot: Wrench,
  analyze: Search,
  deploy: Rocket,
  repair: Hammer,
  custom: Sparkles,
}

function MissionListItem({ mission, isActive, onClick, onDismiss, isCollapsed, onToggleCollapse }: {
  mission: Mission
  isActive: boolean
  onClick: () => void
  onDismiss: () => void
  isCollapsed: boolean
  onToggleCollapse: () => void
}) {
  const config = STATUS_CONFIG[mission.status]
  const StatusIcon = config.icon
  const TypeIcon = TYPE_ICONS[mission.type]

  return (
    <div
      className={cn(
        'w-full text-left rounded-lg transition-colors',
        isActive
          ? 'bg-primary/20 border border-primary/50'
          : 'hover:bg-secondary/50 border border-transparent'
      )}
    >
      {/* Header row with controls */}
      <div className="flex items-center gap-2 p-3 pb-0">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCollapse() }}
          className="p-0.5 hover:bg-secondary/50 rounded transition-colors"
          title={isCollapsed ? "Expand" : "Collapse"}
        >
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>
        <div className={cn('flex-shrink-0', config.color)}>
          <StatusIcon className={cn('w-4 h-4', mission.status === 'running' && 'animate-spin')} />
        </div>
        <button
          onClick={onClick}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
        >
          <TypeIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium text-foreground truncate">{mission.title}</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss() }}
          className="p-0.5 hover:bg-red-500/20 rounded transition-colors flex-shrink-0"
          title="Dismiss mission"
        >
          <X className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
        </button>
      </div>

      {/* Collapsible content */}
      {!isCollapsed && (
        <button
          onClick={onClick}
          className="w-full text-left px-3 pb-3 pt-1 pl-10"
        >
          <p className="text-xs text-muted-foreground truncate">{mission.description}</p>
          {mission.cluster && (
            <span className="text-xs text-purple-400 mt-1 inline-block">@{mission.cluster}</span>
          )}
        </button>
      )}
    </div>
  )
}

function MissionChat({ mission, isFullScreen = false }: { mission: Mission; isFullScreen?: boolean }) {
  const { sendMessage, cancelMission, dismissMission, rateMission } = useMissions()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const lastMessageCountRef = useRef(mission.messages.length)

  // Check if user is at bottom of scroll container
  const isAtBottom = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return true
    const threshold = 50 // pixels from bottom to consider "at bottom"
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold
  }, [])

  // Handle scroll events to detect user scrolling
  const handleScroll = useCallback(() => {
    setShouldAutoScroll(isAtBottom())
  }, [isAtBottom])

  // Auto-scroll to bottom only when new messages are added (not on every render)
  useEffect(() => {
    const messageCount = mission.messages.length
    const hasNewMessages = messageCount > lastMessageCountRef.current
    lastMessageCountRef.current = messageCount

    if (shouldAutoScroll && hasNewMessages) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [mission.messages.length, shouldAutoScroll])

  // Focus input when mission becomes active
  useEffect(() => {
    if (mission.status === 'waiting_input') {
      inputRef.current?.focus()
    }
  }, [mission.status])

  const handleSend = () => {
    if (!input.trim() || mission.status === 'running') return
    sendMessage(mission.id, input.trim())
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const config = STATUS_CONFIG[mission.status]
  const StatusIcon = config.icon
  const TypeIcon = TYPE_ICONS[mission.type]

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <TypeIcon className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground flex-1 truncate">{mission.title}</h3>
          <div className={cn('flex items-center gap-1', config.color)}>
            <StatusIcon className={cn('w-4 h-4', mission.status === 'running' && 'animate-spin')} />
            <span className="text-xs">{config.label}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{mission.description}</p>
        {mission.cluster && (
          <span className="text-xs text-purple-400 mt-1 inline-block">Cluster: {mission.cluster}</span>
        )}
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0"
      >
        {mission.messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex gap-3',
              msg.role === 'user' && 'flex-row-reverse'
            )}
          >
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
              msg.role === 'user' ? 'bg-primary/20' :
              msg.role === 'assistant' ? 'bg-purple-500/20' :
              'bg-yellow-500/20'
            )}>
              {msg.role === 'user' ? (
                <User className="w-4 h-4 text-primary" />
              ) : msg.role === 'assistant' ? (
                <Bot className="w-4 h-4 text-purple-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-yellow-400" />
              )}
            </div>
            <div className={cn(
              'flex-1 rounded-lg p-3',
              isFullScreen ? 'max-w-[95%]' : 'max-w-[85%]',
              msg.role === 'user' ? 'bg-primary/10 ml-auto' :
              msg.role === 'assistant' ? 'bg-secondary/50' :
              'bg-yellow-500/10'
            )}>
              {msg.role === 'assistant' ? (
                <div className="text-sm text-foreground prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-2 prose-pre:bg-black/30 prose-pre:text-xs prose-code:text-purple-300 prose-code:bg-black/20 prose-code:px-1 prose-code:rounded">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-foreground whitespace-pre-wrap">{msg.content}</p>
              )}
              <span className="text-[10px] text-muted-foreground mt-1 block">
                {msg.timestamp.toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}

        {/* Typing indicator when agent is working */}
        {mission.status === 'running' && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-purple-500/20">
              <Bot className="w-4 h-4 text-purple-400" />
            </div>
            <div className="rounded-lg bg-secondary/50 flex items-center gap-2 pr-3">
              {/* Show rotating messages if no specific currentStep */}
              <TypingIndicator showMessage={!mission.currentStep} />
              {mission.currentStep && (
                <span className="text-xs text-muted-foreground">{mission.currentStep}</span>
              )}
              {mission.tokenUsage && mission.tokenUsage.total > 0 && (
                <span className="text-[10px] text-muted-foreground/70 font-mono">
                  {mission.tokenUsage.total.toLocaleString()} tokens
                </span>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input / Actions */}
      <div className="p-4 border-t border-border flex-shrink-0 bg-card">
        {mission.status === 'running' ? (
          <div className="flex items-center justify-end py-2">
            <button
              onClick={() => cancelMission(mission.id)}
              className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : mission.status === 'completed' || mission.status === 'failed' ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className={cn('text-sm', config.color)}>{config.label}</span>
              <button
                onClick={() => dismissMission(mission.id)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="w-3 h-3" />
                Dismiss
              </button>
            </div>
            {/* Feedback buttons */}
            <div className="flex items-center justify-center gap-4 pt-2 border-t border-border/50">
              <span className="text-xs text-muted-foreground">Was this helpful?</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => rateMission(mission.id, 'positive')}
                  className={cn(
                    'p-1.5 rounded-lg transition-colors',
                    mission.feedback === 'positive'
                      ? 'bg-green-500/20 text-green-400'
                      : 'hover:bg-secondary text-muted-foreground hover:text-green-400'
                  )}
                  title="Helpful"
                >
                  <ThumbsUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => rateMission(mission.id, 'negative')}
                  className={cn(
                    'p-1.5 rounded-lg transition-colors',
                    mission.feedback === 'negative'
                      ? 'bg-red-500/20 text-red-400'
                      : 'hover:bg-secondary text-muted-foreground hover:text-red-400'
                  )}
                  title="Not helpful"
                >
                  <ThumbsDown className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="flex-1 px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function MissionSidebar() {
  const { missions, activeMission, isSidebarOpen, isSidebarMinimized, isFullScreen, setActiveMission, closeSidebar, dismissMission, minimizeSidebar, expandSidebar, setFullScreen } = useMissions()
  const [collapsedMissions, setCollapsedMissions] = useState<Set<string>>(new Set())

  // Exit fullscreen on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        setFullScreen(false)
      }
    }
    if (isFullScreen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isFullScreen, setFullScreen])

  // Count missions needing attention
  const needsAttention = missions.filter(m =>
    m.status === 'waiting_input' || m.status === 'failed'
  ).length

  const runningCount = missions.filter(m => m.status === 'running').length

  const toggleMissionCollapse = (missionId: string) => {
    setCollapsedMissions(prev => {
      const next = new Set(prev)
      if (next.has(missionId)) {
        next.delete(missionId)
      } else {
        next.add(missionId)
      }
      return next
    })
  }

  if (!isSidebarOpen) {
    return null
  }

  // Minimized sidebar view (thin strip)
  if (isSidebarMinimized) {
    return (
      <div className="fixed top-16 right-0 bottom-0 w-12 bg-card/95 backdrop-blur-sm border-l border-border z-40 flex flex-col items-center py-4">
        <button
          onClick={expandSidebar}
          className="p-2 hover:bg-secondary rounded transition-colors mb-4"
          title="Expand sidebar"
        >
          <PanelRightOpen className="w-5 h-5 text-muted-foreground" />
        </button>

        <div className="flex flex-col items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          {missions.length > 0 && (
            <span className="text-xs font-medium text-foreground">{missions.length}</span>
          )}
          {runningCount > 0 && (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          )}
          {needsAttention > 0 && (
            <span className="w-5 h-5 flex items-center justify-center text-xs bg-purple-500/20 text-purple-400 rounded-full">
              {needsAttention}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      "fixed bg-card/95 backdrop-blur-sm border-border z-40 flex flex-col",
      // Use separate transitions for smoother animation
      "transition-[width,top,border] duration-300",
      isFullScreen
        ? "inset-0 top-16 border-l-0"
        : "top-16 right-0 bottom-0 w-96 border-l"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground">AI Missions</h2>
          {needsAttention > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded-full">
              {needsAttention}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isFullScreen ? (
            <button
              onClick={() => setFullScreen(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/30 hover:bg-primary/20 rounded-lg transition-colors text-sm text-primary font-medium"
              title="Exit full screen and return to sidebar"
            >
              <PanelRightOpen className="w-4 h-4" />
              <span>Back to Sidebar</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => setFullScreen(true)}
                className="p-1 hover:bg-secondary rounded transition-colors"
                title="Full screen"
              >
                <Maximize2 className="w-5 h-5 text-muted-foreground" />
              </button>
              <button
                onClick={minimizeSidebar}
                className="p-1 hover:bg-secondary rounded transition-colors"
                title="Minimize sidebar"
              >
                <PanelRightClose className="w-5 h-5 text-muted-foreground" />
              </button>
            </>
          )}
          <button
            onClick={closeSidebar}
            className="p-1 hover:bg-secondary rounded transition-colors"
            title="Close sidebar"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {missions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <Bot className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">No active missions</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Start a mission from any card's AI action
          </p>
        </div>
      ) : activeMission ? (
        <div className={cn(
          "flex-1 flex flex-col min-h-0",
          isFullScreen && "max-w-4xl mx-auto w-full"
        )}>
          {/* Back to list if multiple missions */}
          {missions.length > 1 && (
            <button
              onClick={() => setActiveMission(null)}
              className="flex items-center gap-1 px-4 py-2 text-xs text-muted-foreground hover:text-foreground border-b border-border flex-shrink-0"
            >
              <ChevronLeft className="w-3 h-3" />
              Back to missions ({missions.length})
            </button>
          )}
          <MissionChat mission={activeMission} isFullScreen={isFullScreen} />
        </div>
      ) : (
        <div className={cn(
          "flex-1 overflow-y-auto p-2 space-y-2",
          isFullScreen && "max-w-2xl mx-auto w-full"
        )}>
          {missions.map((mission) => (
            <MissionListItem
              key={mission.id}
              mission={mission}
              isActive={false}
              onClick={() => setActiveMission(mission.id)}
              onDismiss={() => dismissMission(mission.id)}
              isCollapsed={collapsedMissions.has(mission.id)}
              onToggleCollapse={() => toggleMissionCollapse(mission.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Toggle button for the sidebar (shown when sidebar is closed)
export function MissionSidebarToggle() {
  const { missions, isSidebarOpen, openSidebar } = useMissions()

  const needsAttention = missions.filter(m =>
    m.status === 'waiting_input' || m.status === 'failed'
  ).length

  const runningCount = missions.filter(m => m.status === 'running').length

  // Always show toggle when sidebar is closed (even with no missions)
  if (isSidebarOpen) {
    return null
  }

  return (
    <button
      onClick={openSidebar}
      className={cn(
        'fixed right-4 bottom-4 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg transition-all z-50',
        needsAttention > 0
          ? 'bg-purple-500 text-white animate-pulse'
          : 'bg-card border border-border text-foreground hover:bg-secondary'
      )}
      title="Open AI Missions"
    >
      <Bot className="w-5 h-5" />
      {runningCount > 0 && (
        <Loader2 className="w-4 h-4 animate-spin" />
      )}
      {needsAttention > 0 ? (
        <span className="text-sm font-medium">{needsAttention} needs attention</span>
      ) : missions.length > 0 ? (
        <span className="text-sm">{missions.length} mission{missions.length !== 1 ? 's' : ''}</span>
      ) : (
        <span className="text-sm">AI Missions</span>
      )}
      <ChevronRight className="w-4 h-4" />
    </button>
  )
}
