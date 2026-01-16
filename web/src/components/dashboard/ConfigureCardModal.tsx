import { useState, useEffect } from 'react'
import { X, Sparkles, Loader2 } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { cn } from '../../lib/cn'

interface Card {
  id: string
  card_type: string
  config: Record<string, unknown>
  title?: string
}

interface ConfigureCardModalProps {
  isOpen: boolean
  card: Card | null
  onClose: () => void
  onSave: (cardId: string, config: Record<string, unknown>, title?: string) => void
}

// Card behaviors that can be enabled/disabled
const CARD_BEHAVIORS: Record<string, Array<{ key: string; label: string; description: string; default: boolean }>> = {
  cluster_health: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Automatically refresh every 30 seconds', default: true },
    { key: 'showUnhealthyFirst', label: 'Prioritize unhealthy', description: 'Show unhealthy clusters at the top', default: true },
    { key: 'alertOnChange', label: 'Alert on status change', description: 'Show notification when cluster health changes', default: false },
  ],
  event_stream: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Poll for new events every 10 seconds', default: true },
    { key: 'warningsOnly', label: 'Warnings only', description: 'Only show warning and error events', default: false },
    { key: 'groupByCluster', label: 'Group by cluster', description: 'Group events by their source cluster', default: false },
    { key: 'soundOnWarning', label: 'Sound on warning', description: 'Play sound for new warning events', default: false },
  ],
  pod_issues: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check for new issues every 30 seconds', default: true },
    { key: 'showRestartCount', label: 'Show restart count', description: 'Display container restart counts', default: true },
    { key: 'includeCompleted', label: 'Include completed', description: 'Show completed/succeeded pods', default: false },
    { key: 'alertOnNew', label: 'Alert on new issues', description: 'Notify when new pod issues appear', default: false },
  ],
  app_status: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Refresh app status periodically', default: true },
    { key: 'showAllReplicas', label: 'Show all replicas', description: 'Display individual replica status', default: false },
  ],
  resource_usage: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update metrics every 30 seconds', default: true },
    { key: 'showPercentage', label: 'Show percentage', description: 'Display as percentage of capacity', default: true },
    { key: 'alertOnHigh', label: 'Alert on high usage', description: 'Notify when usage exceeds 80%', default: false },
  ],
  cluster_metrics: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update metrics periodically', default: true },
    { key: 'showTrend', label: 'Show trend', description: 'Display trend indicators', default: true },
  ],
  deployment_status: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check deployment status periodically', default: true },
    { key: 'showProgress', label: 'Show progress', description: 'Display rollout progress bar', default: true },
    { key: 'alertOnComplete', label: 'Alert on complete', description: 'Notify when deployment completes', default: false },
  ],
  security_issues: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check for security issues periodically', default: true },
    { key: 'includeLowSeverity', label: 'Include low severity', description: 'Show informational security items', default: false },
    { key: 'alertOnCritical', label: 'Alert on critical', description: 'Notify on critical security issues', default: true },
  ],
  deployment_issues: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check for deployment issues periodically', default: true },
    { key: 'showAllClusters', label: 'All clusters', description: 'Show issues from all clusters', default: true },
    { key: 'showProgress', label: 'Show progress', description: 'Display rollout progress for stuck deployments', default: true },
    { key: 'alertOnNew', label: 'Alert on new issues', description: 'Notify when new deployment issues appear', default: false },
    { key: 'paginate', label: 'Enable pagination', description: 'Paginate results instead of showing all', default: false },
  ],
  default: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Automatically refresh this card', default: true },
  ],
}

const CARD_CONFIG_FIELDS: Record<string, Array<{ key: string; label: string; type: 'text' | 'select' | 'number' | 'cluster' | 'namespace' }>> = {
  cluster_health: [],
  event_stream: [
    { key: 'cluster', label: 'Cluster', type: 'cluster' },
    { key: 'namespace', label: 'Namespace', type: 'text' },
    { key: 'limit', label: 'Max Events', type: 'number' },
  ],
  pod_issues: [
    { key: 'cluster', label: 'Cluster', type: 'cluster' },
    { key: 'namespace', label: 'Namespace', type: 'text' },
  ],
  app_status: [
    { key: 'appName', label: 'App Name', type: 'text' },
    { key: 'namespace', label: 'Namespace', type: 'text' },
  ],
  resource_usage: [
    { key: 'cluster', label: 'Cluster', type: 'cluster' },
  ],
  cluster_metrics: [
    { key: 'cluster', label: 'Cluster', type: 'cluster' },
    { key: 'metric', label: 'Metric', type: 'select' },
  ],
  deployment_status: [
    { key: 'cluster', label: 'Cluster', type: 'cluster' },
    { key: 'namespace', label: 'Namespace', type: 'text' },
  ],
  security_issues: [
    { key: 'cluster', label: 'Cluster', type: 'cluster' },
    { key: 'namespace', label: 'Namespace', type: 'text' },
  ],
  deployment_issues: [
    { key: 'cluster', label: 'Cluster', type: 'cluster' },
    { key: 'namespace', label: 'Namespace', type: 'text' },
    { key: 'limit', label: 'Items per page', type: 'number' },
  ],
}

export function ConfigureCardModal({ isOpen, card, onClose, onSave }: ConfigureCardModalProps) {
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [behaviors, setBehaviors] = useState<Record<string, boolean>>({})
  const [title, setTitle] = useState('')
  const [nlPrompt, setNlPrompt] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState<'settings' | 'behaviors' | 'ai'>('settings')
  const { clusters } = useClusters()

  useEffect(() => {
    if (card) {
      setConfig(card.config || {})
      setTitle(card.title || '')
      // Initialize behaviors from config or defaults
      const cardBehaviors = CARD_BEHAVIORS[card.card_type] || []
      const initialBehaviors: Record<string, boolean> = {}
      cardBehaviors.forEach((b) => {
        initialBehaviors[b.key] = (card.config?.[b.key] as boolean) ?? b.default
      })
      setBehaviors(initialBehaviors)
    }
  }, [card])

  if (!isOpen || !card) return null

  const fields = CARD_CONFIG_FIELDS[card.card_type] || []
  const cardBehaviors = CARD_BEHAVIORS[card.card_type] || []

  const handleSave = () => {
    const finalConfig = { ...config, ...behaviors }
    onSave(card.id, finalConfig, title || undefined)
  }

  const updateConfig = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const toggleBehavior = (key: string) => {
    setBehaviors((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleNLSubmit = async () => {
    if (!nlPrompt.trim()) return
    setIsProcessing(true)

    // Simulate AI processing - in real implementation this would call Claude API
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Parse natural language and update config/behaviors
    const prompt = nlPrompt.toLowerCase()

    if (prompt.includes('refresh') && prompt.includes('faster')) {
      setBehaviors((prev) => ({ ...prev, autoRefresh: true }))
    }
    if (prompt.includes('warning') || prompt.includes('error')) {
      setBehaviors((prev) => ({ ...prev, warningsOnly: true }))
    }
    if (prompt.includes('alert') || prompt.includes('notify')) {
      setBehaviors((prev) => ({ ...prev, alertOnChange: true, alertOnNew: true, alertOnCritical: true }))
    }
    if (prompt.includes('unhealthy') && prompt.includes('first')) {
      setBehaviors((prev) => ({ ...prev, showUnhealthyFirst: true }))
    }
    if (prompt.includes('sound')) {
      setBehaviors((prev) => ({ ...prev, soundOnWarning: true }))
    }

    setNlPrompt('')
    setIsProcessing(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="w-full max-w-2xl glass rounded-2xl overflow-hidden animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div>
            <h2 className="text-lg font-medium text-white">Configure Card</h2>
            <p className="text-sm text-muted-foreground">
              Customize "{card.title || card.card_type}"
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border/50">
          <button
            onClick={() => setActiveTab('settings')}
            className={cn(
              'flex-1 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === 'settings'
                ? 'text-purple-400 border-b-2 border-purple-500'
                : 'text-muted-foreground hover:text-white'
            )}
          >
            Settings
          </button>
          <button
            onClick={() => setActiveTab('behaviors')}
            className={cn(
              'flex-1 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === 'behaviors'
                ? 'text-purple-400 border-b-2 border-purple-500'
                : 'text-muted-foreground hover:text-white'
            )}
          >
            Behaviors
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={cn(
              'flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2',
              activeTab === 'ai'
                ? 'text-purple-400 border-b-2 border-purple-500'
                : 'text-muted-foreground hover:text-white'
            )}
          >
            <Sparkles className="w-4 h-4" />
            AI Configure
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[50vh] overflow-y-auto">
          {activeTab === 'settings' && (
            <div className="space-y-4">
              {/* Title field */}
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Card Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Custom title (optional)"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white text-sm"
                />
              </div>

              {/* Dynamic config fields */}
              {fields.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm text-muted-foreground mb-1">{field.label}</label>
                  {field.type === 'cluster' ? (
                    <select
                      value={(config[field.key] as string) || ''}
                      onChange={(e) => updateConfig(field.key, e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white text-sm"
                    >
                      <option value="">All Clusters</option>
                      {clusters.map((c) => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  ) : field.type === 'select' ? (
                    <select
                      value={(config[field.key] as string) || ''}
                      onChange={(e) => updateConfig(field.key, e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white text-sm"
                    >
                      <option value="">Default</option>
                      <option value="cpu">CPU Usage</option>
                      <option value="memory">Memory Usage</option>
                      <option value="pods">Pod Count</option>
                    </select>
                  ) : field.type === 'number' ? (
                    <input
                      type="number"
                      value={(config[field.key] as number) || ''}
                      onChange={(e) => updateConfig(field.key, parseInt(e.target.value) || undefined)}
                      placeholder="Default"
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white text-sm"
                    />
                  ) : (
                    <input
                      type="text"
                      value={(config[field.key] as string) || ''}
                      onChange={(e) => updateConfig(field.key, e.target.value || undefined)}
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white text-sm"
                    />
                  )}
                </div>
              ))}

              {fields.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  This card type has no additional settings. Check the Behaviors tab.
                </p>
              )}
            </div>
          )}

          {activeTab === 'behaviors' && (
            <div className="space-y-3">
              {cardBehaviors.length > 0 ? (
                cardBehaviors.map((behavior) => (
                  <div
                    key={behavior.key}
                    className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer"
                    onClick={() => toggleBehavior(behavior.key)}
                  >
                    <div className={cn(
                      'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors',
                      behaviors[behavior.key]
                        ? 'bg-purple-500 border-purple-500'
                        : 'border-border'
                    )}>
                      {behaviors[behavior.key] && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{behavior.label}</p>
                      <p className="text-xs text-muted-foreground">{behavior.description}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  This card type has no configurable behaviors
                </p>
              )}
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-purple-300">AI-Powered Configuration</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Describe how you want this card to behave in plain English. For example:
                  "Only show warning events and alert me when new ones appear" or
                  "Prioritize unhealthy clusters and refresh faster"
                </p>
              </div>

              <div>
                <label className="block text-sm text-muted-foreground mb-1">
                  Describe your preferences
                </label>
                <textarea
                  value={nlPrompt}
                  onChange={(e) => setNlPrompt(e.target.value)}
                  placeholder="e.g., 'Show me only warning events from the vllm-d cluster and play a sound when new ones appear'"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white text-sm h-24 resize-none"
                  disabled={isProcessing}
                />
              </div>

              <button
                onClick={handleNLSubmit}
                disabled={!nlPrompt.trim() || isProcessing}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors',
                  nlPrompt.trim() && !isProcessing
                    ? 'bg-purple-500 text-white hover:bg-purple-600'
                    : 'bg-secondary text-muted-foreground cursor-not-allowed'
                )}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Apply Configuration
                  </>
                )}
              </button>

              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium">Example prompts:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>"Refresh this card every 10 seconds"</li>
                  <li>"Only show critical and warning events"</li>
                  <li>"Alert me when cluster health changes"</li>
                  <li>"Show unhealthy clusters first"</li>
                  <li>"Focus on the production namespace"</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border/50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-muted-foreground hover:text-white hover:bg-secondary/50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
