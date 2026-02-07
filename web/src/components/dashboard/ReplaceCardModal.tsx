import { useState } from 'react'
import { LayoutDashboard, Server, Activity, AlertTriangle, GitBranch, Shield, Box, Gauge, Sparkles, Loader2, RefreshCw, ToggleLeft } from 'lucide-react'
import { cn } from '../../lib/cn'
import { BaseModal } from '../../lib/modals'

interface Card {
  id: string
  card_type: string
  title?: string
}

interface ReplaceCardModalProps {
  isOpen: boolean
  card: Card | null
  onClose: () => void
  onReplace: (oldCardId: string, newCardType: string, newTitle?: string, newConfig?: Record<string, unknown>) => void
}

const CARD_TYPES = [
  { type: 'cluster_health', name: 'Cluster Health', icon: Server, description: 'Overview of cluster health status' },
  { type: 'event_stream', name: 'Event Stream', icon: Activity, description: 'Live Kubernetes events' },
  { type: 'pod_issues', name: 'Pod Issues', icon: AlertTriangle, description: 'Pods with problems' },
  { type: 'app_status', name: 'Workload Status', icon: Box, description: 'Workload deployment status' },
  { type: 'resource_usage', name: 'Resource Usage', icon: Gauge, description: 'CPU & memory utilization' },
  { type: 'cluster_metrics', name: 'Cluster Metrics', icon: LayoutDashboard, description: 'Time-series cluster data' },
  { type: 'deployment_status', name: 'Deployment Status', icon: GitBranch, description: 'Deployment rollout progress' },
  { type: 'security_issues', name: 'Security Issues', icon: Shield, description: 'Security misconfigurations' },
]

// Example prompts for the AI input
const EXAMPLE_PROMPTS = [
  "Show me CPU usage across all clusters",
  "Track warning events from the production namespace",
  "Display pods that have restarted more than 5 times",
  "Monitor deployment rollouts in the staging cluster",
  "Show security issues for privileged containers",
  "Track memory usage for the vllm-d cluster",
]

export function ReplaceCardModal({ isOpen, card, onClose, onReplace }: ReplaceCardModalProps) {
  const [activeTab, setActiveTab] = useState<'select' | 'ai'>('select')
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [nlPrompt, setNlPrompt] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState<{
    type: string
    title: string
    config: Record<string, unknown>
    explanation: string
  } | null>(null)

  if (!card) return null

  const tabs = [
    { id: 'select', label: 'Choose Card Type', icon: ToggleLeft },
    { id: 'ai', label: 'Describe What You Need', icon: Sparkles },
  ]

  const handleSelectReplace = () => {
    if (!selectedType) return
    const cardDef = CARD_TYPES.find((c) => c.type === selectedType)
    onReplace(card.id, selectedType, cardDef?.name)
    setSelectedType(null)
  }

  const handleAIGenerate = async () => {
    if (!nlPrompt.trim()) return
    setIsProcessing(true)
    setAiSuggestion(null)

    // Simulate AI processing
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Parse the natural language and suggest a card type
    const prompt = nlPrompt.toLowerCase()
    let suggestion: typeof aiSuggestion = null

    if (prompt.includes('cpu') || prompt.includes('memory') || prompt.includes('resource') || prompt.includes('usage')) {
      suggestion = {
        type: 'resource_usage',
        title: prompt.includes('cpu') ? 'CPU Usage Monitor' : 'Resource Usage',
        config: {
          cluster: prompt.match(/(\w+-\w+)\s+cluster/)?.[1] || '',
          metric: prompt.includes('cpu') ? 'cpu' : prompt.includes('memory') ? 'memory' : '',
        },
        explanation: 'This card will show resource utilization metrics for your clusters.',
      }
    } else if (prompt.includes('event') || prompt.includes('warning') || prompt.includes('error')) {
      suggestion = {
        type: 'event_stream',
        title: prompt.includes('warning') ? 'Warning Events' : 'Event Stream',
        config: {
          namespace: prompt.match(/(\w+)\s+namespace/)?.[1] || '',
          warningsOnly: prompt.includes('warning') || prompt.includes('error'),
        },
        explanation: 'This card displays a live stream of Kubernetes events.',
      }
    } else if (prompt.includes('pod') || prompt.includes('restart') || prompt.includes('crash')) {
      suggestion = {
        type: 'pod_issues',
        title: prompt.includes('restart') ? 'Pod Restarts' : 'Pod Issues',
        config: {
          minRestarts: prompt.match(/(\d+)\s+times/)?.[1] ? parseInt(prompt.match(/(\d+)\s+times/)?.[1] || '0') : undefined,
        },
        explanation: 'This card tracks pods with issues like crashes, restarts, or failures.',
      }
    } else if (prompt.includes('deploy') || prompt.includes('rollout')) {
      suggestion = {
        type: 'deployment_status',
        title: 'Deployment Status',
        config: {
          cluster: prompt.match(/(\w+-\w+)\s+cluster/)?.[1] || '',
        },
        explanation: 'This card monitors deployment rollout progress.',
      }
    } else if (prompt.includes('security') || prompt.includes('privileged') || prompt.includes('root')) {
      suggestion = {
        type: 'security_issues',
        title: 'Security Issues',
        config: {},
        explanation: 'This card highlights security misconfigurations like privileged containers.',
      }
    } else if (prompt.includes('health') || prompt.includes('cluster') || prompt.includes('status')) {
      suggestion = {
        type: 'cluster_health',
        title: 'Cluster Health',
        config: {},
        explanation: 'This card shows the overall health status of your clusters.',
      }
    } else {
      // Default suggestion
      suggestion = {
        type: 'cluster_metrics',
        title: 'Cluster Metrics',
        config: {},
        explanation: 'Based on your request, this card will show relevant cluster metrics.',
      }
    }

    setAiSuggestion(suggestion)
    setIsProcessing(false)
  }

  const handleAIReplace = () => {
    if (!aiSuggestion) return
    onReplace(card.id, aiSuggestion.type, aiSuggestion.title, aiSuggestion.config)
    setAiSuggestion(null)
    setNlPrompt('')
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md" closeOnBackdrop={false}>
      <BaseModal.Header
        title="Replace Card"
        description={`Replace "${card.title || card.card_type}" with a new card`}
        icon={RefreshCw}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Tabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as 'select' | 'ai')}
      />

      <BaseModal.Content className="max-h-[50vh]">
          {activeTab === 'select' && (
            <div className="grid grid-cols-2 gap-3">
              {CARD_TYPES.filter((c) => c.type !== card.card_type).map((cardType) => {
                const Icon = cardType.icon
                return (
                  <button
                    key={cardType.type}
                    onClick={() => setSelectedType(cardType.type)}
                    className={cn(
                      'p-4 rounded-lg border text-left transition-all',
                      selectedType === cardType.type
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-border/50 hover:border-border hover:bg-secondary/30'
                    )}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <Icon className={cn(
                        'w-5 h-5',
                        selectedType === cardType.type ? 'text-purple-400' : 'text-muted-foreground'
                      )} />
                      <span className="font-medium text-foreground">{cardType.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{cardType.description}</p>
                  </button>
                )
              })}
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-purple-300">AI-Powered Card Creation</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Describe what you want to see and we'll create the perfect card for you.
                </p>
              </div>

              <div>
                <label className="block text-sm text-muted-foreground mb-1">
                  What do you want to track or monitor?
                </label>
                <textarea
                  value={nlPrompt}
                  onChange={(e) => setNlPrompt(e.target.value)}
                  placeholder="e.g., 'Show me pods that have restarted more than 5 times in the last hour'"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm h-24 resize-none"
                  disabled={isProcessing}
                />
              </div>

              <button
                onClick={handleAIGenerate}
                disabled={!nlPrompt.trim() || isProcessing}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors',
                  nlPrompt.trim() && !isProcessing
                    ? 'bg-purple-500 text-foreground hover:bg-purple-600'
                    : 'bg-secondary text-muted-foreground cursor-not-allowed'
                )}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Card
                  </>
                )}
              </button>

              {/* AI Suggestion */}
              {aiSuggestion && (
                <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-green-300">Suggested Card</span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <span className="text-xs text-muted-foreground">Title:</span>
                      <p className="text-foreground font-medium">{aiSuggestion.title}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Type:</span>
                      <p className="text-foreground">{CARD_TYPES.find(c => c.type === aiSuggestion.type)?.name}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{aiSuggestion.explanation}</p>
                  </div>
                  <button
                    onClick={handleAIReplace}
                    className="w-full mt-3 px-4 py-2 rounded-lg bg-green-500 text-foreground hover:bg-green-600 text-sm font-medium"
                  >
                    Use This Card
                  </button>
                </div>
              )}

              {/* Example prompts */}
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium">Example requests:</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {EXAMPLE_PROMPTS.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => setNlPrompt(prompt)}
                      className="px-2 py-1 rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </BaseModal.Content>

        <BaseModal.Footer showKeyboardHints>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            >
              Cancel
            </button>
            {activeTab === 'select' && (
              <button
                onClick={handleSelectReplace}
                disabled={!selectedType}
                className={cn(
                  'px-4 py-2 rounded-lg',
                  selectedType
                    ? 'bg-purple-500 text-foreground hover:bg-purple-600'
                    : 'bg-secondary text-muted-foreground cursor-not-allowed'
                )}
              >
                Replace Card
              </button>
            )}
          </div>
        </BaseModal.Footer>
    </BaseModal>
  )
}
