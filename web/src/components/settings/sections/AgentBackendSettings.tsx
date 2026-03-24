import { Bot, Monitor, RefreshCw, Check, ExternalLink } from 'lucide-react'
import { AgentIcon } from '../../agent/AgentIcon'
import type { AgentBackendType } from '../../../hooks/useKagentBackend'
import type { KagentAgent, KagentStatus } from '../../../lib/kagentBackend'
import type { KagentiProviderAgent, KagentiProviderStatus } from '../../../lib/kagentiProviderBackend'

interface AgentBackendSettingsProps {
  kagentAvailable: boolean
  kagentStatus: KagentStatus | null
  kagentAgents: KagentAgent[]
  selectedKagentAgent: KagentAgent | null
  kagentiAvailable: boolean
  kagentiStatus: KagentiProviderStatus | null
  kagentiAgents: KagentiProviderAgent[]
  selectedKagentiAgent: KagentiProviderAgent | null
  preferredBackend: AgentBackendType
  activeBackend: AgentBackendType
  onSelectBackend: (backend: AgentBackendType) => void
  onSelectKagentAgent: (agent: KagentAgent) => void
  onSelectKagentiAgent: (agent: KagentiProviderAgent) => void
  onRefresh: () => void
}

export function AgentBackendSettings({
  kagentAvailable,
  kagentStatus,
  kagentAgents,
  selectedKagentAgent,
  kagentiAvailable,
  kagentiStatus,
  kagentiAgents,
  selectedKagentiAgent,
  preferredBackend,
  activeBackend,
  onSelectBackend,
  onSelectKagentAgent,
  onSelectKagentiAgent,
  onRefresh,
}: AgentBackendSettingsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">Agent Backend</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Choose how AI missions connect to your clusters
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="p-1.5 rounded-md hover:bg-accent transition-colors"
          title="Refresh status"
        >
          <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Backend selector — 3 columns */}
      <div className="grid grid-cols-3 gap-3">
        {/* kc-agent option */}
        <button
          onClick={() => onSelectBackend('kc-agent')}
          className={`relative p-3 rounded-lg border text-left transition-colors ${
            preferredBackend === 'kc-agent'
              ? 'border-blue-500 bg-blue-500/5'
              : 'border-border hover:border-border/80 hover:bg-accent/50'
          }`}
        >
          {preferredBackend === 'kc-agent' && (
            <Check className="absolute top-2 right-2 w-3.5 h-3.5 text-blue-400" />
          )}
          <Monitor className="w-5 h-5 text-blue-400 mb-2" />
          <div className="text-sm font-medium text-foreground">Local Agent</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            kc-agent on your machine
          </div>
        </button>

        {/* kagent option */}
        <button
          onClick={() => kagentAvailable && onSelectBackend('kagent')}
          disabled={!kagentAvailable}
          className={`relative p-3 rounded-lg border text-left transition-colors ${
            preferredBackend === 'kagent'
              ? 'border-purple-500 bg-purple-500/5'
              : kagentAvailable
                ? 'border-border hover:border-border/80 hover:bg-accent/50'
                : 'border-border/50 opacity-50 cursor-not-allowed'
          }`}
        >
          {preferredBackend === 'kagent' && (
            <Check className="absolute top-2 right-2 w-3.5 h-3.5 text-purple-400" />
          )}
          <AgentIcon provider="kagent" className="w-5 h-5 mb-2" />
          <div className="text-sm font-medium text-foreground">Kagent</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {kagentAvailable ? 'In-cluster AI agents' : 'Not detected in cluster'}
          </div>
          {!kagentAvailable && (
            <a
              href="https://github.com/kagent-dev/kagent"
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 mt-1.5"
            >
              Install <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </button>

        {/* kagenti option */}
        <button
          onClick={() => kagentiAvailable && onSelectBackend('kagenti')}
          disabled={!kagentiAvailable}
          className={`relative p-3 rounded-lg border text-left transition-colors ${
            preferredBackend === 'kagenti'
              ? 'border-green-500 bg-green-500/5'
              : kagentiAvailable
                ? 'border-border hover:border-border/80 hover:bg-accent/50'
                : 'border-border/50 opacity-50 cursor-not-allowed'
          }`}
        >
          {preferredBackend === 'kagenti' && (
            <Check className="absolute top-2 right-2 w-3.5 h-3.5 text-green-400" />
          )}
          <AgentIcon provider="kagenti" className="w-5 h-5 mb-2" />
          <div className="text-sm font-medium text-foreground">Kagenti</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {kagentiAvailable ? 'In-cluster agent platform' : 'Not detected in cluster'}
          </div>
          {!kagentiAvailable && (
            <a
              href="https://github.com/kagenti/kagenti"
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-green-400 hover:text-green-300 mt-1.5"
            >
              Install <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </button>
      </div>

      {/* Active backend indicator */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 text-xs">
        <div className={`w-1.5 h-1.5 rounded-full ${
          activeBackend === 'kagenti' ? 'bg-green-400' :
          activeBackend === 'kagent' ? 'bg-purple-400' : 'bg-blue-400'
        }`} />
        <span className="text-muted-foreground">
          Active: <span className="text-foreground font-medium">
            {activeBackend === 'kagenti' ? 'Kagenti (in-cluster)' :
             activeBackend === 'kagent' ? 'Kagent (in-cluster)' :
             'Local Agent (kc-agent)'}
          </span>
        </span>
      </div>

      {/* Kagent agent list */}
      {preferredBackend === 'kagent' && kagentAvailable && kagentAgents.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Kagent Agents</h4>
          <div className="space-y-1">
            {kagentAgents.map(agent => {
              const isSelected = selectedKagentAgent?.name === agent.name && selectedKagentAgent?.namespace === agent.namespace
              return (
                <button
                  key={`${agent.namespace}/${agent.name}`}
                  onClick={() => onSelectKagentAgent(agent)}
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                    isSelected ? 'bg-purple-500/10 border border-purple-500/30' : 'hover:bg-accent border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Bot className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span className="text-sm text-foreground">{agent.name}</span>
                    <span className="text-xs text-muted-foreground">{agent.namespace}</span>
                    {agent.framework && (
                      <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{agent.framework}</span>
                    )}
                  </div>
                  {agent.description && (
                    <div className="text-xs text-muted-foreground mt-0.5 pl-5.5">{agent.description}</div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Kagenti agent list */}
      {preferredBackend === 'kagenti' && kagentiAvailable && kagentiAgents.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Kagenti Agents</h4>
          <div className="space-y-1">
            {kagentiAgents.map(agent => {
              const isSelected = selectedKagentiAgent?.name === agent.name && selectedKagentiAgent?.namespace === agent.namespace
              return (
                <button
                  key={`${agent.namespace}/${agent.name}`}
                  onClick={() => onSelectKagentiAgent(agent)}
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                    isSelected ? 'bg-green-500/10 border border-green-500/30' : 'hover:bg-accent border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Bot className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <span className="text-sm text-foreground">{agent.name}</span>
                    <span className="text-xs text-muted-foreground">{agent.namespace}</span>
                    {agent.framework && (
                      <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{agent.framework}</span>
                    )}
                  </div>
                  {agent.description && (
                    <div className="text-xs text-muted-foreground mt-0.5 pl-5.5">{agent.description}</div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Status details when not available */}
      {kagentStatus && !kagentAvailable && kagentStatus.reason && (
        <div className="text-xs text-muted-foreground px-3 py-2 rounded-md bg-muted/30">
          Kagent: {kagentStatus.reason}
        </div>
      )}
      {kagentiStatus && !kagentiAvailable && kagentiStatus.reason && (
        <div className="text-xs text-muted-foreground px-3 py-2 rounded-md bg-muted/30">
          Kagenti: {kagentiStatus.reason}
        </div>
      )}
    </div>
  )
}
