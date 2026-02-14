import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Loader2, RefreshCw, ToggleLeft, Box } from 'lucide-react'
import { cn } from '../../lib/cn'
import { BaseModal } from '../../lib/modals'
import { CARD_CONFIGS } from '../../config/cards'

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
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'select' | 'ai'>('select')
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [nlPrompt, setNlPrompt] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState<{
    type: string
    title: string
    config: Record<string, unknown>
    explanation: string
  } | null>(null)

  // Build card type list from CARD_CONFIGS, excluding current card
  const cardTypes = useMemo(() => {
    return Object.entries(CARD_CONFIGS)
      .filter(([type]) => type !== card?.card_type)
      .map(([type, config]) => ({
        type,
        name: config.title,
        description: config.description ?? '',
        category: config.category ?? 'general',
        iconColor: config.iconColor,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [card?.card_type])

  // Filter by search query
  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return cardTypes
    const q = searchQuery.toLowerCase()
    return cardTypes.filter(
      c => c.name.toLowerCase().includes(q) ||
           c.description.toLowerCase().includes(q) ||
           c.category.toLowerCase().includes(q) ||
           c.type.toLowerCase().includes(q)
    )
  }, [cardTypes, searchQuery])

  if (!card) return null

  const tabs = [
    { id: 'select', label: t('dashboard.replace.chooseCardType'), icon: ToggleLeft },
    { id: 'ai', label: t('dashboard.replace.describeWhatYouNeed'), icon: Sparkles },
  ]

  const handleSelectReplace = () => {
    if (!selectedType) return
    const cardDef = cardTypes.find((c) => c.type === selectedType)
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
        title={t('dashboard.replace.title')}
        description={t('dashboard.replace.description', { name: card.title || card.card_type })}
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
            <div className="space-y-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('dashboard.replace.searchCards')}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
              />
              <div className="grid grid-cols-2 gap-3 max-h-[40vh] overflow-y-auto">
                {filteredCards.map((cardType) => (
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
                      <Box className={cn(
                        'w-5 h-5 shrink-0',
                        selectedType === cardType.type ? 'text-purple-400' : (cardType.iconColor || 'text-muted-foreground')
                      )} />
                      <span className="font-medium text-foreground text-sm truncate">{cardType.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{cardType.description}</p>
                    <span className="inline-block mt-1 text-[10px] text-slate-500 bg-slate-800/50 px-1.5 py-0.5 rounded">{cardType.category}</span>
                  </button>
                ))}
                {filteredCards.length === 0 && (
                  <div className="col-span-2 text-center py-8 text-muted-foreground text-sm">
                    {t('dashboard.replace.noCardsMatch', { query: searchQuery })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-purple-300">{t('dashboard.replace.aiPoweredCreation')}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('dashboard.replace.aiCreationDescription')}
                </p>
              </div>

              <div>
                <label className="block text-sm text-muted-foreground mb-1">
                  {t('dashboard.replace.whatToTrack')}
                </label>
                <textarea
                  value={nlPrompt}
                  onChange={(e) => setNlPrompt(e.target.value)}
                  placeholder={t('dashboard.replace.aiPlaceholder')}
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
                    {t('dashboard.replace.generating')}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {t('dashboard.replace.generateCard')}
                  </>
                )}
              </button>

              {/* AI Suggestion */}
              {aiSuggestion && (
                <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-green-300">{t('dashboard.replace.suggestedCard')}</span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <span className="text-xs text-muted-foreground">{t('dashboard.replace.titleLabel')}</span>
                      <p className="text-foreground font-medium">{aiSuggestion.title}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">{t('dashboard.replace.typeLabel')}</span>
                      <p className="text-foreground">{CARD_CONFIGS[aiSuggestion.type]?.title ?? aiSuggestion.type}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{aiSuggestion.explanation}</p>
                  </div>
                  <button
                    onClick={handleAIReplace}
                    className="w-full mt-3 px-4 py-2 rounded-lg bg-green-500 text-foreground hover:bg-green-600 text-sm font-medium"
                  >
                    {t('dashboard.replace.useThisCard')}
                  </button>
                </div>
              )}

              {/* Example prompts */}
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium">{t('dashboard.replace.exampleRequests')}</p>
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
              {t('actions.cancel')}
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
                {t('dashboard.replace.replaceCard')}
              </button>
            )}
          </div>
        </BaseModal.Footer>
    </BaseModal>
  )
}
