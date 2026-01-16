import { useState } from 'react'
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
        type: 'cluster_resources',
        title: 'Cluster Resources',
        description: 'Resource usage by cluster',
        visualization: 'bar',
        config: { groupBy: 'cluster' },
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

export function AddCardModal({ isOpen, onClose, onAddCards }: AddCardModalProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<CardSuggestion[]>([])
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set())
  const [isGenerating, setIsGenerating] = useState(false)

  const handleGenerate = async () => {
    if (!query.trim()) return

    setIsGenerating(true)
    setSuggestions([])
    setSelectedCards(new Set())

    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const results = generateCardSuggestions(query)
    setSuggestions(results)
    // Select all by default
    setSelectedCards(new Set(results.map((_, i) => i)))
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
                  'CPU and memory usage trends',
                  'Cluster health overview',
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
                {suggestions.map((card, index) => (
                  <button
                    key={index}
                    onClick={() => toggleCard(index)}
                    className={`p-3 rounded-lg text-left transition-all ${
                      selectedCards.has(index)
                        ? 'bg-purple-500/20 border-2 border-purple-500'
                        : 'bg-secondary/50 border-2 border-transparent hover:border-purple-500/30'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span>{visualizationIcons[card.visualization]}</span>
                      <span className="text-sm font-medium text-white">
                        {card.title}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {card.description}
                    </p>
                    <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground capitalize">
                      {card.visualization}
                    </span>
                  </button>
                ))}
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
