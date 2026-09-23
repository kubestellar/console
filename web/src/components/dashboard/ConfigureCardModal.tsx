import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings, Sparkles, ToggleLeft } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useTokenUsage } from '../../hooks/useTokenUsage'
import { BaseModal } from '../../lib/modals'
import { PROGRESS_SIMULATION_MS } from '../../lib/constants/network'
import { CARD_BEHAVIORS, CARD_CONFIG_FIELDS } from './cardConfigData'
import { ConfigureCardAiTab } from './ConfigureCardAiTab'
import { ConfigureCardBehaviorsTab } from './ConfigureCardBehaviorsTab'
import { ConfigureCardSettingsTab } from './ConfigureCardSettingsTab'
import { detectCardType, extractConfigFromPrompt, generateCardTitle } from './configureCardNL'
import { useToast } from '../ui/Toast'

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

type ConfigureCardTab = 'settings' | 'behaviors' | 'ai'

export function ConfigureCardModal({ isOpen, card, onClose, onSave, onCreateCard }: ConfigureCardModalProps) {
  const { t } = useTranslation()
  const { deduplicatedClusters: clusters } = useClusters()
  const { addTokens } = useTokenUsage()
  const { showToast } = useToast()
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [behaviors, setBehaviors] = useState<Record<string, boolean>>({})
  const [title, setTitle] = useState('')
  const [nlPrompt, setNlPrompt] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<ConfigureCardTab>('settings')
  const [aiChanges, setAiChanges] = useState<string[]>([])
  const [aiError, setAiError] = useState<string | null>(null)
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (closeTimeoutRef.current !== null) clearTimeout(closeTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!card) return

    setConfig(card.config || {})
    setTitle(card.title || '')

    const nextBehaviors: Record<string, boolean> = {}
    const cardBehaviors = CARD_BEHAVIORS[card.card_type] || CARD_BEHAVIORS.default || []
    cardBehaviors.forEach((behavior) => {
      nextBehaviors[behavior.key] = (card.config?.[behavior.key] as boolean) ?? behavior.default
    })
    setBehaviors(nextBehaviors)
  }, [card])

  if (!card) return null

  const fields = CARD_CONFIG_FIELDS[card.card_type] || CARD_CONFIG_FIELDS.default || []
  const cardBehaviors = CARD_BEHAVIORS[card.card_type] || CARD_BEHAVIORS.default || []
  const tabs = [
    { id: 'settings', label: t('dashboard.configure.settingsTab'), icon: Settings },
    { id: 'behaviors', label: t('dashboard.configure.behaviorsTab'), icon: ToggleLeft },
    { id: 'ai', label: t('dashboard.configure.aiConfigureTab'), icon: Sparkles },
  ]

  const updateConfig = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const toggleBehavior = (key: string) => {
    setBehaviors((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handlePromptChange = (value: string) => {
    setNlPrompt(value)
    setAiError(null)
  }

  const handleSave = async () => {
    if (isSaving) return

    setIsSaving(true)
    try {
      await onSave(card.id, { ...config, ...behaviors }, title || undefined)
      showToast(t('dashboard.configure.saveSuccess', 'Card configuration saved'), 'success')
    } finally {
      if (isMountedRef.current) setIsSaving(false)
    }
  }

  const handleNLSubmit = async () => {
    const prompt = nlPrompt.trim()
    if (!prompt) return

    setIsProcessing(true)
    setAiChanges([])
    setAiError(null)

    await new Promise((resolve) => setTimeout(resolve, PROGRESS_SIMULATION_MS))
    if (!isMountedRef.current) return

    const detectedCardType = detectCardType(prompt)
    const { config: extractedConfig, behaviors: extractedBehaviors, title: extractedTitle } = extractConfigFromPrompt(prompt, clusters)

    if (detectedCardType && detectedCardType !== card.card_type && onCreateCard) {
      const newConfig = { ...extractedConfig, ...extractedBehaviors }
      const newTitle = extractedTitle || generateCardTitle(detectedCardType, extractedConfig)

      onCreateCard(detectedCardType, newConfig, newTitle)
      addTokens(500 + Math.ceil(prompt.length / 4))
      setAiChanges([
        `Created new "${detectedCardType.replace(/_/g, ' ')}" card`,
        ...Object.entries(extractedConfig).map(([key, value]) => `• ${key}: ${value}`),
        ...Object.entries(extractedBehaviors).filter(([, value]) => value).map(([key]) => `• ${key} enabled`),
      ])
      setNlPrompt('')
      setIsProcessing(false)

      if (closeTimeoutRef.current !== null) clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = setTimeout(() => {
        onClose()
      }, 1500)
      return
    }

    const changes: string[] = []

    if (Object.keys(extractedConfig).length > 0) {
      setConfig((prev) => ({ ...prev, ...extractedConfig }))
      Object.entries(extractedConfig).forEach(([key, value]) => {
        changes.push(`Set ${key} to ${value}`)
      })
    }

    if (Object.keys(extractedBehaviors).length > 0) {
      setBehaviors((prev) => ({ ...prev, ...extractedBehaviors }))
      Object.entries(extractedBehaviors)
        .filter(([, value]) => value)
        .forEach(([key]) => {
          changes.push(`Enabled ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}`)
        })
    }

    if (extractedTitle) {
      setTitle(extractedTitle)
      changes.push(`Set title to "${extractedTitle}"`)
    }

    if (changes.length === 0) {
      setAiError(
        `${t('cardConfig.aiError')}\n` +
        `• "${t('cardConfig.aiErrorExample1')}"\n` +
        `• "${t('cardConfig.aiErrorExample2')}"\n` +
        `• "${t('cardConfig.aiErrorExample3')}"`,
      )
    } else {
      addTokens(300 + Math.ceil(prompt.length / 4))
      setAiChanges(changes)
    }

    setNlPrompt('')
    setIsProcessing(false)
  }

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
        onTabChange={(tab) => setActiveTab(tab as ConfigureCardTab)}
      />

      <BaseModal.Content className="max-h-[50vh]">
        {activeTab === 'settings' && (
          <ConfigureCardSettingsTab
            title={title}
            fields={fields}
            config={config}
            clusters={clusters}
            t={t}
            onTitleChange={setTitle}
            updateConfig={updateConfig}
          />
        )}

        {activeTab === 'behaviors' && (
          <ConfigureCardBehaviorsTab
            cardBehaviors={cardBehaviors}
            behaviors={behaviors}
            t={t}
            toggleBehavior={toggleBehavior}
          />
        )}

        {activeTab === 'ai' && (
          <ConfigureCardAiTab
            nlPrompt={nlPrompt}
            isProcessing={isProcessing}
            aiChanges={aiChanges}
            aiError={aiError}
            t={t}
            onPromptChange={handlePromptChange}
            onSubmit={handleNLSubmit}
          />
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
