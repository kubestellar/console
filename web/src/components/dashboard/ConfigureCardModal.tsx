import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Loader2, Settings, ToggleLeft } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useTokenUsage } from '../../hooks/useTokenUsage'
import { cn } from '../../lib/cn'
import { BaseModal } from '../../lib/modals'
import { wrapAbbreviations } from '../shared/TechnicalAcronym'
import { PROGRESS_SIMULATION_MS } from '../../lib/constants/network'
import { CARD_TYPE_PATTERNS, CARD_BEHAVIORS, CARD_CONFIG_FIELDS } from './cardConfigData'

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
  onSave: (cardId: string, config: Record<string, unknown>, title?: string) => void | Promise<void>
  onCreateCard?: (cardType: string, config: Record<string, unknown>, title?: string) => void
}

export function ConfigureCardModal({ isOpen, card, onClose, onSave, onCreateCard }: ConfigureCardModalProps) {
  const { t } = useTranslation()
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [behaviors, setBehaviors] = useState<Record<string, boolean>>({})
  const [title, setTitle] = useState('')
  const [nlPrompt, setNlPrompt] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'settings' | 'behaviors' | 'ai'>('settings')
  const [aiChanges, setAiChanges] = useState<string[]>([])
  const [aiError, setAiError] = useState<string | null>(null)
  const { deduplicatedClusters: clusters } = useClusters()
  const { addTokens } = useTokenUsage()
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (closeTimeoutRef.current !== null) clearTimeout(closeTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (card) {
      setConfig(card.config || {})
      setTitle(card.title || '')
      // Initialize behaviors from config or defaults (use default behaviors for unknown card types)
      const cardBehaviors = CARD_BEHAVIORS[card.card_type] || CARD_BEHAVIORS.default || []
      const initialBehaviors: Record<string, boolean> = {}
      cardBehaviors.forEach((b) => {
        initialBehaviors[b.key] = (card.config?.[b.key] as boolean) ?? b.default
      })
      setBehaviors(initialBehaviors)
    }
  }, [card])

  if (!card) return null

  const fields = CARD_CONFIG_FIELDS[card.card_type] || CARD_CONFIG_FIELDS.default || []
  const cardBehaviors = CARD_BEHAVIORS[card.card_type] || CARD_BEHAVIORS.default || []

  const handleSave = async () => {
    if (isSaving) return
    const finalConfig = { ...config, ...behaviors }
    setIsSaving(true)
    try {
      await onSave(card.id, finalConfig, title || undefined)
    } finally {
      if (isMountedRef.current) setIsSaving(false)
    }
  }

  const updateConfig = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const toggleBehavior = (key: string) => {
    setBehaviors((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Detect what card type the user is asking for
  const detectCardType = (prompt: string): string | null => {
    const lowerPrompt = prompt.toLowerCase()

    for (const { patterns, cardType } of CARD_TYPE_PATTERNS) {
      for (const pattern of patterns) {
        if (lowerPrompt.includes(pattern)) {
          return cardType
        }
      }
    }
    return null
  }

  // Extract configuration from prompt
  const extractConfigFromPrompt = (prompt: string): { config: Record<string, unknown>; behaviors: Record<string, boolean>; title?: string } => {
    const lowerPrompt = prompt.toLowerCase()
    const newConfig: Record<string, unknown> = {}
    const newBehaviors: Record<string, boolean> = {}
    let extractedTitle: string | undefined

    // Cluster extraction
    const clusterMatch = prompt.match(/(?:from|in|for|on|cluster[:\s]+)([a-z0-9-_]+)(?:\s+cluster)?/i)
    if (clusterMatch && clusterMatch[1]) {
      const clusterName = clusterMatch[1]
      const matchedCluster = clusters.find(c =>
        c.name.toLowerCase().includes(clusterName.toLowerCase()) ||
        clusterName.toLowerCase().includes(c.name.toLowerCase())
      )
      if (matchedCluster) {
        newConfig.cluster = matchedCluster.name
      } else {
        // Still set it even if not found - might be valid
        newConfig.cluster = clusterName
      }
    }

    // Namespace extraction
    const namespaceMatch = prompt.match(/(?:namespace[:\s]+|ns[:\s]+|in\s+)([a-z0-9-_]+)/i)
    if (namespaceMatch && namespaceMatch[1] && !['the', 'a', 'an', 'from', 'cluster'].includes(namespaceMatch[1].toLowerCase())) {
      newConfig.namespace = namespaceMatch[1]
    }

    // Limit extraction
    const limitMatch = prompt.match(/(?:show|display|limit|max|top)\s*(\d+)/i)
    if (limitMatch && limitMatch[1]) {
      newConfig.limit = parseInt(limitMatch[1])
    }

    // Behaviors based on keywords
    if (lowerPrompt.includes('warning') || lowerPrompt.includes('error')) {
      newBehaviors.warningsOnly = true
    }
    if (lowerPrompt.includes('alert') || lowerPrompt.includes('notify')) {
      newBehaviors.alertOnNew = true
      newBehaviors.alertOnCritical = true
    }
    if (lowerPrompt.includes('sound') && !lowerPrompt.includes('no sound')) {
      newBehaviors.soundOnWarning = true
    }
    if (lowerPrompt.includes('group') && lowerPrompt.includes('cluster')) {
      newBehaviors.groupByCluster = true
    }
    if (lowerPrompt.includes('unhealthy') && (lowerPrompt.includes('first') || lowerPrompt.includes('priority'))) {
      newBehaviors.showUnhealthyFirst = true
    }

    // Title extraction
    const titleMatch = prompt.match(/(?:title|name|call it|called)[:\s]+["']?([^"']+)["']?$/i)
    if (titleMatch && titleMatch[1]) {
      extractedTitle = titleMatch[1].trim()
    }

    return { config: newConfig, behaviors: newBehaviors, title: extractedTitle }
  }

  const handleNLSubmit = async () => {
    if (!nlPrompt.trim()) return
    setIsProcessing(true)
    setAiChanges([])
    setAiError(null)

    // Small delay for UX feedback
    await new Promise((resolve) => setTimeout(resolve, PROGRESS_SIMULATION_MS))

    if (!isMountedRef.current) return

    const prompt = nlPrompt.trim()
    const detectedCardType = detectCardType(prompt)
    const { config: extractedConfig, behaviors: extractedBehaviors, title: extractedTitle } = extractConfigFromPrompt(prompt)

    // If detected a different card type than current, create a new card
    if (detectedCardType && detectedCardType !== card?.card_type && onCreateCard) {
      const newConfig = { ...extractedConfig, ...extractedBehaviors }
      const newTitle = extractedTitle || generateCardTitle(detectedCardType, extractedConfig)

      onCreateCard(detectedCardType, newConfig, newTitle)

      // Track token usage for AI card creation (estimate ~500 tokens for parsing + generation)
      addTokens(500 + Math.ceil(prompt.length / 4))

      setAiChanges([
        `Created new "${detectedCardType.replace(/_/g, ' ')}" card`,
        ...Object.entries(extractedConfig).map(([k, v]) => `• ${k}: ${v}`),
        ...Object.entries(extractedBehaviors).filter(([, v]) => v).map(([k]) => `• ${k} enabled`),
      ])

      setNlPrompt('')
      setIsProcessing(false)

      // Close modal after showing success briefly
      if (closeTimeoutRef.current !== null) clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = setTimeout(() => {
        onClose()
      }, 1500)
      return
    }

    // Otherwise, modify the current card
    const changes: string[] = []

    // Apply extracted config
    if (Object.keys(extractedConfig).length > 0) {
      setConfig((prev) => ({ ...prev, ...extractedConfig }))
      Object.entries(extractedConfig).forEach(([k, v]) => {
        changes.push(`Set ${k} to ${v}`)
      })
    }

    // Apply extracted behaviors
    if (Object.keys(extractedBehaviors).length > 0) {
      setBehaviors((prev) => ({ ...prev, ...extractedBehaviors }))
      Object.entries(extractedBehaviors).filter(([, v]) => v).forEach(([k]) => {
        changes.push(`Enabled ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`)
      })
    }

    // Apply title
    if (extractedTitle) {
      setTitle(extractedTitle)
      changes.push(`Set title to "${extractedTitle}"`)
    }

    if (changes.length === 0) {
      // Couldn't understand - suggest creating a new card
      setAiError(
        `${t('cardConfig.aiError')}\n` +
        `• "${t('cardConfig.aiErrorExample1')}"\n` +
        `• "${t('cardConfig.aiErrorExample2')}"\n` +
        `• "${t('cardConfig.aiErrorExample3')}"`
      )
    } else {
      // Track token usage for AI config modification (estimate ~300 tokens for parsing)
      addTokens(300 + Math.ceil(prompt.length / 4))
      setAiChanges(changes)
    }

    setNlPrompt('')
    setIsProcessing(false)
  }

  // Generate a descriptive title for a new card
  const generateCardTitle = (cardType: string, config: Record<string, unknown>): string => {
    const parts: string[] = []

    switch (cardType) {
      case 'event_stream':
        parts.push('Events')
        break
      case 'pod_issues':
        parts.push('Pod Issues')
        break
      case 'deployment_status':
        parts.push('Deployments')
        break
      case 'deployment_issues':
        parts.push('Deployment Issues')
        break
      case 'cluster_health':
        parts.push('Cluster Health')
        break
      case 'resource_usage':
        parts.push('Resource Usage')
        break
      case 'gpu_status':
        parts.push('GPU Status')
        break
      default:
        parts.push(cardType.replace(/_/g, ' '))
    }

    if (config.cluster) {
      const clusterName = String(config.cluster).split('/').pop()
      parts.push(`(${clusterName})`)
    }
    if (config.namespace) {
      parts.push(`- ${config.namespace}`)
    }

    return parts.join(' ')
  }

  const tabs = [
    { id: 'settings', label: t('dashboard.configure.settingsTab'), icon: Settings },
    { id: 'behaviors', label: t('dashboard.configure.behaviorsTab'), icon: ToggleLeft },
    { id: 'ai', label: t('dashboard.configure.aiConfigureTab'), icon: Sparkles },
  ]

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md" closeOnBackdrop={false}>
      <BaseModal.Header
        title={t('dashboard.configure.title')}
        description={t('dashboard.configure.description', { name: card.title || card.card_type })}
        icon={Settings}
        showBack={false}
      />

      <BaseModal.Tabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as 'settings' | 'behaviors' | 'ai')}
      />

      <BaseModal.Content className="max-h-[50vh]">
          {activeTab === 'settings' && (
            <div className="space-y-4">
              {/* Title field */}
              <div>
                <label className="block text-sm text-muted-foreground mb-1">{t('dashboard.configure.cardTitle')}</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('dashboard.configure.cardTitlePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                />
              </div>

              {/* Dynamic config fields */}
              {fields.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm text-muted-foreground mb-1">{t(`cardConfig.fieldLabels.${field.key}`, field.label)}</label>
                  {field.type === 'cluster' ? (
                    <select
                      value={(config[field.key] as string) || ''}
                      onChange={(e) => updateConfig(field.key, e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                    >
                      <option value="">{t('cardConfig.allClusters')}</option>
                      {clusters.map((c) => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  ) : field.type === 'select' ? (
                    <select
                      value={(config[field.key] as string) || ''}
                      onChange={(e) => updateConfig(field.key, e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                    >
                      <option value="">{t('cardConfig.default')}</option>
                      <option value="cpu">{t('cardConfig.cpuUsage')}</option>
                      <option value="memory">{t('cardConfig.memoryUsage')}</option>
                      <option value="pods">{t('cardConfig.podCount')}</option>
                    </select>
                  ) : field.type === 'number' ? (
                    <input
                      type="number"
                      value={(config[field.key] as number) || ''}
                      onChange={(e) => updateConfig(field.key, parseInt(e.target.value) || undefined)}
                      placeholder={t('dashboard.configure.defaultPlaceholder')}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                    />
                  ) : (
                    <input
                      type="text"
                      value={(config[field.key] as string) || ''}
                      onChange={(e) => updateConfig(field.key, e.target.value || undefined)}
                      placeholder={t('dashboard.configure.enterField', { field: field.label.toLowerCase() })}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                    />
                  )}
                </div>
              ))}

              {fields.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('dashboard.configure.noSettings')}
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
                      'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                      behaviors[behavior.key]
                        ? 'bg-purple-500 border-purple-500'
                        : 'border-border'
                    )}>
                      {behaviors[behavior.key] && (
                        <svg className="w-3 h-3 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{t(`cardConfig.behaviorLabels.${behavior.key}`, behavior.label)}</p>
                      <p className="text-xs text-muted-foreground">{wrapAbbreviations(behavior.description)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {t('dashboard.configure.noBehaviors')}
                </p>
              )}
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-purple-300">{t('dashboard.configure.aiPoweredConfig')}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('dashboard.configure.aiConfigDescription')}
                </p>
              </div>

              {/* Applied changes feedback */}
              {aiChanges.length > 0 && (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm font-medium text-green-300">{t('dashboard.configure.appliedChanges')}</span>
                  </div>
                  <ul className="text-xs text-green-200 space-y-1">
                    {aiChanges.map((change, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="text-green-400">•</span>
                        {change}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Error feedback */}
              {aiError && (
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="text-sm text-yellow-300">{aiError}</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm text-muted-foreground mb-1">
                  {t('dashboard.configure.describePreferences')}
                </label>
                <textarea
                  value={nlPrompt}
                  onChange={(e) => {
                    setNlPrompt(e.target.value)
                    setAiError(null) // Clear error on new input
                  }}
                  placeholder={t('dashboard.configure.aiPlaceholder')}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm h-24 resize-none"
                  disabled={isProcessing}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && nlPrompt.trim()) {
                      e.preventDefault()
                      handleNLSubmit()
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground mt-1">{t('dashboard.configure.pressEnterHint')}</p>
              </div>

              <button
                onClick={handleNLSubmit}
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
                    {t('dashboard.configure.processing')}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {t('dashboard.configure.applyConfiguration')}
                  </>
                )}
              </button>

              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium">{t('dashboard.configure.examplePrompts')}</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>"{t('cardConfig.examplePrompts.showWarnings')}"</li>
                  <li>"{t('cardConfig.examplePrompts.alertCritical')}"</li>
                  <li>"{t('cardConfig.examplePrompts.prioritizeUnhealthy')}"</li>
                  <li>"{t('cardConfig.examplePrompts.filterNamespace')}"</li>
                  <li>"{t('cardConfig.examplePrompts.groupEvents')}"</li>
                  <li>"{t('cardConfig.examplePrompts.setTitle')}"</li>
                </ul>
              </div>
            </div>
          )}
        </BaseModal.Content>

        <BaseModal.Footer showKeyboardHints>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('actions.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg bg-purple-500 text-foreground hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? t('dashboard.configure.saving', 'Saving...') : t('dashboard.configure.saveChanges')}
            </button>
          </div>
        </BaseModal.Footer>
    </BaseModal>
  )
}
