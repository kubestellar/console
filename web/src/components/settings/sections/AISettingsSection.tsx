import { useTranslation } from 'react-i18next'
import { Cpu } from 'lucide-react'
import { AIMode } from '../../../hooks/useAIMode'
import { emitAIModeChanged } from '../../../lib/analytics'

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
        <div className="grid grid-cols-3 gap-2">
          {(['low', 'medium', 'high'] as AIMode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); emitAIModeChanged(m) }}
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
