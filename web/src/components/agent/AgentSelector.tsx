import { useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Check, Loader2, Settings, Sparkles } from 'lucide-react'
import { useMissions } from '../../hooks/useMissions'
import { useDemoMode, getDemoMode } from '../../hooks/useDemoMode'
import { AgentIcon } from './AgentIcon'
import { APIKeySettings } from './APIKeySettings'
import type { AgentInfo } from '../../types/agent'
import { cn } from '../../lib/cn'
import { useModalState } from '../../lib/modals'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'

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
  const { isOpen, close: closeDropdown, toggle: toggleDropdown } = useModalState()
  const { isOpen: isSettingsOpen, open: openSettings, close: closeSettings } = useModalState()
  const PREV_AGENT_KEY = 'kc_previous_agent'
  const previousAgentRef = useRef<string | null>(
    typeof window !== 'undefined' ? safeGetItem(PREV_AGENT_KEY) : null
  )
  const dropdownRef = useRef<HTMLDivElement>(null)

  // CLI-based agents (bob, claude-code) should be hidden when not available
  // API-based agents (claude, openai, gemini) should still show so users can configure them
  const CLI_BASED_PROVIDERS = ['bob']
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
        closeDropdown()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [closeDropdown])

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeDropdown()
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, closeDropdown])

  // Close dropdown when entering demo mode
  useEffect(() => {
    if (isDemoMode) {
      closeDropdown()
    }
  }, [isDemoMode, closeDropdown])

  // Loading state — only show spinner if we already had agents (reconnecting).
  // When no agents have loaded yet (e.g. cluster mode with no kc-agent), render nothing
  // to avoid a perpetual spinner from the reconnect loop.
  if (agentsLoading && !isDemoMode) {
    if (agents.length === 0) return null
    return (
      <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
        <Loader2 className="w-4 h-4 animate-spin" />
        {!compact && <span>{t('common.loading')}</span>}
      </div>
    )
  }

  // No agents available and not in demo mode — hide selector entirely (cluster mode)
  if (agents.length === 0 && !agentsLoading && !isDemoMode) return null

  // Only gray out in demo mode - allow interaction during loading/reconnection
  const isGreyedOut = isDemoMode

  const isNoneSelected = selectedAgent === 'none'

  // Always show dropdown (even with 1 agent) so user can access "None" option

  const handleSelect = (agentName: string) => {
    selectAgent(agentName)
    closeDropdown()
  }

  // Always show the dropdown trigger — never a standalone gear.
  // When no agents are available, show a generic agent icon; settings gear
  // lives only inside the dropdown as a footer item.
  return (
    <>
    <div ref={dropdownRef} className={cn('relative flex items-center gap-1', className, isGreyedOut && 'opacity-40 pointer-events-none')}>
      <button
        onClick={() => !isDemoMode && toggleDropdown()}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors',
          'bg-secondary/50 border-border hover:bg-secondary',
          isOpen && 'ring-1 ring-primary'
        )}
      >
        {isNoneSelected ? (
          <Sparkles className="w-4 h-4 text-muted-foreground" />
        ) : hasAvailableAgents && currentAgent ? (
          <AgentIcon provider={currentAgent.provider} className="w-4 h-4" />
        ) : (
          <AgentIcon provider="default" className="w-4 h-4" />
        )}
        {!compact && (
          <span className="text-sm font-medium text-foreground truncate max-w-[120px]">
            {isNoneSelected ? t('agent.noneAgent') : hasAvailableAgents && currentAgent ? currentAgent.displayName : 'AI Agent'}
          </span>
        )}
        <ChevronDown className={cn(
          'w-4 h-4 text-muted-foreground transition-transform',
          isOpen && 'rotate-180'
        )} />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={t('agent.selectAgent')}
          className="absolute z-50 top-full mt-1 right-0 w-72 max-h-[calc(100vh-8rem)] rounded-lg bg-card border border-border shadow-lg overflow-hidden flex flex-col"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
            e.preventDefault()
            const items = e.currentTarget.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])')
            const idx = Array.from(items).indexOf(document.activeElement as HTMLElement)
            if (e.key === 'ArrowDown') items[Math.min(idx + 1, items.length - 1)]?.focus()
            else items[Math.max(idx - 1, 0)]?.focus()
          }}
        >
          {/* AI Agent toggle — ON by default, OFF disables AI processing */}
          <div className="px-3 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className={cn('w-4 h-4', isNoneSelected ? 'text-muted-foreground' : 'text-primary')} />
                <div>
                  <span className="text-sm font-medium text-foreground">{t('agent.aiAgentToggle')}</span>
                  <p className="text-xs text-muted-foreground">
                    {isNoneSelected ? t('agent.noneAgentDesc') : t('agent.aiAgentOnDesc')}
                  </p>
                </div>
              </div>
              <button
                role="switch"
                aria-checked={!isNoneSelected}
                onClick={() => {
                  if (isNoneSelected) {
                    // Turn AI back on — restore previous agent, or fall back to first available
                    const prev = previousAgentRef.current
                    const restoreAgent = prev && sortedAgents.find(a => a.name === prev && a.available)
                    handleSelect(restoreAgent ? restoreAgent.name : (sortedAgents.find(a => a.available)?.name || ''))
                  } else {
                    // Save current agent before turning AI off
                    previousAgentRef.current = selectedAgent || null
                    if (selectedAgent) safeSetItem(PREV_AGENT_KEY, selectedAgent)
                    handleSelect('none')
                  }
                }}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0',
                  !isNoneSelected ? 'bg-primary' : 'bg-secondary'
                )}
              >
                <span className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  !isNoneSelected ? 'translate-x-6' : 'translate-x-1'
                )} />
              </button>
            </div>
          </div>
          {sortedAgents.length > 0 && (
            <div className="py-1 overflow-y-auto min-h-0">
              {sortedAgents.map((agent: AgentInfo) => (
                <div
                  key={agent.name}
                  role="option"
                  aria-selected={agent.name === selectedAgent}
                  aria-disabled={!agent.available}
                  tabIndex={agent.available ? 0 : -1}
                  className={cn(
                    'w-full flex items-start gap-3 px-3 py-2 text-left transition-colors',
                    agent.available
                      ? 'hover:bg-secondary cursor-pointer'
                      : 'cursor-default',
                    agent.name === selectedAgent && 'bg-primary/10'
                  )}
                  onClick={() => agent.available && handleSelect(agent.name)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (agent.available) handleSelect(agent.name) } }}
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
                openSettings()
                closeDropdown()
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
    {!isDemoMode && <APIKeySettings isOpen={isSettingsOpen} onClose={closeSettings} />}
    </>
  )
}
