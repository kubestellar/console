import { useTranslation } from 'react-i18next'
import { Cpu } from 'lucide-react'
import { AIMode } from '../../../hooks/useAIMode'

interface AISettingsSectionProps {
  mode: AIMode
  setMode: (mode: AIMode) => void
  description: string
}

export function AISettingsSection({ mode, setMode, description }: AISettingsSectionProps) {
  const { t } = useTranslation()
  return (
    <div id="ai-mode-settings" className="glass rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-secondary">
          <Cpu className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-foreground">{t('settings.aiMode.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('settings.aiMode.subtitle')}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <span id="ai-mode-low" className="text-sm text-muted-foreground w-20">{t('settings.aiMode.lowAI')}</span>
          <input
            type="range"
            min="0"
            max="2"
            value={mode === 'low' ? 0 : mode === 'medium' ? 1 : 2}
            onChange={(e) => {
              const val = parseInt(e.target.value)
              setMode(val === 0 ? 'low' : val === 1 ? 'medium' : 'high')
            }}
            aria-label="AI usage mode"
            aria-valuetext={`${mode} AI mode`}
            aria-describedby="ai-mode-low ai-mode-high"
            className="flex-1 h-2 bg-secondary rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-4
              [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:bg-purple-500
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <span id="ai-mode-high" className="text-sm text-muted-foreground w-20 text-right">{t('settings.aiMode.highAI')}</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(['low', 'medium', 'high'] as AIMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`p-3 rounded-lg border transition-all ${
                mode === m
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-border hover:border-purple-500/50'
              }`}
            >
              <p className={`text-sm font-medium capitalize ${mode === m ? 'text-purple-400' : 'text-foreground'}`}>
                {m}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {m === 'low' && t('settings.aiMode.lowDesc')}
                {m === 'medium' && t('settings.aiMode.mediumDesc')}
                {m === 'high' && t('settings.aiMode.highDesc')}
              </p>
            </button>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
