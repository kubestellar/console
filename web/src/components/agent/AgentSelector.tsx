import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Check, Loader2, Settings } from 'lucide-react'
import { useMissions } from '../../hooks/useMissions'
import { useDemoMode, getDemoMode } from '../../hooks/useDemoMode'
import { AgentIcon } from './AgentIcon'
import { APIKeySettings } from './APIKeySettings'
import type { AgentInfo } from '../../types/agent'
import { cn } from '../../lib/cn'

interface AgentSelectorProps {
  compact?: boolean
  className?: string
}

export function AgentSelector({ compact = false, className = '' }: AgentSelectorProps) {
  const { t } = useTranslation()
  const { agents, selectedAgent, agentsLoading, selectAgent, connectToAgent } = useMissions()
  const { isDemoMode: isDemoModeHook } = useDemoMode()
  // Synchronous fallback prevents flash during React transitions
  const isDemoMode = isDemoModeHook || getDemoMode()
  const [isOpen, setIsOpen] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // CLI-based agents (bob, claude-code) should be hidden when not available
  // API-based agents (claude, openai, gemini) should still show so users can configure them
  const CLI_BASED_PROVIDERS = ['bob', 'anthropic-local']
  const visibleAgents = agents.filter(a =>
    a.available || !CLI_BASED_PROVIDERS.includes(a.provider)
  )

  // Sort: selected agent first, then available agents, then unavailable
  const sortedAgents = useMemo(() => {
    return [...visibleAgents].sort((a, b) => {
      // Selected agent first
      if (a.name === selectedAgent && b.name !== selectedAgent) return -1
      if (b.name === selectedAgent && a.name !== selectedAgent) return 1
      // Available before unavailable
      if (a.available && !b.available) return -1
      if (!a.available && b.available) return 1
      // Alphabetical within same group
      return a.displayName.localeCompare(b.displayName)
    })
  }, [visibleAgents, selectedAgent])

  const currentAgent = visibleAgents.find(a => a.name === selectedAgent) || visibleAgents[0]
  const hasAvailableAgents = visibleAgents.some(a => a.available)

  // Connect to agent WebSocket on mount and when leaving demo mode
  useEffect(() => {
    if (!isDemoMode) {
      connectToAgent()
    }
  }, [connectToAgent, isDemoMode])

  // Retry connection when dropdown is opened and agents are empty
  useEffect(() => {
    if (isOpen && agents.length === 0 && !agentsLoading && !isDemoMode) {
      connectToAgent()
    }
  }, [isOpen, agents.length, agentsLoading, isDemoMode, connectToAgent])

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

  // Close dropdown when entering demo mode
  useEffect(() => {
    if (isDemoMode) {
      setIsOpen(false)
    }
  }, [isDemoMode])

  // Loading state — only show spinner if we already had agents (reconnecting).
  // When no agents have loaded yet (e.g. cluster mode with no kc-agent), render nothing
  // to avoid a perpetual spinner from the reconnect loop.
  if (agentsLoading && !isDemoMode) {
    if (agents.length === 0) return null
    return (
      <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
        <Loader2 className="w-4 h-4 animate-spin" />
        {!compact && <span>Loading...</span>}
      </div>
    )
  }

  // No agents available and not in demo mode — hide selector entirely (cluster mode)
  if (agents.length === 0 && !agentsLoading && !isDemoMode) return null

  // Only gray out in demo mode - allow interaction during loading/reconnection
  const isGreyedOut = isDemoMode

  // If only one agent and it's available, just show it (no selector needed)
  if (visibleAgents.length === 1 && hasAvailableAgents && !isDemoMode) {
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

  // Always show the dropdown trigger — never a standalone gear.
  // When no agents are available, show a generic agent icon; settings gear
  // lives only inside the dropdown as a footer item.
  return (
    <>
    <div ref={dropdownRef} className={cn('relative flex items-center gap-1', className, isGreyedOut && 'opacity-40 pointer-events-none')}>
      <button
        onClick={() => !isDemoMode && setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors',
          'bg-secondary/50 border-border hover:bg-secondary',
          isOpen && 'ring-1 ring-primary'
        )}
      >
        {hasAvailableAgents && currentAgent ? (
          <AgentIcon provider={currentAgent.provider} className="w-4 h-4" />
        ) : (
          <AgentIcon provider="default" className="w-4 h-4" />
        )}
        {!compact && (
          <span className="text-sm font-medium text-foreground truncate max-w-[120px]">
            {hasAvailableAgents && currentAgent ? currentAgent.displayName : 'AI Agent'}
          </span>
        )}
        <ChevronDown className={cn(
          'w-4 h-4 text-muted-foreground transition-transform',
          isOpen && 'rotate-180'
        )} />
      </button>

      {isOpen && (
        <div className="absolute z-50 top-full mt-1 right-0 w-72 rounded-lg bg-card border border-border shadow-lg overflow-hidden">
          {sortedAgents.length > 0 && (
            <div className="py-1">
              {sortedAgents.map((agent: AgentInfo) => (
                <div
                  key={agent.name}
                  className={cn(
                    'w-full flex items-start gap-3 px-3 py-2 text-left transition-colors',
                    agent.available
                      ? 'hover:bg-secondary cursor-pointer'
                      : 'cursor-default',
                    agent.name === selectedAgent && 'bg-primary/10'
                  )}
                  onClick={() => agent.available && handleSelect(agent.name)}
                >
                  <AgentIcon provider={agent.provider} className={cn('w-5 h-5 mt-0.5 flex-shrink-0', !agent.available && 'opacity-40')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'text-sm font-medium',
                        agent.name === selectedAgent ? 'text-primary' : agent.available ? 'text-foreground' : 'text-muted-foreground'
                      )}>
                        {agent.displayName}
                      </span>
                      {agent.name === selectedAgent && (
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                      )}
                    </div>
                    <p className={cn('text-xs truncate', agent.available ? 'text-muted-foreground' : 'text-muted-foreground/60')}>{agent.description}</p>
                    {!agent.available && (
                      <p className="text-xs text-destructive/70 mt-0.5">API key not configured</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {sortedAgents.length === 0 && (
            <div className="py-4 text-center">
              {agentsLoading ? (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('agent.connectingToAgent')}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">{t('agent.noAgentsAvailable')}</p>
                  <button
                    onClick={() => connectToAgent()}
                    className="text-xs text-primary hover:underline"
                  >
                    Retry connection
                  </button>
                </div>
              )}
            </div>
          )}
          {/* Settings footer inside dropdown */}
          <div className="border-t border-border">
            <button
              onClick={() => {
                setShowSettingsModal(true)
                setIsOpen(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <Settings className="w-4 h-4" />
              API Key Settings
            </button>
          </div>
        </div>
      )}
    </div>
    {!isDemoMode && <APIKeySettings isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} />}
    </>
  )
}
