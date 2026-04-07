import { Bot, ChevronDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { KagentAgent } from '../../lib/kagentBackend'

interface KagentAgentPickerProps {
  agents: KagentAgent[]
  selectedAgent: KagentAgent | null
  onSelect: (agent: KagentAgent) => void
}

export function KagentAgentPicker({ agents, selectedAgent, onSelect }: KagentAgentPickerProps) {
  const { t } = useTranslation('cards')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (agents.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
        <Bot className="w-3.5 h-3.5" />
        <span>{t('kagentAgentPicker.noAgentsAvailable')}</span>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs bg-card border border-border hover:bg-accent transition-colors"
      >
        <Bot className="w-3.5 h-3.5 text-purple-400" />
        <span className="truncate max-w-[180px]">
          {selectedAgent ? `${selectedAgent.namespace}/${selectedAgent.name}` : 'Select agent...'}
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 rounded-lg border border-border bg-popover shadow-lg z-dropdown max-h-64 overflow-y-auto">
          {agents.map(agent => {
            const key = `${agent.namespace}/${agent.name}`
            const isSelected = selectedAgent?.name === agent.name && selectedAgent?.namespace === agent.namespace
            return (
              <button
                key={key}
                onClick={() => { onSelect(agent); setOpen(false) }}
                className={`w-full text-left px-3 py-2 hover:bg-accent transition-colors ${isSelected ? 'bg-accent/50' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{agent.name}</span>
                  {agent.framework && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">{agent.framework}</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{agent.namespace}</div>
                {agent.description && (
                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{agent.description}</div>
                )}
                {agent.tools && agent.tools.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {agent.tools.slice(0, 3).map(tool => (
                      <span key={tool} className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground">{tool}</span>
                    ))}
                    {agent.tools.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">+{agent.tools.length - 3}</span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
