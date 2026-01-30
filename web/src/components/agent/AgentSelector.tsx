import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Loader2, Settings } from 'lucide-react'
import { useMissions } from '../../hooks/useMissions'
import { useDemoMode } from '../../hooks/useDemoMode'
import { AgentIcon } from './AgentIcon'
import { APIKeySettings } from './APIKeySettings'
import type { AgentInfo } from '../../types/agent'
import { cn } from '../../lib/cn'

interface AgentSelectorProps {
  compact?: boolean
  className?: string
  showSettings?: boolean
}

export function AgentSelector({ compact = false, className = '', showSettings = true }: AgentSelectorProps) {
  const { agents, selectedAgent, agentsLoading, selectAgent, connectToAgent } = useMissions()
  const { isDemoMode } = useDemoMode()
  const [isOpen, setIsOpen] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // CLI-based agents (bob, claude-code) should be hidden when not available
  // API-based agents (claude, openai, gemini) should still show so users can configure them
  const CLI_BASED_PROVIDERS = ['bob', 'anthropic-local']
  const visibleAgents = agents.filter(a =>
    a.available || !CLI_BASED_PROVIDERS.includes(a.provider)
  )

  const currentAgent = visibleAgents.find(a => a.name === selectedAgent) || visibleAgents[0]
  const hasAvailableAgents = visibleAgents.some(a => a.available)

  // Connect to agent WebSocket on mount and when leaving demo mode
  useEffect(() => {
    if (!isDemoMode) {
      connectToAgent()
    }
  }, [connectToAgent, isDemoMode])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  // In demo mode, agent selection is not applicable — render nothing
  if (isDemoMode) return null

  if (agentsLoading) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
        <Loader2 className="w-4 h-4 animate-spin" />
        {!compact && <span>Loading...</span>}
      </div>
    )
  }

  if (visibleAgents.length === 0 || !hasAvailableAgents) {
    return (
      <>
        <button
          onClick={() => setShowSettingsModal(true)}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors',
            'bg-primary/10 border-primary/30 hover:bg-primary/20 text-primary text-sm font-medium',
            className
          )}
        >
          <Settings className="w-4 h-4" />
          {!compact && 'Configure AI'}
        </button>
        <APIKeySettings isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} />
      </>
    )
  }

  // If only one agent, just show it (no selector needed)
  if (visibleAgents.length === 1) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <AgentIcon provider={currentAgent.provider} className="w-5 h-5" />
        {!compact && (
          <span className="text-sm font-medium text-foreground">
            {currentAgent.displayName}
          </span>
        )}
      </div>
    )
  }

  const handleSelect = (agentName: string) => {
    selectAgent(agentName)
    setIsOpen(false)
  }

  return (
    <>
    <div ref={dropdownRef} className={cn('relative flex items-center gap-1', className)}>
      {showSettings && (
        <button
          onClick={() => setShowSettingsModal(true)}
          className="p-1.5 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          title="API Key Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      )}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors',
          'bg-secondary/50 border-border hover:bg-secondary',
          isOpen && 'ring-1 ring-primary'
        )}
      >
        <AgentIcon provider={currentAgent?.provider} className="w-4 h-4" />
        {!compact && (
          <span className="text-sm font-medium text-foreground truncate max-w-[120px]">
            {currentAgent?.displayName || 'Select Agent'}
          </span>
        )}
        <ChevronDown className={cn(
          'w-4 h-4 text-muted-foreground transition-transform',
          isOpen && 'rotate-180'
        )} />
      </button>

      {isOpen && (
        <div className="absolute z-50 top-full mt-1 right-0 w-64 rounded-lg bg-card border border-border shadow-lg py-1 overflow-hidden">
          {visibleAgents.map((agent: AgentInfo) => (
            <button
              key={agent.name}
              onClick={() => agent.available && handleSelect(agent.name)}
              disabled={!agent.available}
              className={cn(
                'w-full flex items-start gap-3 px-3 py-2 text-left transition-colors',
                agent.available
                  ? 'hover:bg-secondary cursor-pointer'
                  : 'opacity-50 cursor-not-allowed',
                agent.name === selectedAgent && 'bg-primary/10'
              )}
            >
              <AgentIcon provider={agent.provider} className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-sm font-medium',
                    agent.name === selectedAgent ? 'text-primary' : 'text-foreground'
                  )}>
                    {agent.displayName}
                  </span>
                  {agent.name === selectedAgent && (
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{agent.description}</p>
                {!agent.available && (
                  <p className="text-xs text-destructive mt-0.5">API key not configured</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
    <APIKeySettings isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} />
    </>
  )
}
