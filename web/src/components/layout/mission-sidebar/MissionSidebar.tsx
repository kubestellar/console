import { useState, useEffect, useRef } from 'react'
import {
  X,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Minus,
  Plus,
  Type,
  MessageSquarePlus,
  Send,
} from 'lucide-react'
import { useMissions } from '../../../hooks/useMissions'
import { useMobile } from '../../../hooks/useMobile'
import { cn } from '../../../lib/cn'
import { AgentSelector } from '../../agent/AgentSelector'
import { AgentIcon } from '../../agent/AgentIcon'
import type { FontSize } from './types'
import { MissionListItem } from './MissionListItem'
import { MissionChat } from './MissionChat'

export function MissionSidebar() {
  const { missions, activeMission, isSidebarOpen, isSidebarMinimized, isFullScreen, setActiveMission, closeSidebar, dismissMission, minimizeSidebar, expandSidebar, setFullScreen, selectedAgent, startMission } = useMissions()
  const { isMobile } = useMobile()
  const [collapsedMissions, setCollapsedMissions] = useState<Set<string>>(new Set())
  const [fontSize, setFontSize] = useState<FontSize>('base')
  const [showNewMission, setShowNewMission] = useState(false)
  const [newMissionPrompt, setNewMissionPrompt] = useState('')
  const newMissionInputRef = useRef<HTMLTextAreaElement>(null)

  // Escape key: exit fullscreen first, then close sidebar
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullScreen) {
          setFullScreen(false)
        } else if (isSidebarOpen) {
          closeSidebar()
        }
      }
    }
    if (isSidebarOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isSidebarOpen, isFullScreen, setFullScreen, closeSidebar])

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

  // Minimized sidebar view (thin strip) - desktop only
  if (isSidebarMinimized && !isMobile) {
    return (
      <div className={cn(
        "fixed top-16 right-0 bottom-0 w-12 bg-card/95 backdrop-blur-sm border-l border-border shadow-xl z-40 flex flex-col items-center py-4",
        "transition-transform duration-300 ease-in-out",
        !isSidebarOpen && "translate-x-full pointer-events-none"
      )}>
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
    <>
      {/* Mobile backdrop */}
      {isMobile && isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={closeSidebar}
        />
      )}

      <div
        data-tour="ai-missions"
        className={cn(
          "fixed bg-card/95 backdrop-blur-sm border-border z-40 flex flex-col overflow-hidden",
          "transition-[width,top,border,transform] duration-300 ease-in-out",
          // Mobile: bottom sheet
          isMobile && "inset-x-0 bottom-0 rounded-t-2xl border-t max-h-[80vh]",
          isMobile && !isSidebarOpen && "translate-y-full pointer-events-none",
          isMobile && isSidebarOpen && "translate-y-0",
          // Desktop: right sidebar
          !isMobile && isFullScreen && "inset-0 top-16 border-l-0 rounded-none",
          !isMobile && !isFullScreen && "top-16 right-0 bottom-0 w-[500px] border-l shadow-xl",
          !isMobile && !isSidebarOpen && "translate-x-full pointer-events-none"
        )}
      >
      {/* Mobile drag handle */}
      {isMobile && (
        <div className="flex justify-center py-2 md:hidden">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-3 md:p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <AgentIcon provider={getAgentProvider(selectedAgent)} className="w-5 h-5" />
          <h2 className="font-semibold text-foreground text-sm md:text-base">AI Missions</h2>
          {needsAttention > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded-full">
              {needsAttention}
            </span>
          )}
        </div>
        {/* Agent Selector */}
        <div className="flex items-center gap-2">
          {/* New Mission Button */}
          <button
            onClick={() => {
              setShowNewMission(!showNewMission)
              if (!showNewMission) {
                setTimeout(() => newMissionInputRef.current?.focus(), 100)
              }
            }}
            className={cn(
              "p-1.5 rounded transition-colors",
              showNewMission
                ? "bg-primary text-primary-foreground"
                : "hover:bg-secondary text-muted-foreground hover:text-foreground"
            )}
            title="Start new mission"
          >
            <MessageSquarePlus className="w-4 h-4" />
          </button>
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
          {/* Fullscreen and minimize - desktop only */}
          {!isMobile && (isFullScreen ? (
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
          ))}
          <button
            onClick={closeSidebar}
            className="p-1 hover:bg-secondary rounded transition-colors"
            title="Close sidebar"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* New Mission Input */}
      {showNewMission && (
        <div className="p-3 border-b border-border bg-secondary/30">
          <div className="flex flex-col gap-2">
            <textarea
              ref={newMissionInputRef}
              value={newMissionPrompt}
              onChange={(e) => setNewMissionPrompt(e.target.value)}
              placeholder="What would you like help with? (e.g., 'Find pods with high memory usage' or 'Explain why my deployment is failing')"
              className="w-full min-h-[80px] p-2 text-sm bg-background border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && newMissionPrompt.trim()) {
                  startMission({
                    type: 'custom',
                    title: newMissionPrompt.slice(0, 50) + (newMissionPrompt.length > 50 ? '...' : ''),
                    description: newMissionPrompt,
                    initialPrompt: newMissionPrompt,
                  })
                  setNewMissionPrompt('')
                  setShowNewMission(false)
                }
              }}
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {isMobile ? 'Tap send' : 'Cmd+Enter to submit'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowNewMission(false)
                    setNewMissionPrompt('')
                  }}
                  className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (newMissionPrompt.trim()) {
                      startMission({
                        type: 'custom',
                        title: newMissionPrompt.slice(0, 50) + (newMissionPrompt.length > 50 ? '...' : ''),
                        description: newMissionPrompt,
                        initialPrompt: newMissionPrompt,
                      })
                      setNewMissionPrompt('')
                      setShowNewMission(false)
                    }
                  }}
                  disabled={!newMissionPrompt.trim()}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-3 h-3" />
                  Start
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {missions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <AgentIcon provider={getAgentProvider(selectedAgent)} className="w-12 h-12 opacity-50 mb-4" />
          <p className="text-muted-foreground">No active missions</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Start a mission from any card's AI action
          </p>
          {!showNewMission && (
            <button
              onClick={() => {
                setShowNewMission(true)
                setTimeout(() => newMissionInputRef.current?.focus(), 100)
              }}
              className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <MessageSquarePlus className="w-4 h-4" />
              Start Custom Mission
            </button>
          )}
        </div>
      ) : activeMission ? (
        <div className={cn(
          "flex-1 flex flex-col min-h-0",
          isFullScreen && "w-full"
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
          "flex-1 overflow-y-auto scroll-enhanced p-2 space-y-2",
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
    </>
  )
}

// Toggle button for the sidebar (shown when sidebar is closed)
export function MissionSidebarToggle() {
  const { missions, isSidebarOpen, openSidebar, selectedAgent } = useMissions()
  const { isMobile } = useMobile()

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
        'fixed flex items-center gap-2 rounded-full shadow-lg transition-all z-50',
        // Mobile: smaller padding, bottom right
        isMobile ? 'px-3 py-2 right-4 bottom-4' : 'px-4 py-3 right-4 bottom-4',
        needsAttention > 0
          ? 'bg-purple-500 text-white animate-pulse'
          : 'bg-card border border-border text-foreground hover:bg-secondary'
      )}
      title="Open AI Missions"
    >
      <AgentIcon provider={getAgentProvider(selectedAgent)} className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
      {runningCount > 0 && (
        <Loader2 className={isMobile ? 'w-3 h-3 animate-spin' : 'w-4 h-4 animate-spin'} />
      )}
      {needsAttention > 0 ? (
        <span className={isMobile ? 'text-xs font-medium' : 'text-sm font-medium'}>{needsAttention} needs attention</span>
      ) : missions.length > 0 ? (
        <span className={isMobile ? 'text-xs' : 'text-sm'}>{missions.length} mission{missions.length !== 1 ? 's' : ''}</span>
      ) : (
        <span className={isMobile ? 'text-xs' : 'text-sm'}>AI Missions</span>
      )}
      <ChevronRight className={cn(isMobile ? 'w-3 h-3' : 'w-4 h-4', isMobile && 'rotate-[-90deg]')} />
    </button>
  )
}
