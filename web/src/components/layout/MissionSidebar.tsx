import { useState, useRef, useEffect, useCallback, memo, useMemo } from 'react'
import { Link } from 'react-router-dom'
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
  Minimize2,
  Settings,
  Minus,
  Plus,
  Type,
  Download,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useMissions, Mission, MissionStatus, MissionMessage } from '../../hooks/useMissions'
import { cn } from '../../lib/cn'
import { AgentSelector } from '../agent/AgentSelector'
import { AgentBadge, AgentIcon } from '../agent/AgentIcon'

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

function MissionListItem({ mission, isActive, onClick, onDismiss, onExpand, isCollapsed, onToggleCollapse }: {
  mission: Mission
  isActive: boolean
  onClick: () => void
  onDismiss: () => void
  onExpand: () => void
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
          onClick={(e) => { e.stopPropagation(); onExpand() }}
          className="p-0.5 hover:bg-secondary/50 rounded transition-colors flex-shrink-0"
          title="Open full screen"
        >
          <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss() }}
          className="p-0.5 hover:bg-red-500/20 rounded transition-colors flex-shrink-0"
          title="Delete mission"
        >
          <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
        </button>
      </div>

      {/* Collapsible content */}
      {!isCollapsed && (
        <button
          onClick={onClick}
          className="w-full text-left px-3 pb-3 pt-1 pl-10"
        >
          <p className="text-xs text-muted-foreground truncate">{mission.description}</p>
          <div className="flex items-center gap-2 mt-1">
            {mission.cluster && (
              <span className="text-xs text-purple-400">@{mission.cluster}</span>
            )}
            <span className="text-[10px] text-muted-foreground/70">
              {mission.createdAt.toLocaleDateString()} {mission.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </button>
      )}
    </div>
  )
}

type FontSize = 'sm' | 'base' | 'lg'
const FONT_SIZE_CLASSES: Record<FontSize, string> = {
  sm: 'text-xs prose-sm',
  base: 'text-sm prose-sm',
  lg: 'text-base prose-base'
}

// Detect if message content indicates agent is working on something
function detectWorkingIndicator(content: string): string | null {
  const patterns = [
    { regex: /I'll\s+(check|look|analyze|investigate|examine|review|search|find|get|fetch|run|execute)/i, action: 'Working' },
    { regex: /Let me\s+(check|look|analyze|investigate|examine|review|search|find|get|fetch|run|execute|try)/i, action: 'Working' },
    { regex: /I('m| am)\s+(going to|now|currently)\s+(check|look|analyze|investigate|examine|review|search|find|get|fetch|run|execute)/i, action: 'Working' },
    { regex: /I('m| am)\s+(checking|looking|analyzing|investigating|examining|reviewing|searching|finding|getting|fetching|running|executing|attempting)/i, action: 'In progress' },
    { regex: /working on/i, action: 'Working' },
    { regex: /one moment/i, action: 'Working' },
    { regex: /give me a (moment|second|minute)/i, action: 'Working' },
    { regex: /stand by/i, action: 'Working' },
    { regex: /please wait/i, action: 'Executing' },
    { regex: /attempting to execute/i, action: 'Executing' },
  ]

  for (const { regex, action } of patterns) {
    if (regex.test(content)) {
      return action
    }
  }
  return null
}

// Memoized message component to prevent re-renders on scroll
interface MessageProps {
  msg: MissionMessage
  missionAgent?: string
  isFullScreen: boolean
  fontSize: FontSize
  isLastAssistantMessage?: boolean
  missionStatus?: string
}

const MemoizedMessage = memo(function MemoizedMessage({ msg, missionAgent, isFullScreen, fontSize, isLastAssistantMessage, missionStatus }: MessageProps) {
  // Memoize the parsed content to avoid re-parsing on every render
  const parsedContent = useMemo(() => {
    if (msg.role !== 'assistant') return null
    return extractInputRequestParagraph(msg.content)
  }, [msg.content, msg.role])

  // Memoize markdown components
  const markdownComponents = useMemo(() => ({
    code({ className, children, ...props }: { className?: string; children?: React.ReactNode }) {
      const match = /language-(\w+)/.exec(className || '')
      const isInline = !match && !className
      return isInline ? (
        <code className={className} {...props}>{children}</code>
      ) : (
        <SyntaxHighlighter
          style={oneDark}
          language={match?.[1] || 'text'}
          PreTag="div"
          customStyle={{ margin: 0, borderRadius: '0.375rem', fontSize: fontSize === 'lg' ? '0.875rem' : '0.75rem' }}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      )
    },
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
      if (href?.startsWith('/')) {
        return (
          <Link to={href} className="inline-flex items-center gap-1 px-2 py-0.5 mt-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border border-yellow-500/30 rounded text-xs font-medium transition-colors no-underline">
            <Settings className="w-3 h-3" />{children}
          </Link>
        )
      }
      return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">{children}</a>
    },
    h1: ({ children }: { children?: React.ReactNode }) => <h1 className="mt-6 mb-3 pt-3 border-t border-border/30 first:border-t-0 first:pt-0 first:mt-0 text-xl font-bold">{children}</h1>,
    h2: ({ children }: { children?: React.ReactNode }) => <h2 className="mt-6 mb-3 pt-3 border-t border-border/30 first:border-t-0 first:pt-0 first:mt-0 text-lg font-bold">{children}</h2>,
    h3: ({ children }: { children?: React.ReactNode }) => <h3 className="mt-5 mb-2 pt-2 border-t border-border/20 first:border-t-0 first:pt-0 first:mt-0 text-base font-semibold">{children}</h3>,
    h4: ({ children }: { children?: React.ReactNode }) => <h4 className="mt-4 mb-2 font-semibold">{children}</h4>,
    h5: ({ children }: { children?: React.ReactNode }) => <h5 className="mt-4 mb-2 font-medium">{children}</h5>,
    h6: ({ children }: { children?: React.ReactNode }) => <h6 className="mt-3 mb-2 font-medium">{children}</h6>,
    p: ({ children }: { children?: React.ReactNode }) => <p className="my-4 leading-relaxed">{children}</p>,
    ul: ({ children }: { children?: React.ReactNode }) => <ul className="my-4 ml-4 list-disc space-y-2">{children}</ul>,
    ol: ({ children }: { children?: React.ReactNode }) => <ol className="my-4 ml-4 list-decimal space-y-2">{children}</ol>,
    li: ({ children }: { children?: React.ReactNode }) => <li className="my-1 leading-relaxed">{children}</li>,
  }), [fontSize])

  const proseClasses = cn(
    "prose prose-invert max-w-none overflow-hidden",
    "prose-pre:my-5 prose-pre:bg-transparent prose-pre:p-0 prose-pre:overflow-x-auto",
    "prose-code:text-purple-300 prose-code:bg-black/20 prose-code:px-1 prose-code:rounded prose-code:break-all",
    "prose-hr:my-6",
    "break-words [word-break:break-word]",
    FONT_SIZE_CLASSES[fontSize],
    msg.role === 'system' ? 'text-yellow-200' : 'text-foreground'
  )

  const agentProvider = useMemo(() => {
    const agent = msg.agent || missionAgent
    switch (agent) {
      case 'claude': return 'anthropic'
      case 'openai': return 'openai'
      case 'gemini': return 'google'
      case 'bob': return 'bob'
      case 'claude-code': return 'anthropic-local'
      default: return agent || 'anthropic'
    }
  }, [msg.agent, missionAgent])

  return (
    <div className={cn('flex gap-3', msg.role === 'user' && 'flex-row-reverse')}>
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
        msg.role === 'user' ? 'bg-primary/20' : msg.role === 'assistant' ? 'bg-purple-500/20' : 'bg-yellow-500/20'
      )}>
        {msg.role === 'user' ? (
          <User className="w-4 h-4 text-primary" />
        ) : msg.role === 'assistant' ? (
          <AgentIcon provider={agentProvider} className="w-4 h-4" />
        ) : (
          <AlertCircle className="w-4 h-4 text-yellow-400" />
        )}
      </div>
      <div className={cn(
        'flex-1 rounded-lg p-3 overflow-hidden min-w-0',
        isFullScreen ? 'max-w-[98%]' : 'max-w-[85%]',
        msg.role === 'user' ? 'bg-primary/10 ml-auto' : msg.role === 'assistant' ? 'bg-secondary/50' : 'bg-yellow-500/10'
      )}>
        {msg.role === 'assistant' || msg.role === 'system' ? (
          parsedContent ? (
            <div className="space-y-4">
              {parsedContent.before && (
                <div className={proseClasses}>
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
                    {parsedContent.before.replace(/\r\n/g, '\n')}
                  </ReactMarkdown>
                </div>
              )}
              <div className="mt-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
                <div className={cn(proseClasses, "text-purple-200")}>
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
                    {parsedContent.request.replace(/\r\n/g, '\n')}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ) : (
            <div className={proseClasses}>
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
                {msg.content.replace(/\r\n/g, '\n')}
              </ReactMarkdown>
            </div>
          )
        ) : (
          <p className={cn("text-foreground whitespace-pre-wrap", FONT_SIZE_CLASSES[fontSize].split(' ')[0])}>{msg.content}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-muted-foreground">
            {msg.timestamp.toLocaleTimeString()}
          </span>
          {/* Show working indicator if this is the last assistant message, mission is running, and content indicates work */}
          {isLastAssistantMessage && missionStatus === 'running' && msg.role === 'assistant' && detectWorkingIndicator(msg.content) && (
            <span className="flex items-center gap-1 text-[10px] text-blue-400 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              {detectWorkingIndicator(msg.content)}...
            </span>
          )}
        </div>
      </div>
    </div>
  )
})

// Extract the last paragraph that contains an input request for highlighting
function extractInputRequestParagraph(content: string): { before: string; request: string } | null {
  const lines = content.split('\n')
  // Look for the last line/paragraph that contains a question
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line && (line.endsWith('?') || /should I|would you|do you want|shall I|please confirm/i.test(line))) {
      return {
        before: lines.slice(0, i).join('\n'),
        request: lines.slice(i).join('\n')
      }
    }
  }
  return null
}

function MissionChat({ mission, isFullScreen = false, fontSize = 'base' as FontSize, onToggleFullScreen }: { mission: Mission; isFullScreen?: boolean; fontSize?: FontSize; onToggleFullScreen?: () => void }) {
  const { sendMessage, cancelMission, rateMission, setActiveMission, dismissMission, selectedAgent } = useMissions()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const lastMessageCountRef = useRef(mission.messages.length)
  // Command history for up/down arrow navigation
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const savedInputRef = useRef('')

  // Save transcript as markdown file
  const saveTranscript = useCallback(() => {
    const lines: string[] = [
      `# Mission: ${mission.title}`,
      '',
      `**Type:** ${mission.type}`,
      `**Status:** ${mission.status}`,
      `**Started:** ${mission.createdAt.toLocaleString()}`,
      mission.agent ? `**Agent:** ${mission.agent}` : '',
      mission.cluster ? `**Cluster:** ${mission.cluster}` : '',
      '',
      '---',
      '',
      '## Conversation',
      '',
    ]

    for (const msg of mission.messages) {
      const timestamp = msg.timestamp.toLocaleString()
      if (msg.role === 'user') {
        lines.push(`### User (${timestamp})`)
        lines.push('')
        lines.push(msg.content)
        lines.push('')
      } else if (msg.role === 'assistant') {
        const agent = msg.agent || mission.agent || 'Assistant'
        lines.push(`### ${agent} (${timestamp})`)
        lines.push('')
        lines.push(msg.content)
        lines.push('')
      } else if (msg.role === 'system') {
        lines.push(`### System (${timestamp})`)
        lines.push('')
        lines.push(`> ${msg.content}`)
        lines.push('')
      }
    }

    const content = lines.filter(l => l !== undefined).join('\n')
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mission-${mission.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().split('T')[0]}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [mission])

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

  // Scroll to bottom when entering full screen mode
  useEffect(() => {
    if (isFullScreen) {
      // Small delay to allow layout to settle
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }, [isFullScreen])

  // Get the original ask (first user message)
  const originalAsk = useMemo(() => {
    const firstUserMsg = mission.messages.find(m => m.role === 'user')
    return firstUserMsg?.content || mission.description
  }, [mission.messages, mission.description])

  // Generate a simple summary based on conversation state
  const conversationSummary = useMemo(() => {
    const userMsgs = mission.messages.filter(m => m.role === 'user')
    const assistantMsgs = mission.messages.filter(m => m.role === 'assistant')
    const lastAssistant = assistantMsgs[assistantMsgs.length - 1]

    // Extract key info from last assistant message
    let keyPoints: string[] = []
    if (lastAssistant) {
      // Look for bullet points or numbered items
      const bullets = lastAssistant.content.match(/^[-•*]\s+.+$/gm) || []
      const numbered = lastAssistant.content.match(/^\d+\.\s+.+$/gm) || []
      keyPoints = [...bullets, ...numbered].slice(0, 3).map(s => s.replace(/^[-•*\d.]\s+/, ''))
    }

    return {
      exchanges: Math.min(userMsgs.length, assistantMsgs.length),
      status: mission.status,
      lastUpdate: mission.updatedAt,
      keyPoints,
      hasToolExecution: assistantMsgs.some(m =>
        m.content.includes('```') && (m.content.includes('kubectl') || m.content.includes('executed'))
      ),
    }
  }, [mission.messages, mission.status, mission.updatedAt])

  const handleSend = () => {
    if (!input.trim()) return
    // Add to command history
    setCommandHistory(prev => [...prev, input.trim()])
    setHistoryIndex(-1)
    savedInputRef.current = ''
    sendMessage(mission.id, input.trim())
    setInput('')
    // Keep focus on input after sending
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    } else if (e.key === 'ArrowUp' && commandHistory.length > 0) {
      // Up arrow shows older commands (going back in history)
      e.preventDefault()
      if (historyIndex === -1) {
        // Save current input before navigating history
        savedInputRef.current = input
        setHistoryIndex(commandHistory.length - 1)
        setInput(commandHistory[commandHistory.length - 1])
      } else if (historyIndex > 0) {
        setHistoryIndex(historyIndex - 1)
        setInput(commandHistory[historyIndex - 1])
      }
    } else if (e.key === 'ArrowDown' && historyIndex !== -1) {
      // Down arrow shows newer commands (going forward in history)
      e.preventDefault()
      if (historyIndex < commandHistory.length - 1) {
        setHistoryIndex(historyIndex + 1)
        setInput(commandHistory[historyIndex + 1])
      } else {
        // Return to saved input
        setHistoryIndex(-1)
        setInput(savedInputRef.current)
      }
    }
    // All other keys (including space) pass through to the input normally
  }

  const config = STATUS_CONFIG[mission.status]
  const StatusIcon = config.icon
  const TypeIcon = TYPE_ICONS[mission.type]

  return (
    <div className={cn("flex flex-1 min-h-0", isFullScreen && "gap-4")}>
      {/* Main chat area */}
      <div className={cn("flex flex-col flex-1 min-h-0", isFullScreen && "max-w-4xl")}>
      {/* Header */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <TypeIcon className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground flex-1 truncate">{mission.title}</h3>
          <button
            onClick={saveTranscript}
            className="p-1 hover:bg-secondary rounded transition-colors"
            title="Save transcript"
          >
            <Download className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => {
              dismissMission(mission.id)
              setActiveMission(null)
            }}
            className="p-1 hover:bg-red-500/20 rounded transition-colors"
            title="Delete mission"
          >
            <Trash2 className="w-4 h-4 text-muted-foreground hover:text-red-400" />
          </button>
          {onToggleFullScreen && !isFullScreen && (
            <button
              onClick={onToggleFullScreen}
              className="p-1 hover:bg-secondary rounded transition-colors"
              title="Expand to full screen"
            >
              <Maximize2 className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
          <div className={cn('flex items-center gap-1', config.color)}>
            <StatusIcon className={cn('w-4 h-4', mission.status === 'running' && 'animate-spin')} />
            <span className="text-xs">{config.label}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground flex-1">{mission.description}</p>
          {mission.agent && (
            <AgentBadge
              provider={
                mission.agent === 'claude' ? 'anthropic' :
                mission.agent === 'openai' ? 'openai' :
                mission.agent === 'gemini' ? 'google' :
                mission.agent === 'bob' ? 'bob' :
                mission.agent === 'claude-code' ? 'anthropic-local' :
                mission.agent // fallback to agent name as provider
              }
              name={mission.agent}
            />
          )}
        </div>
        {mission.cluster && (
          <span className="text-xs text-purple-400 mt-1 inline-block">Cluster: {mission.cluster}</span>
        )}
      </div>

      {/* Messages - using memoized component for better scroll performance */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0"
      >
        {mission.messages.map((msg, index) => {
          // Find if this is the last assistant message
          const isLastAssistantMessage = msg.role === 'assistant' &&
            !mission.messages.slice(index + 1).some(m => m.role === 'assistant')

          return (
            <MemoizedMessage
              key={msg.id}
              msg={msg}
              missionAgent={mission.agent}
              isFullScreen={isFullScreen}
              fontSize={fontSize}
              isLastAssistantMessage={isLastAssistantMessage}
              missionStatus={mission.status}
            />
          )
        })}

        {/* Typing indicator when agent is working - uses currently selected agent */}
        {mission.status === 'running' && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-purple-500/20">
              <AgentIcon
                provider={
                  // Use selectedAgent (currently processing) instead of mission.agent (original)
                  (selectedAgent || mission.agent) === 'claude' ? 'anthropic' :
                  (selectedAgent || mission.agent) === 'openai' ? 'openai' :
                  (selectedAgent || mission.agent) === 'gemini' ? 'google' :
                  (selectedAgent || mission.agent) === 'bob' ? 'bob' :
                  (selectedAgent || mission.agent) === 'claude-code' ? 'anthropic-local' :
                  (selectedAgent || mission.agent || 'anthropic')
                }
                className="w-4 h-4"
              />
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
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type next message..."
                className="flex-1 px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Send (will queue until current response completes)"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-end">
              <button
                onClick={() => cancelMission(mission.id)}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : mission.status === 'completed' ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className={cn('text-sm', config.color)}>{config.label}</span>
              <button
                onClick={() => setActiveMission(null)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="w-3 h-3" />
                Minimize
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
        ) : mission.status === 'failed' ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className={cn(config.color)}>{config.label}</span>
              <span className="text-muted-foreground">Switch agent above and retry</span>
            </div>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Retry with message..."
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

      {/* Right sidebar for full screen mode */}
      {isFullScreen && (
        <div className="w-80 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
          {/* Original Ask */}
          <div className="bg-card border border-border rounded-lg p-4">
            <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              Original Request
            </h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {originalAsk}
            </p>
          </div>

          {/* AI Summary */}
          <div className="bg-card border border-border rounded-lg p-4">
            <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              Summary
            </h4>
            <div className="space-y-3">
              {/* Status */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <span className={cn('font-medium', STATUS_CONFIG[mission.status].color)}>
                  {STATUS_CONFIG[mission.status].label}
                </span>
              </div>

              {/* Exchanges */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Exchanges</span>
                <span className="text-foreground">{conversationSummary.exchanges}</span>
              </div>

              {/* Tool Execution */}
              {conversationSummary.hasToolExecution && (
                <div className="flex items-center gap-2 text-sm text-green-400">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Commands executed</span>
                </div>
              )}

              {/* Key Points */}
              {conversationSummary.keyPoints.length > 0 && (
                <div className="pt-2 border-t border-border/50">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Key Points</span>
                  <ul className="mt-2 space-y-1">
                    {conversationSummary.keyPoints.map((point, i) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-2">
                        <span className="text-purple-400 mt-0.5">•</span>
                        <span className="line-clamp-2">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Last Update */}
              <div className="text-[10px] text-muted-foreground/70 pt-2 border-t border-border/50">
                Last updated: {conversationSummary.lastUpdate.toLocaleTimeString()}
              </div>
            </div>
          </div>

          {/* Mission Info */}
          <div className="bg-card border border-border rounded-lg p-4">
            <h4 className="text-sm font-semibold text-foreground mb-3">Mission Details</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="text-foreground capitalize">{mission.type}</span>
              </div>
              {mission.cluster && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Cluster</span>
                  <span className="text-purple-400">{mission.cluster}</span>
                </div>
              )}
              {mission.agent && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Agent</span>
                  <span className="text-foreground">{mission.agent}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Started</span>
                <span className="text-foreground text-xs">{mission.createdAt.toLocaleString()}</span>
              </div>
              {mission.tokenUsage && mission.tokenUsage.total > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Tokens</span>
                  <span className="text-foreground font-mono text-xs">{mission.tokenUsage.total.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function MissionSidebar() {
  const { missions, activeMission, isSidebarOpen, isSidebarMinimized, isFullScreen, setActiveMission, closeSidebar, dismissMission, minimizeSidebar, expandSidebar, setFullScreen, selectedAgent } = useMissions()
  const [collapsedMissions, setCollapsedMissions] = useState<Set<string>>(new Set())
  const [fontSize, setFontSize] = useState<FontSize>('base')

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

  // Helper to get provider string for AgentIcon
  const getAgentProvider = (agent: string | null | undefined) => {
    switch (agent) {
      case 'claude': return 'anthropic'
      case 'openai': return 'openai'
      case 'gemini': return 'google'
      case 'bob': return 'bob'
      case 'claude-code': return 'anthropic-local'
      default: return agent || 'anthropic'
    }
  }

  if (!isSidebarOpen) {
    return null
  }

  // Minimized sidebar view (thin strip)
  if (isSidebarMinimized) {
    return (
      <div className="fixed top-20 right-4 bottom-4 w-12 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-xl z-40 flex flex-col items-center py-4">
        <button
          onClick={expandSidebar}
          className="p-2 hover:bg-secondary rounded transition-colors mb-4"
          title="Expand sidebar"
        >
          <PanelRightOpen className="w-5 h-5 text-muted-foreground" />
        </button>

        <div className="flex flex-col items-center gap-2">
          <AgentIcon provider={getAgentProvider(selectedAgent)} className="w-5 h-5 text-primary" />
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
    <div
      data-tour="ai-missions"
      className={cn(
        "fixed bg-card/95 backdrop-blur-sm border-border z-40 flex flex-col overflow-hidden rounded-lg",
        // Use separate transitions for smoother animation
        "transition-[width,top,border] duration-300",
        isFullScreen
          ? "inset-0 top-16 border-l-0 rounded-none"
          : "top-20 right-4 bottom-4 w-[520px] border shadow-xl"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <AgentIcon provider={getAgentProvider(selectedAgent)} className="w-5 h-5" />
          <h2 className="font-semibold text-foreground">AI Missions</h2>
          {needsAttention > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded-full">
              {needsAttention}
            </span>
          )}
        </div>
        {/* Agent Selector */}
        <div className="flex items-center gap-2">
          <AgentSelector compact={!isFullScreen} />
          {/* Font size controls */}
          <div className="flex items-center gap-1 border border-border rounded-lg px-1">
            <button
              onClick={() => setFontSize(prev => prev === 'base' ? 'sm' : prev === 'lg' ? 'base' : 'sm')}
              disabled={fontSize === 'sm'}
              className="p-1 hover:bg-secondary rounded transition-colors disabled:opacity-30"
              title="Decrease font size"
            >
              <Minus className="w-3 h-3 text-muted-foreground" />
            </button>
            <Type className="w-3 h-3 text-muted-foreground" />
            <button
              onClick={() => setFontSize(prev => prev === 'sm' ? 'base' : prev === 'base' ? 'lg' : 'lg')}
              disabled={fontSize === 'lg'}
              className="p-1 hover:bg-secondary rounded transition-colors disabled:opacity-30"
              title="Increase font size"
            >
              <Plus className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
          {isFullScreen ? (
            <button
              onClick={() => setFullScreen(false)}
              className="p-1 hover:bg-secondary rounded transition-colors"
              title="Exit full screen"
            >
              <Minimize2 className="w-5 h-5 text-muted-foreground" />
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
          <AgentIcon provider={getAgentProvider(selectedAgent)} className="w-12 h-12 opacity-50 mb-4" />
          <p className="text-muted-foreground">No active missions</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Start a mission from any card's AI action
          </p>
        </div>
      ) : activeMission ? (
        <div className={cn(
          "flex-1 flex flex-col min-h-0",
          isFullScreen && "max-w-6xl mx-auto w-full"
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
          <MissionChat mission={activeMission} isFullScreen={isFullScreen} fontSize={fontSize} onToggleFullScreen={() => setFullScreen(true)} />
        </div>
      ) : (
        <div className={cn(
          "flex-1 overflow-y-auto p-2 space-y-2",
          isFullScreen && "max-w-2xl mx-auto w-full"
        )}>
          {[...missions].reverse().map((mission) => (
            <MissionListItem
              key={mission.id}
              mission={mission}
              isActive={false}
              onClick={() => setActiveMission(mission.id)}
              onDismiss={() => dismissMission(mission.id)}
              onExpand={() => { setActiveMission(mission.id); setFullScreen(true) }}
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
  const { missions, isSidebarOpen, openSidebar, selectedAgent } = useMissions()

  const needsAttention = missions.filter(m =>
    m.status === 'waiting_input' || m.status === 'failed'
  ).length

  const runningCount = missions.filter(m => m.status === 'running').length

  // Helper to get provider string for AgentIcon
  const getAgentProvider = (agent: string | null | undefined) => {
    switch (agent) {
      case 'claude': return 'anthropic'
      case 'openai': return 'openai'
      case 'gemini': return 'google'
      case 'bob': return 'bob'
      case 'claude-code': return 'anthropic-local'
      default: return agent || 'anthropic'
    }
  }

  // Always show toggle when sidebar is closed (even with no missions)
  if (isSidebarOpen) {
    return null
  }

  return (
    <button
      onClick={openSidebar}
      data-tour="ai-missions"
      className={cn(
        'fixed right-4 bottom-4 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg transition-all z-50',
        needsAttention > 0
          ? 'bg-purple-500 text-white animate-pulse'
          : 'bg-card border border-border text-foreground hover:bg-secondary'
      )}
      title="Open AI Missions"
    >
      <AgentIcon provider={getAgentProvider(selectedAgent)} className="w-5 h-5" />
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
