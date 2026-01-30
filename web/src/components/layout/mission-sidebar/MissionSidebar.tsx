import { useState, useEffect } from 'react'
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
} from 'lucide-react'
import { useMissions } from '../../../hooks/useMissions'
import { cn } from '../../../lib/cn'
import { AgentSelector } from '../../agent/AgentSelector'
import { AgentIcon } from '../../agent/AgentIcon'
import type { FontSize } from './types'
import { MissionListItem } from './MissionListItem'
import { MissionChat } from './MissionChat'

export function MissionSidebar() {
  const { missions, activeMission, isSidebarOpen, isSidebarMinimized, isFullScreen, setActiveMission, closeSidebar, dismissMission, minimizeSidebar, expandSidebar, setFullScreen, selectedAgent } = useMissions()
  const [collapsedMissions, setCollapsedMissions] = useState<Set<string>>(new Set())
  const [fontSize, setFontSize] = useState<FontSize>('base')

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

  // Minimized sidebar view (thin strip)
  if (isSidebarMinimized) {
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
    <div
      data-tour="ai-missions"
      className={cn(
        "fixed bg-card/95 backdrop-blur-sm border-border z-40 flex flex-col overflow-hidden",
        "transition-[width,top,border,transform] duration-300 ease-in-out",
        isFullScreen
          ? "inset-0 top-16 border-l-0 rounded-none"
          : "top-16 right-0 bottom-0 w-[500px] border-l shadow-xl",
        !isSidebarOpen && "translate-x-full pointer-events-none"
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
