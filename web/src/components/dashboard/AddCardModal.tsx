import { useState, useEffect } from 'react'
import { X, Sparkles, Plus, Loader2 } from 'lucide-react'

interface CardSuggestion {
  type: string
  title: string
  description: string
  visualization: 'gauge' | 'table' | 'timeseries' | 'events' | 'donut' | 'bar' | 'status' | 'sparkline'
  config: Record<string, unknown>
}

interface AddCardModalProps {
  isOpen: boolean
  onClose: () => void
  onAddCards: (cards: CardSuggestion[]) => void
  existingCardTypes?: string[]
}

// Simulated AI response - in production this would call Claude API
function generateCardSuggestions(query: string): CardSuggestion[] {
  const lowerQuery = query.toLowerCase()

  // GPU-related queries
  if (lowerQuery.includes('gpu')) {
    return [
      {
        type: 'gpu_overview',
        title: 'GPU Overview',
        description: 'Total GPUs across all clusters',
        visualization: 'gauge',
        config: { metric: 'gpu_utilization' },
      },
      {
        type: 'gpu_status',
        title: 'GPU Status',
        description: 'GPUs by state',
        visualization: 'donut',
        config: { groupBy: 'status' },
      },
      {
        type: 'gpu_list',
        title: 'GPU Inventory',
        description: 'Detailed GPU list with status',
        visualization: 'table',
        config: { columns: ['node', 'gpu_type', 'memory', 'status', 'utilization'] },
      },
      {
        type: 'gpu_issues',
        title: 'GPU Issues',
        description: 'GPUs with problems',
        visualization: 'events',
        config: { filter: 'gpu_issues' },
      },
    ]
  }

  // Memory-related queries
  if (lowerQuery.includes('memory') || lowerQuery.includes('ram')) {
    return [
      {
        type: 'memory_usage',
        title: 'Memory Usage',
        description: 'Current memory utilization',
        visualization: 'gauge',
        config: { metric: 'memory_usage' },
      },
      {
        type: 'memory_trend',
        title: 'Memory Trend',
        description: 'Memory usage over time',
        visualization: 'timeseries',
        config: { metric: 'memory', period: '1h' },
      },
    ]
  }

  // CPU-related queries
  if (lowerQuery.includes('cpu') || lowerQuery.includes('processor')) {
    return [
      {
        type: 'cpu_usage',
        title: 'CPU Usage',
        description: 'Current CPU utilization',
        visualization: 'gauge',
        config: { metric: 'cpu_usage' },
      },
      {
        type: 'cpu_trend',
        title: 'CPU Trend',
        description: 'CPU usage over time',
        visualization: 'timeseries',
        config: { metric: 'cpu', period: '1h' },
      },
      {
        type: 'top_cpu_pods',
        title: 'Top CPU Consumers',
        description: 'Pods using most CPU',
        visualization: 'bar',
        config: { metric: 'cpu', limit: 10 },
      },
    ]
  }

  // Pod-related queries
  if (lowerQuery.includes('pod')) {
    return [
      {
        type: 'pod_status',
        title: 'Pod Status',
        description: 'Pods by state',
        visualization: 'donut',
        config: { groupBy: 'status' },
      },
      {
        type: 'pod_list',
        title: 'Pod List',
        description: 'All pods with details',
        visualization: 'table',
        config: { columns: ['name', 'namespace', 'status', 'restarts', 'age'] },
      },
    ]
  }

  // Cluster-related queries
  if (lowerQuery.includes('cluster')) {
    return [
      {
        type: 'cluster_health',
        title: 'Cluster Health',
        description: 'Health status of all clusters',
        visualization: 'status',
        config: {},
      },
      {
        type: 'cluster_focus',
        title: 'Cluster Focus',
        description: 'Single cluster detailed view',
        visualization: 'status',
        config: {},
      },
      {
        type: 'cluster_comparison',
        title: 'Cluster Comparison',
        description: 'Side-by-side cluster metrics',
        visualization: 'bar',
        config: {},
      },
      {
        type: 'cluster_network',
        title: 'Cluster Network',
        description: 'API server and network info',
        visualization: 'status',
        config: {},
      },
    ]
  }

  // Namespace-related queries
  if (lowerQuery.includes('namespace') || lowerQuery.includes('quota') || lowerQuery.includes('rbac')) {
    return [
      {
        type: 'namespace_overview',
        title: 'Namespace Overview',
        description: 'Namespace resources and health',
        visualization: 'status',
        config: {},
      },
      {
        type: 'namespace_quotas',
        title: 'Namespace Quotas',
        description: 'Resource quota usage',
        visualization: 'gauge',
        config: {},
      },
      {
        type: 'namespace_rbac',
        title: 'Namespace RBAC',
        description: 'Roles, bindings, service accounts',
        visualization: 'table',
        config: {},
      },
      {
        type: 'namespace_events',
        title: 'Namespace Events',
        description: 'Events in namespace',
        visualization: 'events',
        config: {},
      },
    ]
  }

  // Operator/OLM-related queries
  if (lowerQuery.includes('operator') || lowerQuery.includes('olm') || lowerQuery.includes('crd')) {
    return [
      {
        type: 'operator_status',
        title: 'Operator Status',
        description: 'OLM operator health',
        visualization: 'status',
        config: {},
      },
      {
        type: 'operator_subscriptions',
        title: 'Operator Subscriptions',
        description: 'Subscriptions and pending upgrades',
        visualization: 'table',
        config: {},
      },
      {
        type: 'crd_health',
        title: 'CRD Health',
        description: 'Custom resource definitions status',
        visualization: 'status',
        config: {},
      },
    ]
  }

  // Helm-related queries
  if (lowerQuery.includes('helm') || lowerQuery.includes('chart') || lowerQuery.includes('release')) {
    return [
      {
        type: 'helm_release_status',
        title: 'Helm Releases',
        description: 'Release status and versions',
        visualization: 'status',
        config: {},
      },
      {
        type: 'helm_values_diff',
        title: 'Helm Values Diff',
        description: 'Compare values vs defaults',
        visualization: 'table',
        config: {},
      },
      {
        type: 'helm_history',
        title: 'Helm History',
        description: 'Release revision history',
        visualization: 'events',
        config: {},
      },
      {
        type: 'chart_versions',
        title: 'Chart Versions',
        description: 'Available chart upgrades',
        visualization: 'table',
        config: {},
      },
    ]
  }

  // Kustomize/GitOps-related queries
  if (lowerQuery.includes('kustomize') || lowerQuery.includes('flux') || lowerQuery.includes('overlay')) {
    return [
      {
        type: 'kustomization_status',
        title: 'Kustomization Status',
        description: 'Flux kustomizations health',
        visualization: 'status',
        config: {},
      },
      {
        type: 'overlay_comparison',
        title: 'Overlay Comparison',
        description: 'Compare kustomize overlays',
        visualization: 'table',
        config: {},
      },
      {
        type: 'gitops_drift',
        title: 'GitOps Drift',
        description: 'Detect configuration drift',
        visualization: 'status',
        config: {},
      },
    ]
  }

  // Cost-related queries
  if (lowerQuery.includes('cost') || lowerQuery.includes('price') || lowerQuery.includes('expense')) {
    return [
      {
        type: 'cluster_costs',
        title: 'Cluster Costs',
        description: 'Resource cost estimation',
        visualization: 'bar',
        config: {},
      },
      {
        type: 'resource_usage',
        title: 'Resource Usage',
        description: 'CPU and memory consumption',
        visualization: 'gauge',
        config: {},
      },
    ]
  }

  // User management queries
  if (lowerQuery.includes('user') || lowerQuery.includes('service account') || lowerQuery.includes('access') || lowerQuery.includes('permission')) {
    return [
      {
        type: 'user_management',
        title: 'User Management',
        description: 'Console users and Kubernetes RBAC',
        visualization: 'table',
        config: {},
      },
      {
        type: 'namespace_rbac',
        title: 'Namespace RBAC',
        description: 'Roles, bindings, service accounts',
        visualization: 'table',
        config: {},
      },
    ]
  }

  // Events/logs queries
  if (lowerQuery.includes('event') || lowerQuery.includes('log') || lowerQuery.includes('error')) {
    return [
      {
        type: 'event_stream',
        title: 'Event Stream',
        description: 'Live event feed',
        visualization: 'events',
        config: { filter: 'all' },
      },
      {
        type: 'error_count',
        title: 'Errors Over Time',
        description: 'Error count trend',
        visualization: 'sparkline',
        config: { metric: 'errors' },
      },
    ]
  }

  // Default suggestions
  return [
    {
      type: 'custom_query',
      title: 'Custom Metric',
      description: 'Based on your query',
      visualization: 'timeseries',
      config: { query: query },
    },
  ]
}

const visualizationIcons: Record<string, string> = {
  gauge: '⏱️',
  table: '📋',
  timeseries: '📈',
  events: '📜',
  donut: '🍩',
  bar: '📊',
  status: '🚦',
  sparkline: '〰️',
}

export function AddCardModal({ isOpen, onClose, onAddCards, existingCardTypes = [] }: AddCardModalProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<CardSuggestion[]>([])
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set())
  const [isGenerating, setIsGenerating] = useState(false)

  // ESC to close
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleGenerate = async () => {
    if (!query.trim()) return

    setIsGenerating(true)
    setSuggestions([])
    setSelectedCards(new Set())

    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const results = generateCardSuggestions(query)
    setSuggestions(results)
    // Select all non-duplicate by default
    setSelectedCards(new Set(results.map((card, i) => existingCardTypes.includes(card.type) ? -1 : i).filter(i => i !== -1)))
    setIsGenerating(false)
  }

  const toggleCard = (index: number) => {
    const newSelected = new Set(selectedCards)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedCards(newSelected)
  }

  const handleAddCards = () => {
    const cardsToAdd = suggestions.filter((_, i) => selectedCards.has(i))
    onAddCards(cardsToAdd)
    onClose()
    setQuery('')
    setSuggestions([])
    setSelectedCards(new Set())
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-white">Add Cards with AI</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Query input */}
          <div className="mb-4">
            <label className="block text-sm text-muted-foreground mb-2">
              Describe what you want to see
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                placeholder="e.g., Show me GPU status, utilization, and any issues..."
                className="flex-1 px-4 py-2 bg-secondary rounded-lg text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
              <button
                onClick={handleGenerate}
                disabled={!query.trim() || isGenerating}
                className="px-4 py-2 bg-gradient-ks text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Thinking...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Example queries */}
          {!suggestions.length && !isGenerating && (
            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-2">Try asking:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  'Show me GPU utilization and availability',
                  'What pods are having issues?',
                  'Helm releases and chart versions',
                  'Namespace quotas and RBAC',
                  'Operator status and CRDs',
                  'Kustomize and GitOps status',
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => setQuery(example)}
                    className="px-3 py-1 text-xs bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-white rounded-full transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                Suggested cards ({selectedCards.size} selected):
              </p>
              <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                {suggestions.map((card, index) => {
                  const isAlreadyAdded = existingCardTypes.includes(card.type)
                  return (
                    <button
                      key={index}
                      onClick={() => !isAlreadyAdded && toggleCard(index)}
                      disabled={isAlreadyAdded}
                      className={`p-3 rounded-lg text-left transition-all ${
                        isAlreadyAdded
                          ? 'bg-secondary/30 border-2 border-transparent opacity-50 cursor-not-allowed'
                          : selectedCards.has(index)
                            ? 'bg-purple-500/20 border-2 border-purple-500'
                            : 'bg-secondary/50 border-2 border-transparent hover:border-purple-500/30'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span>{visualizationIcons[card.visualization]}</span>
                        <span className="text-sm font-medium text-white">
                          {card.title}
                        </span>
                        {isAlreadyAdded && (
                          <span className="text-xs text-muted-foreground">(Already added)</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {card.description}
                      </p>
                      <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground capitalize">
                        {card.visualization}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {suggestions.length > 0 && (
          <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
            <button
              onClick={onClose}
              className="px-4 py-2 text-muted-foreground hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddCards}
              disabled={selectedCards.size === 0}
              className="px-4 py-2 bg-gradient-ks text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add {selectedCards.size} Card{selectedCards.size !== 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
