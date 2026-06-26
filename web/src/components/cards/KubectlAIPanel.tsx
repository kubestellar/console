// ai-quality-ignore — sub-component of Kubectl card, not a standalone card
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '../ui/Button'
import { useTranslation } from 'react-i18next'

interface AIAssistantPanelProps {
  onGenerateCommand: (prompt: string) => void
  onGenerateYAML: (prompt: string) => void
  isExecuting: boolean
}

export function AIAssistantPanel({
  onGenerateCommand,
  onGenerateYAML,
  isExecuting,
}: AIAssistantPanelProps) {
  const { t } = useTranslation(['cards'])
  const [aiPrompt, setAiPrompt] = useState('')

  return (
    <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-medium text-purple-300">{t('cards:kubectl.aiAssist')}</span>
      </div>
      <input
        type="text"
        value={aiPrompt}
        onChange={(e) => setAiPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onGenerateCommand(aiPrompt)
            setAiPrompt('')
          }
        }}
        placeholder="e.g., Create a deployment for nginx with 3 replicas"
        className="w-full px-3 py-2 text-sm bg-secondary rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/50"
      />
      <div className="flex gap-2 mt-2">
        <Button
          variant="accent"
          size="sm"
          onClick={() => {
            onGenerateCommand(aiPrompt)
            setAiPrompt('')
          }}
          disabled={isExecuting || !aiPrompt.trim()}
        >
          {t('cards:kubectl.generateCommand')}
        </Button>
        <Button
          variant="accent"
          size="sm"
          onClick={() => {
            onGenerateYAML(aiPrompt)
            setAiPrompt('')
          }}
          disabled={isExecuting || !aiPrompt.trim()}
          className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300"
        >
          {t('cards:kubectl.generateYAML')}
        </Button>
      </div>
    </div>
  )
}
