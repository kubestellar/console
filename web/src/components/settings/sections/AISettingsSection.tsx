import { useTranslation } from 'react-i18next'
import { Cpu } from 'lucide-react'
import { AIMode } from '../../../hooks/useAIMode'
import { emitAIModeChanged } from '../../../lib/analytics'
import { RangeSliderInput } from '../../ui/RangeSliderInput'

interface AISettingsSectionProps {
  mode: AIMode
  setMode: (mode: AIMode) => void
  description: string
}

const AI_MODE_LOW_INDEX = 0
const AI_MODE_MEDIUM_INDEX = 1
const AI_MODE_HIGH_INDEX = 2
const AI_MODE_SLIDER_STEP = 1

function getSliderValue(mode: AIMode): number {
  switch (mode) {
    case 'low':
      return AI_MODE_LOW_INDEX
    case 'medium':
      return AI_MODE_MEDIUM_INDEX
    default:
      return AI_MODE_HIGH_INDEX
  }
}

function getModeFromSliderValue(value: number): AIMode {
  switch (value) {
    case AI_MODE_LOW_INDEX:
      return 'low'
    case AI_MODE_MEDIUM_INDEX:
      return 'medium'
    default:
      return 'high'
  }
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
          <RangeSliderInput
            min={AI_MODE_LOW_INDEX}
            max={AI_MODE_HIGH_INDEX}
            step={AI_MODE_SLIDER_STEP}
            value={getSliderValue(mode)}
            onChange={(event) => {
              const newMode = getModeFromSliderValue(Number(event.target.value))
              setMode(newMode)
              emitAIModeChanged(newMode)
            }}
            aria-label="AI usage mode"
            aria-valuetext={`${mode} AI mode`}
            aria-describedby="ai-mode-low ai-mode-high"
            containerClassName="flex-1"
            className="[&::-webkit-slider-thumb]:bg-purple-500 [&::-moz-range-thumb]:bg-purple-500"
            fillClassName="bg-purple-500"
          />
          <span id="ai-mode-high" className="text-sm text-muted-foreground w-20 text-right">{t('settings.aiMode.highAI')}</span>
        </div>

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
