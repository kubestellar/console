import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
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
  Play,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Pencil,
  Check,
  X,
  RotateCcw,
  StopCircle,
  ListChecks,
  Loader2 } from 'lucide-react'
import { useMissions, type Mission } from '../../../hooks/useMissions'
import { useAuth } from '../../../lib/auth'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { isNetlifyDeployment } from '../../../lib/demoMode'
import { useResolutions, detectIssueSignature } from '../../../hooks/useResolutions'
import { cn } from '../../../lib/cn'
import { ConfirmDialog } from '../../../lib/modals'
import { MAX_MESSAGE_SIZE_CHARS } from '../../../lib/constants'
import { AgentBadge, AgentIcon } from '../../agent/AgentIcon'
import { PreflightFailure } from '../../missions/PreflightFailure'
import { SaveResolutionDialog } from '../../missions/SaveResolutionDialog'
import { SetupInstructionsDialog } from '../../setup/SetupInstructionsDialog'
import { OrbitSetupOffer } from '../../missions/OrbitSetupOffer'
import { STATUS_CONFIG, TYPE_ICONS } from './types'
import type { FontSize } from './types'
import { TypingIndicator } from './TypingIndicator'
import { MemoizedMessage } from './MemoizedMessage'

export function MissionChat({ mission, isFullScreen = false, fontSize = 'base' as FontSize, onToggleFullScreen }: { mission: Mission; isFullScreen?: boolean; fontSize?: FontSize; onToggleFullScreen?: () => void }) {
  const { t } = useTranslation('common')
  const { sendMessage, retryPreflight, cancelMission, rateMission, setActiveMission, dismissMission, renameMission, runSavedMission, updateSavedMission, selectedAgent } = useMissions()
  const { user } = useAuth()
  const { isDemoMode } = useDemoMode()
  const { findSimilarResolutions, recordUsage } = useResolutions()
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
  const [appliedResolutionId] = useState<string | null>(null)
  const [showSetupDialog, setShowSetupDialog] = useState(false)
  // Message validation error (e.g. too long)
  const [inputError, setInputError] = useState<string | null>(null)
  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Pre-run editing state — lets users tweak description/steps before executing
  const isSavedPreRun = mission.status === 'saved' && mission.messages.length === 0
  const [isEditingMission, setIsEditingMission] = useState(false)
  const [editDescription, setEditDescription] = useState(mission.description)
  const [editSteps, setEditSteps] = useState<Array<{ title: string; description: string }>>(
    () => (mission.importedFrom?.steps || []).map(s => ({ title: s.title, description: s.description }))
  )
  const descriptionRef = useRef<HTMLTextAreaElement>(null)

  // Reset editing state when switching to a different mission.
  // We intentionally only depend on mission.id — we want to reset the form
  // when the user navigates to a different mission, not on every description
  // update (which would discard in-progress edits).
  useEffect(() => {
    setEditDescription(mission.description)
    setEditSteps((mission.importedFrom?.steps || []).map(s => ({ title: s.title, description: s.description })))
    setIsEditingMission(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission.id])

  /** Persist edits and exit editing mode */
  const saveEdits = () => {
    updateSavedMission(mission.id, {
      description: editDescription.trim(),
      steps: editSteps.map(s => ({ title: s.title.trim(), description: s.description.trim() })) })
    setIsEditingMission(false)
  }

  /** Discard edits and exit editing mode */
  const cancelEdits = () => {
    setEditDescription(mission.description)
    setEditSteps((mission.importedFrom?.steps || []).map(s => ({ title: s.title, description: s.description })))
    setIsEditingMission(false)
  }

  /** Update a single step's field */
  const updateStep = (idx: number, field: 'title' | 'description', value: string) => {
    setEditSteps(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  // Find related resolutions based on mission content
  const relatedResolutions = (() => {
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
  })()

  // Save transcript as markdown file
  const saveTranscript = () => {
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
  }

  // Check if user is at bottom of scroll container
  const isAtBottom = () => {
    const container = messagesContainerRef.current
    if (!container) return true
    const threshold = 50 // pixels from bottom to consider "at bottom"
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold
  }

  // Handle scroll events to detect user scrolling
  const handleScroll = () => {
    setShouldAutoScroll(isAtBottom())
  }

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

  // Auto-open setup dialog when agent connection error occurs
  useEffect(() => {
    const lastMsg = mission.messages[mission.messages.length - 1]
    if (lastMsg?.role === 'system' && lastMsg.content.includes('Local Agent Not Connected')) {
      setShowSetupDialog(true)
    }
  }, [mission.messages])

  // Scroll to bottom when entering full screen mode
  useEffect(() => {
    if (isFullScreen) {
      // Small delay to allow layout to settle
      const id = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
      return () => clearTimeout(id)
    }
  }, [isFullScreen])

  // Get the original ask (first user message)
  const originalAsk = (() => {
    const firstUserMsg = mission.messages.find(m => m.role === 'user')
    return firstUserMsg?.content || mission.description
  })()

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
      ) }
  }, [mission.messages, mission.status, mission.updatedAt])

  /** Maximum allowed length for mission titles */
  const MAX_TITLE_LENGTH = 80

  /** Start inline title editing */
  const startEditingTitle = () => {
    setEditTitleValue(mission.title)
    setIsEditingTitle(true)
    // Focus the input after React renders it
    requestAnimationFrame(() => titleInputRef.current?.select())
  }

  /** Save the edited title */
  const saveTitle = () => {
    const trimmed = editTitleValue.trim()
    if (trimmed.length > 0 && trimmed.length <= MAX_TITLE_LENGTH && trimmed !== mission.title) {
      renameMission(mission.id, trimmed)
    }
    setIsEditingTitle(false)
  }

  /** Cancel title editing */
  const cancelEditTitle = () => {
    setIsEditingTitle(false)
    setEditTitleValue('')
  }

  /** Handle keyboard events in the title input */
  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveTitle()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEditTitle()
    }
  }

  const handleSend = () => {
    if (!input.trim()) return
    // Validate message size before sending
    if (input.length > MAX_MESSAGE_SIZE_CHARS) {
      setInputError(
        t('missionChat.messageTooLong', {
          current: input.length.toLocaleString(),
          max: MAX_MESSAGE_SIZE_CHARS.toLocaleString(),
          defaultValue: `Message is too long ({{current}} characters). Maximum is {{max}} characters.` })
      )
      return
    }
    // Add to command history
    setCommandHistory(prev => [...prev, input.trim()])
    setHistoryIndex(-1)
    savedInputRef.current = ''
    sendMessage(mission.id, input.trim())
    setInput('')
    // Keep focus on input after sending
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleRetryMission = () => {
    // Find the last user message in the conversation (the one that failed)
    const lastUserMessage = [...mission.messages].reverse().find(m => m.role === 'user')
    const prompt = lastUserMessage?.content || ''
    if (!prompt.trim()) return
    sendMessage(mission.id, prompt)
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

  const config = STATUS_CONFIG[mission.status] || STATUS_CONFIG.pending
  const StatusIcon = config.icon
  const TypeIcon = TYPE_ICONS[mission.type] || TYPE_ICONS.custom

  return (
    <>
    <div className={cn("flex flex-1 min-h-0 min-w-0")}>
      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
      {/* Header */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <TypeIcon className="w-5 h-5 text-primary" />
          {isEditingTitle ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <input
                ref={titleInputRef}
                type="text"
                value={editTitleValue}
                onChange={(e) => setEditTitleValue(e.target.value.slice(0, MAX_TITLE_LENGTH))}
                onKeyDown={handleTitleKeyDown}
                onBlur={saveTitle}
                maxLength={MAX_TITLE_LENGTH}
                className="flex-1 min-w-0 px-2 py-0.5 text-sm font-semibold bg-secondary/50 border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid="mission-title-input"
              />
              <button
                onClick={saveTitle}
                onMouseDown={(e) => e.preventDefault()}
                className="p-0.5 hover:bg-green-500/20 rounded transition-colors"
                title={t('common.save', { defaultValue: 'Save' })}
              >
                <Check className="w-3.5 h-3.5 text-green-400" />
              </button>
              <button
                onClick={cancelEditTitle}
                onMouseDown={(e) => e.preventDefault()}
                className="p-0.5 hover:bg-red-500/20 rounded transition-colors"
                title={t('common.cancel', { defaultValue: 'Cancel' })}
              >
                <X className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 flex-1 min-w-0 group">
              <h3 className="font-semibold text-foreground flex-1 truncate">{mission.title}</h3>
              <button
                onClick={startEditingTitle}
                className="p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100 hover:bg-secondary"
                title={t('missionChat.renameTitle', { defaultValue: 'Rename mission' })}
                data-testid="mission-title-edit-btn"
              >
                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          )}
          <button
            onClick={saveTranscript}
            className="p-1 hover:bg-secondary rounded transition-colors"
            title={t('layout.missionSidebar.saveTranscript')}
          >
            <Download className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1 hover:bg-red-500/20 rounded transition-colors"
            title={t('layout.missionSidebar.deleteMission')}
          >
            <Trash2 className="w-4 h-4 text-muted-foreground hover:text-red-400" />
          </button>
          {onToggleFullScreen && !isFullScreen && (
            <button
              onClick={onToggleFullScreen}
              className="p-1 hover:bg-secondary rounded transition-colors"
              title={t('layout.missionSidebar.expandToFullScreen')}
            >
              <Maximize2 className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
          {mission.status === 'running' && (
            <button
              onClick={() => cancelMission(mission.id)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 rounded-lg transition-colors"
              title={t('missionChat.terminateSession', { defaultValue: 'Terminate Session' })}
              data-testid="terminate-session-btn"
            >
              <StopCircle className="w-3.5 h-3.5" />
              {t('missionChat.terminateSession', { defaultValue: 'Terminate Session' })}
            </button>
          )}
          <div className={cn('flex items-center gap-1', config.color)}>
            <StatusIcon className={cn('w-4 h-4', (mission.status === 'running' || mission.status === 'cancelling') && 'animate-spin')} />
            <span className="text-xs">{config.label}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground flex-1 line-clamp-2">{mission.description}</p>
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
                {t('missionChat.similarResolutionsFound', { count: relatedResolutions.length })}
              </span>
            </div>
            {onToggleFullScreen && (
              <button
                onClick={onToggleFullScreen}
                className="text-2xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
              >
                {t('missionChat.viewInFullscreen')}
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
        className="flex-1 overflow-y-auto scroll-enhanced p-4 space-y-4 min-h-0 min-w-0"
      >
        {/* Inline Run button + editable mission description/steps for saved missions (#3917, #4273) */}
        {isSavedPreRun && (
          <div
            className="flex flex-col gap-4 py-4"
            tabIndex={0}
            onKeyDown={(e) => {
              // Enter (without modifier) on the container triggers Run when not editing
              if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey && !isEditingMission) {
                // Only handle if the target is the container itself (not a child input/textarea)
                const tag = (e.target as HTMLElement).tagName
                if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
                  e.preventDefault()
                  if (isNetlifyDeployment) {
                    window.dispatchEvent(new CustomEvent('open-install'))
                  } else if (isDemoMode) {
                    window.dispatchEvent(new CustomEvent('open-agent-setup'))
                  } else {
                    runSavedMission(mission.id)
                  }
                }
              }
            }}
            data-testid="saved-mission-prerun"
          >
            {/* Action buttons: Run + Edit toggle + Back */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (isNetlifyDeployment) {
                      window.dispatchEvent(new CustomEvent('open-install'))
                    } else if (isDemoMode) {
                      window.dispatchEvent(new CustomEvent('open-agent-setup'))
                    } else {
                      // Persist any pending edits before running
                      if (isEditingMission) saveEdits()
                      runSavedMission(mission.id)
                    }
                  }}
                  className="flex items-center justify-center gap-2 px-8 py-3 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  data-testid="run-mission-btn"
                >
                  <Play className="w-4 h-4" />
                  {t('missionChat.runMission', { defaultValue: 'Run Mission' })}
                </button>
                {!isEditingMission && (
                  <button
                    onClick={() => {
                      setIsEditingMission(true)
                      // Focus the description textarea on next frame
                      requestAnimationFrame(() => descriptionRef.current?.focus())
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border border-border rounded-lg hover:bg-secondary/50 transition-all"
                    title={t('missionChat.editBeforeRunning', { defaultValue: 'Edit before running' })}
                    data-testid="edit-mission-btn"
                  >
                    <Pencil className="w-4 h-4" />
                    {t('missionChat.edit', { defaultValue: 'Edit' })}
                  </button>
                )}
                {isEditingMission && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={saveEdits}
                      className="flex items-center justify-center gap-1 px-3 py-3 text-sm font-medium text-green-400 border border-green-500/30 rounded-lg hover:bg-green-500/10 transition-all"
                      title={t('common.save', { defaultValue: 'Save' })}
                      data-testid="save-mission-edits-btn"
                    >
                      <Check className="w-4 h-4" />
                      {t('common.save', { defaultValue: 'Save' })}
                    </button>
                    <button
                      onClick={cancelEdits}
                      className="flex items-center justify-center gap-1 px-3 py-3 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-secondary/50 transition-all"
                      title={t('common.cancel', { defaultValue: 'Cancel' })}
                      data-testid="cancel-mission-edits-btn"
                    >
                      <X className="w-4 h-4" />
                      {t('common.cancel', { defaultValue: 'Cancel' })}
                    </button>
                  </div>
                )}
              </div>
              <p className="text-2xs text-muted-foreground">
                {isEditingMission
                  ? t('missionChat.editHint', { defaultValue: 'Edit the description and steps below, then Run or press Enter' })
                  : t('missionChat.runHint', { defaultValue: 'Press Enter to run, or Edit to customize first' })}
              </p>
              <button
                onClick={() => setActiveMission(null)}
                className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="w-3 h-3" />
                {t('missionChat.backToMissions')}
              </button>
            </div>

            {/* Editable description */}
            {isEditingMission ? (
              <div className="mx-1 rounded-lg border border-primary/30 bg-secondary/30 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-secondary/50">
                  <Pencil className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">
                    {t('missionChat.missionDescription', { defaultValue: 'Mission Description' })}
                  </span>
                </div>
                <div className="p-2">
                  <textarea
                    ref={descriptionRef}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        saveEdits()
                        runSavedMission(mission.id)
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        cancelEdits()
                      }
                    }}
                    className="w-full min-h-[60px] p-2 text-sm bg-background border border-border rounded-md resize-y focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
                    placeholder={t('missionChat.descriptionPlaceholder', { defaultValue: 'Describe what this mission should do...' })}
                    data-testid="edit-mission-description"
                  />
                </div>
              </div>
            ) : (
              mission.description && (
                <div className="mx-1 px-3 py-2 text-sm text-muted-foreground whitespace-pre-wrap rounded-lg bg-secondary/20 border border-border/50">
                  {mission.description}
                </div>
              )
            )}

            {/* Mission steps — editable or read-only */}
            {((isEditingMission && editSteps.length > 0) ||
              (!isEditingMission && mission.importedFrom?.steps && mission.importedFrom.steps.length > 0)) && (
              <div className={cn(
                'mx-1 rounded-lg border bg-secondary/30 overflow-hidden',
                isEditingMission ? 'border-primary/30' : 'border-border',
              )}>
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-secondary/50">
                  <ListChecks className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-semibold text-foreground">
                    {t('missionChat.missionSteps', { defaultValue: 'Mission Steps' })}
                  </span>
                  <span className="ml-auto text-2xs text-muted-foreground">
                    {isEditingMission
                      ? editSteps.length
                      : (mission.importedFrom?.steps || []).length}{' '}
                    {((isEditingMission ? editSteps.length : (mission.importedFrom?.steps || []).length) === 1) ? 'step' : 'steps'}
                  </span>
                </div>
                <div className="p-2 space-y-2 max-h-[50vh] overflow-y-auto scroll-enhanced">
                  {isEditingMission
                    ? editSteps.map((step, idx) => (
                        <div
                          key={idx}
                          className="flex gap-2.5 p-2.5 rounded-md bg-background/50 border border-primary/20"
                        >
                          <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-purple-500/20 text-purple-400 text-2xs font-bold mt-1">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0 space-y-1">
                            <input
                              type="text"
                              value={step.title}
                              onChange={(e) => updateStep(idx, 'title', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                  e.preventDefault()
                                  saveEdits()
                                  runSavedMission(mission.id)
                                } else if (e.key === 'Escape') {
                                  e.preventDefault()
                                  cancelEdits()
                                }
                              }}
                              className="w-full px-2 py-1 text-sm font-medium bg-background border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                              placeholder={t('missionChat.stepTitlePlaceholder', { defaultValue: 'Step title...' })}
                              data-testid={`edit-step-title-${idx}`}
                            />
                            <textarea
                              value={step.description}
                              onChange={(e) => updateStep(idx, 'description', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                  e.preventDefault()
                                  saveEdits()
                                  runSavedMission(mission.id)
                                } else if (e.key === 'Escape') {
                                  e.preventDefault()
                                  cancelEdits()
                                }
                              }}
                              className="w-full px-2 py-1 text-xs bg-background border border-border rounded text-muted-foreground resize-y min-h-[40px] focus:outline-none focus:ring-1 focus:ring-primary/50"
                              placeholder={t('missionChat.stepDescPlaceholder', { defaultValue: 'Step description...' })}
                              data-testid={`edit-step-desc-${idx}`}
                            />
                          </div>
                        </div>
                      ))
                    : (mission.importedFrom?.steps || []).map((step, idx) => (
                        <div
                          key={idx}
                          className="flex gap-2.5 p-2.5 rounded-md bg-background/50 border border-border/50"
                        >
                          <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-purple-500/20 text-purple-400 text-2xs font-bold">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{step.title}</p>
                            {step.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3 whitespace-pre-wrap">{step.description}</p>
                            )}
                          </div>
                        </div>
                      ))}
                </div>
              </div>
            )}
          </div>
        )}

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
              userAvatarUrl={user?.avatar_url}
            />
          )
        })}

        {/* Preflight failure panel when mission is blocked (#3742) */}
        {mission.status === 'blocked' && mission.preflightError && (
          <div className="px-1">
            <PreflightFailure
              error={mission.preflightError}
              context={mission.cluster}
              onRetry={() => retryPreflight(mission.id)}
            />
          </div>
        )}

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
                <span className="text-2xs text-muted-foreground/70 font-mono">
                  {mission.tokenUsage.total.toLocaleString()} tokens
                </span>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input / Actions — hidden when Run button is inline above */}
      {!isSavedPreRun && (
      <div className="p-4 border-t border-border flex-shrink-0 bg-card min-w-0">
        {mission.status === 'cancelling' ? (
          <div className="flex items-center justify-center gap-2 py-3">
            <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
            <span className="text-sm text-orange-400">Cancelling mission...</span>
          </div>
        ) : mission.status === 'running' ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => { setInput(e.target.value); setInputError(null) }}
                onKeyDown={handleKeyDown}
                placeholder={t('missionChat.typeNextMessage')}
                className="flex-1 min-w-0 px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="flex-shrink-0 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
                title={t('missionChat.sendWillQueue')}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-end">
              <button
                onClick={() => cancelMission(mission.id)}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                data-testid="terminate-session-inline-btn"
              >
                <StopCircle className="w-3 h-3" />
                {t('missionChat.terminateSession', { defaultValue: 'Terminate Session' })}
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
                      ? t('missionChat.completedDiagnosis')
                      : mission.type === 'deploy' || mission.type === 'repair'
                      ? t('missionChat.operationComplete')
                      : t('missionChat.missionComplete')}
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
                        {t('missionChat.yesHelpful')}
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
                        {t('missionChat.notReally')}
                      </button>
                    </div>
                  )}

                  {/* Save prompt after positive feedback */}
                  {mission.feedback === 'positive' && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <p className="text-sm text-foreground mb-2">
                        {t('missionChat.saveResolutionPrompt')}
                      </p>
                      <button
                        onClick={() => setShowSaveDialog(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-lg transition-colors"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {t('missionChat.saveResolution')}
                      </button>
                    </div>
                  )}

                  {/* Thank you after negative feedback */}
                  {mission.feedback === 'negative' && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground">
                        {t('missionChat.thanksFeedback')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Orbit Setup Offer — shown after install/deploy missions complete */}
            {(mission.importedFrom?.missionClass === 'install' || mission.type === 'deploy') && (
              <OrbitSetupOffer
                projects={mission.importedFrom?.cncfProject
                  ? [{ name: mission.importedFrom.cncfProject, cncfProject: mission.importedFrom.cncfProject, category: (mission.context?.category as string) }]
                  : [{ name: mission.title, category: (mission.context?.category as string) }]}
                clusters={mission.cluster ? [mission.cluster] : []}
                onCreateOrbit={() => {/* handled internally by OrbitSetupOffer */}}
                onDashboardCreated={() => {/* navigation handled internally */}}
                onSkip={() => {/* dismiss is internal */}}
              />
            )}

            <button
              onClick={() => setActiveMission(null)}
              className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-3 h-3" />
              {t('missionChat.backToMissions')}
            </button>
          </div>
        ) : mission.status === 'blocked' ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-amber-400">{config.label}</span>
              <span className="text-muted-foreground">Fix the issue above, then retry</span>
            </div>
            <button
              onClick={() => retryPreflight(mission.id)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold bg-amber-600/20 text-amber-300 border border-amber-500/30 rounded-lg hover:bg-amber-600/30 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Retry Preflight Check
            </button>
            <button
              onClick={() => dismissMission(mission.id)}
              className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
              Dismiss Mission
            </button>
          </div>
        ) : mission.status === 'failed' ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className={cn(config.color)}>{config.label}</span>
              <span className="text-muted-foreground">{t('missionChat.switchAgentRetry')}</span>
            </div>
            {mission.messages.some(m => m.role === 'user') && (
              <button
                onClick={handleRetryMission}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                {t('missionChat.retryMission', { defaultValue: 'Retry Mission' })}
              </button>
            )}
            <div className="flex gap-2 min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => { setInput(e.target.value); setInputError(null) }}
                onKeyDown={handleKeyDown}
                placeholder={t('missionChat.retryWithMessage')}
                className="flex-1 min-w-0 px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="flex-shrink-0 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => setActiveMission(null)}
              className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-3 h-3" />
              {t('missionChat.backToMissions')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => { setInput(e.target.value); setInputError(null) }}
                onKeyDown={handleKeyDown}
                placeholder={t('missionChat.typeMessage')}
                className="flex-1 min-w-0 px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="flex-shrink-0 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => setActiveMission(null)}
              className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-3 h-3" />
              {t('missionChat.backToMissions')}
            </button>
          </div>
        )}

        {/* Message size validation error */}
        {inputError && (
          <div className="mt-2 px-1 text-xs text-red-400 flex items-center gap-1.5">
            <span>{inputError}</span>
          </div>
        )}
      </div>
      )}
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
                <span className="text-muted-foreground">{t('common.status')}</span>
                <span className={cn('font-medium', (STATUS_CONFIG[mission.status] || STATUS_CONFIG.pending).color)}>
                  {(STATUS_CONFIG[mission.status] || STATUS_CONFIG.pending).label}
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
                  <span>{t('layout.missionSidebar.commandsExecuted')}</span>
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
              <div className="text-2xs text-muted-foreground/70 pt-2 border-t border-border/50">
                Last updated: {conversationSummary.lastUpdate.toLocaleTimeString()}
              </div>
            </div>
          </div>

          {/* Mission Info */}
          <div className="bg-card border border-border rounded-lg p-4">
            <h4 className="text-sm font-semibold text-foreground mb-3">Mission Details</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('common.type')}</span>
                <span className="text-foreground capitalize">{mission.type}</span>
              </div>
              {mission.cluster && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('common.cluster')}</span>
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

    {/* Setup Instructions Dialog - auto-opened on agent connection error */}
    <SetupInstructionsDialog
      isOpen={showSetupDialog}
      onClose={() => setShowSetupDialog(false)}
    />

    {/* Delete confirmation dialog */}
    <ConfirmDialog
      isOpen={showDeleteConfirm}
      onClose={() => setShowDeleteConfirm(false)}
      onConfirm={() => {
        setShowDeleteConfirm(false)
        dismissMission(mission.id)
        setActiveMission(null)
      }}
      title={t('layout.missionSidebar.deleteMission')}
      message={t('layout.missionSidebar.deleteMissionConfirm')}
      confirmLabel={t('common.delete')}
      variant="danger"
    />
    </>
  )
}
