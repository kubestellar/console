import type { KeyboardEvent } from 'react'
import type { TFunction } from 'i18next'
import { Loader2, Sparkles } from 'lucide-react'
import { cn } from '../../lib/cn'

interface ConfigureCardAiTabProps {
  nlPrompt: string
  isProcessing: boolean
  aiChanges: string[]
  aiError: string | null
  t: TFunction
  onPromptChange: (value: string) => void
  onSubmit: () => void
}

export function ConfigureCardAiTab({
  nlPrompt,
  isProcessing,
  aiChanges,
  aiError,
  t,
  onPromptChange,
  onSubmit,
}: ConfigureCardAiTabProps) {
  const canSubmit = nlPrompt.trim().length > 0 && !isProcessing

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && nlPrompt.trim()) {
      event.preventDefault()
      onSubmit()
    }
  }

  return (
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

      {aiChanges.length > 0 && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-medium text-green-300">{t('dashboard.configure.appliedChanges')}</span>
          </div>
          <ul className="text-xs text-green-200 space-y-1">
            {aiChanges.map((change, index) => (
              <li key={index} className="flex items-center gap-2">
                <span className="text-green-400">•</span>
                {change}
              </li>
            ))}
          </ul>
        </div>
      )}

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
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder={t('dashboard.configure.aiPlaceholder')}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm h-24 resize-none"
          disabled={isProcessing}
          onKeyDown={handleKeyDown}
        />
        <p className="text-xs text-muted-foreground mt-1">{t('dashboard.configure.pressEnterHint')}</p>
      </div>

      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors',
          canSubmit
            ? 'bg-purple-500 text-foreground hover:bg-purple-600'
            : 'bg-secondary text-muted-foreground cursor-not-allowed',
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
  )
}
