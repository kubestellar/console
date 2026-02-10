import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Send,
  ChevronLeft,
  CheckCircle,
  MessageSquare,
  Trash2,
  Download,
  BookOpen,
  Save,
  Maximize2,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react'
import { useMissions, type Mission } from '../../../hooks/useMissions'
import { useResolutions, detectIssueSignature, type Resolution } from '../../../hooks/useResolutions'
import { cn } from '../../../lib/cn'
import { AgentBadge, AgentIcon } from '../../agent/AgentIcon'
import { ResolutionKnowledgePanel } from '../../missions/ResolutionKnowledgePanel'
import { ResolutionHistoryPanel } from '../../missions/ResolutionHistoryPanel'
import { SaveResolutionDialog } from '../../missions/SaveResolutionDialog'
import { STATUS_CONFIG, TYPE_ICONS } from './types'
import type { FontSize } from './types'
import { TypingIndicator } from './TypingIndicator'
import { MemoizedMessage } from './MemoizedMessage'

export function MissionChat({ mission, isFullScreen = false, fontSize = 'base' as FontSize, onToggleFullScreen }: { mission: Mission; isFullScreen?: boolean; fontSize?: FontSize; onToggleFullScreen?: () => void }) {
  const { sendMessage, cancelMission, rateMission, setActiveMission, dismissMission, selectedAgent } = useMissions()
  const { findSimilarResolutions, recordUsage, allResolutions } = useResolutions()
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
  // Resolution memory state
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [appliedResolutionId, setAppliedResolutionId] = useState<string | null>(null)
  const [resolutionPanelView, setResolutionPanelView] = useState<'related' | 'history'>('related')

  // Find related resolutions based on mission content
  const relatedResolutions = useMemo(() => {
    const content = [
      mission.title,
      mission.description,
      ...mission.messages.slice(0, 3).map(m => m.content), // First few messages
    ].join('\n')

    const signature = detectIssueSignature(content)
    if (!signature.type || signature.type === 'Unknown') {
      return []
    }

    return findSimilarResolutions(signature as { type: string }, { minSimilarity: 0.4, limit: 5 })
  }, [mission.title, mission.description, mission.messages, findSimilarResolutions])

  // Handle applying a resolution
  const handleApplyResolution = useCallback((resolution: Resolution) => {
    setAppliedResolutionId(resolution.id)
    // Inject the resolution into the chat as a user message
    const applyMessage = `Please apply this saved resolution:\n\n**${resolution.title}**\n\n${resolution.resolution.summary}\n\nSteps:\n${resolution.resolution.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}${resolution.resolution.yaml ? `\n\nYAML:\n\`\`\`yaml\n${resolution.resolution.yaml}\n\`\`\`` : ''}`
    sendMessage(mission.id, applyMessage)
  }, [mission.id, sendMessage])

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
      const bullets = lastAssistant.content.match(/^[-\u2022*]\s+.+$/gm) || []
      const numbered = lastAssistant.content.match(/^\d+\.\s+.+$/gm) || []
      keyPoints = [...bullets, ...numbered].slice(0, 3).map(s => s.replace(/^[-\u2022*\d.]\s+/, ''))
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
    <>
    <div className={cn("flex flex-1 min-h-0", isFullScreen && "gap-4")}>
      {/* Left panel for resolutions (fullscreen only) */}
      {isFullScreen && (
        <div className="flex flex-col">
          {/* Panel toggle */}
          <div className="flex mb-2 bg-secondary/50 rounded-lg p-0.5">
            <button
              onClick={() => setResolutionPanelView('related')}
              className={cn(
                "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5",
                resolutionPanelView === 'related'
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Related
              {relatedResolutions.length > 0 && (
                <span className={cn(
                  "px-1.5 py-0.5 text-[10px] rounded-full",
                  resolutionPanelView === 'related'
                    ? "bg-green-500/20 text-green-400"
                    : "bg-muted text-muted-foreground"
                )}>
                  {relatedResolutions.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setResolutionPanelView('history')}
              className={cn(
                "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5",
                resolutionPanelView === 'history'
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              All Saved
              {allResolutions.length > 0 && (
                <span className={cn(
                  "px-1.5 py-0.5 text-[10px] rounded-full",
                  resolutionPanelView === 'history'
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                )}>
                  {allResolutions.length}
                </span>
              )}
            </button>
          </div>
          {/* Panel content */}
          {resolutionPanelView === 'related' ? (
            <ResolutionKnowledgePanel
              relatedResolutions={relatedResolutions}
              onApplyResolution={handleApplyResolution}
              onSaveNewResolution={() => setShowSaveDialog(true)}
            />
          ) : (
            <ResolutionHistoryPanel
              onApplyResolution={handleApplyResolution}
            />
          )}
        </div>
      )}

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
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

      {/* Related Knowledge Banner (non-fullscreen only) */}
      {!isFullScreen && relatedResolutions.length > 0 && (
        <div className="px-4 py-2 bg-purple-500/10 border-b border-purple-500/20 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <BookOpen className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-purple-300">
                {relatedResolutions.length} similar resolution{relatedResolutions.length !== 1 ? 's' : ''} found
              </span>
            </div>
            {onToggleFullScreen && (
              <button
                onClick={onToggleFullScreen}
                className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-1"
              >
                View in fullscreen
                <Maximize2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Messages - using memoized component for better scroll performance */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scroll-enhanced p-4 space-y-4 min-h-0"
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
            {/* Conversational completion message */}
            <div className="bg-secondary/30 border border-border rounded-lg p-3">
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground mb-2">
                    {mission.type === 'troubleshoot'
                      ? "I've completed my diagnosis. Did this help resolve your issue?"
                      : mission.type === 'deploy' || mission.type === 'repair'
                      ? "The operation is complete. Did everything work as expected?"
                      : "Mission complete! Was this information helpful?"}
                  </p>

                  {/* Feedback buttons - only show if no feedback yet */}
                  {!mission.feedback && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          rateMission(mission.id, 'positive')
                          if (appliedResolutionId) {
                            recordUsage(appliedResolutionId, true)
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg transition-colors"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        Yes, helpful
                      </button>
                      <button
                        onClick={() => {
                          rateMission(mission.id, 'negative')
                          if (appliedResolutionId) {
                            recordUsage(appliedResolutionId, false)
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 text-muted-foreground border border-border rounded-lg transition-colors"
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                        Not really
                      </button>
                    </div>
                  )}

                  {/* Save prompt after positive feedback */}
                  {mission.feedback === 'positive' && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <p className="text-sm text-foreground mb-2">
                        Great! Would you like to save this resolution? It'll help you (and your team) solve similar issues faster next time.
                      </p>
                      <button
                        onClick={() => setShowSaveDialog(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-lg transition-colors"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Save Resolution
                      </button>
                    </div>
                  )}

                  {/* Thank you after negative feedback */}
                  {mission.feedback === 'negative' && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground">
                        Thanks for the feedback. Try a different approach or switch to another agent above.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => setActiveMission(null)}
              className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-3 h-3" />
              Back to missions
            </button>
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
        <div className="w-80 flex-shrink-0 flex flex-col gap-4 overflow-y-auto scroll-enhanced">
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
                        <span className="text-purple-400 mt-0.5">&bull;</span>
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

    {/* Save Resolution Dialog */}
    <SaveResolutionDialog
      mission={mission}
      isOpen={showSaveDialog}
      onClose={() => setShowSaveDialog(false)}
      onSaved={() => {
        // Could show a toast notification here
      }}
    />
    </>
  )
}
