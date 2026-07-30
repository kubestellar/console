import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { TrendingUp, Save, RotateCcw, Sparkles, Clock, Percent, Layers, Info } from 'lucide-react'
import type { PredictionSettings } from '../../../types/predictions'
import { usePredictionFeedback } from '../../../hooks/usePredictionFeedback'
import { CollapsibleSection } from '../../ui/CollapsibleSection'
import { Button } from '../../ui/Button'
import { RangeSliderInput } from '../../ui/RangeSliderInput'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { emitAIPredictionsToggled, emitConfidenceThresholdChanged, emitConsensusModeToggled } from '../../../lib/analytics'

interface PredictionSettingsSectionProps {
  settings: PredictionSettings
  updateSettings: (updates: Partial<PredictionSettings>) => void
  resetSettings: () => void
}

const ANALYSIS_INTERVAL_MINUTES = 15
const ANALYSIS_INTERVAL_MAX_MINUTES = 120
const ANALYSIS_INTERVAL_STEP_MINUTES = 15
const MIN_CONFIDENCE_PERCENT = 50
const MAX_CONFIDENCE_PERCENT = 90

export function PredictionSettingsSection({
  settings,
  updateSettings,
  resetSettings,
}: PredictionSettingsSectionProps) {
  const { t } = useTranslation()
  const [saved, setSaved] = useState(false)
  const { getStats, clearFeedback, feedbackCount } = usePredictionFeedback()
  const stats = getStats()
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => clearTimeout(savedTimerRef.current)
  }, [])

  const handleSave = () => {
    setSaved(true)
    clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaved(false), UI_FEEDBACK_TIMEOUT_MS)
  }

  const handleToggleAI = () => {
    const newValue = !settings.aiEnabled
    updateSettings({ aiEnabled: newValue })
    emitAIPredictionsToggled(newValue)
    handleSave()
  }

  const handleToggleConsensus = () => {
    const newValue = !settings.consensusMode
    updateSettings({ consensusMode: newValue })
    emitConsensusModeToggled(newValue)
    handleSave()
  }

  const handleIntervalChange = (value: number) => {
    updateSettings({
      interval: Math.min(Math.max(value, ANALYSIS_INTERVAL_MINUTES), ANALYSIS_INTERVAL_MAX_MINUTES),
    })
  }

  const handleConfidenceChange = (value: number) => {
    const clamped = Math.min(Math.max(value, MIN_CONFIDENCE_PERCENT), MAX_CONFIDENCE_PERCENT)
    updateSettings({ minConfidence: clamped })
    emitConfidenceThresholdChanged(clamped)
  }

  const handleThresholdChange = (key: keyof PredictionSettings['thresholds'], value: number) => {
    updateSettings({
      thresholds: {
        ...settings.thresholds,
        [key]: value,
      },
    })
  }

  return (
    <div id="prediction-settings" className="glass rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-secondary">
            <TrendingUp className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-foreground">{t('settings.predictions.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('settings.predictions.subtitle')}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="md"
          icon={<RotateCcw className="w-4 h-4" />}
          onClick={resetSettings}
          title="Reset to defaults"
        >
          {t('settings.predictions.reset')}
        </Button>
      </div>

      <div className="space-y-6">
        {/* AI Predictions Toggle */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-3">
            <Sparkles className={`w-5 h-5 ${settings.aiEnabled ? 'text-blue-400' : 'text-muted-foreground'}`} />
            <div>
              <p className="text-sm font-medium text-foreground">{t('settings.predictions.aiPredictions')}</p>
              <p className="text-xs text-muted-foreground">
                {t('settings.predictions.aiPredictionsDesc')}
              </p>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={settings.aiEnabled}
            onClick={handleToggleAI}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              settings.aiEnabled ? 'bg-blue-500' : 'bg-secondary'
            }`}
            aria-label={settings.aiEnabled ? 'Disable AI predictions' : 'Enable AI predictions'}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white dark:bg-gray-100 transition-transform ${
                settings.aiEnabled ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        </div>

        {/* AI Settings (only show when AI enabled) */}
        {settings.aiEnabled && (
          <div className="space-y-4 pl-4 border-l-2 border-blue-500/30">
            {/* Analysis Interval */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <label htmlFor="predictions-analysis-interval" className="text-sm text-foreground">
                  {t('settings.predictions.analysisInterval', { minutes: settings.interval })}
                </label>
                <div className="relative group">
                  <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                  <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-48 p-2 text-xs bg-popover border border-border rounded-lg shadow-lg z-10">
                    {t('settings.predictions.analysisIntervalDesc')}
                  </div>
                </div>
              </div>
              <RangeSliderInput
                id="predictions-analysis-interval"
                min={ANALYSIS_INTERVAL_MINUTES}
                max={ANALYSIS_INTERVAL_MAX_MINUTES}
                step={ANALYSIS_INTERVAL_STEP_MINUTES}
                value={settings.interval}
                onChange={(event) => handleIntervalChange(Number(event.target.value))}
                className="[&::-webkit-slider-thumb]:bg-blue-500 [&::-moz-range-thumb]:bg-blue-500"
                fillClassName="bg-blue-500"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>{t('settings.predictions.intervalMin')}</span>
                <span>{t('settings.predictions.intervalMax')}</span>
              </div>
            </div>

            {/* Confidence Threshold */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Percent className="w-4 h-4 text-muted-foreground" />
                <label htmlFor="predictions-min-confidence" className="text-sm text-foreground">
                  {t('settings.predictions.minConfidence', { percent: settings.minConfidence })}
                </label>
                <div className="relative group">
                  <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                  <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-48 p-2 text-xs bg-popover border border-border rounded-lg shadow-lg z-10">
                    {t('settings.predictions.minConfidenceDesc')}
                  </div>
                </div>
              </div>
              <RangeSliderInput
                id="predictions-min-confidence"
                min={MIN_CONFIDENCE_PERCENT}
                max={MAX_CONFIDENCE_PERCENT}
                value={settings.minConfidence}
                onChange={(event) => handleConfidenceChange(Number(event.target.value))}
                className="[&::-webkit-slider-thumb]:bg-blue-500 [&::-moz-range-thumb]:bg-blue-500"
                fillClassName="bg-blue-500"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>{t('settings.predictions.confidenceMin')}</span>
                <span>{t('settings.predictions.confidenceMax')}</span>
              </div>
            </div>

            {/* Consensus Mode */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/20">
              <div className="flex items-center gap-3">
                <Layers className={`w-4 h-4 ${settings.consensusMode ? 'text-purple-400' : 'text-muted-foreground'}`} />
                <div>
                  <p className="text-sm font-medium text-foreground">{t('settings.predictions.multiProvider')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.predictions.multiProviderDesc')}
                  </p>
                </div>
              </div>
              <button
                role="switch"
                aria-checked={settings.consensusMode}
                onClick={handleToggleConsensus}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  settings.consensusMode ? 'bg-purple-500' : 'bg-secondary'
                }`}
                aria-label={settings.consensusMode ? 'Disable consensus mode' : 'Enable consensus mode'}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white dark:bg-gray-100 transition-transform ${
                    settings.consensusMode ? 'left-5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {/* Heuristic Thresholds */}
        <CollapsibleSection title={t('settings.predictions.heuristicThresholds')} defaultOpen={false}>
          <div className="space-y-4 p-4 rounded-lg bg-secondary/20">
            <p className="text-xs text-muted-foreground mb-4">
              {t('settings.predictions.heuristicThresholdsDesc')}
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="restart-threshold" className="block text-xs text-muted-foreground mb-1">
                  {t('settings.predictions.podRestartWarning')}
                </label>
                <input
                  id="restart-threshold"
                  type="number"
                  value={settings.thresholds.highRestartCount}
                  onChange={(e) => handleThresholdChange('highRestartCount', parseInt(e.target.value) || 3)}
                  min="1"
                  max="20"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">{t('settings.predictions.restarts')}</p>
              </div>

              <div>
                <label htmlFor="cpu-threshold" className="block text-xs text-muted-foreground mb-1">
                  {t('settings.predictions.cpuPressure')}
                </label>
                <input
                  id="cpu-threshold"
                  type="number"
                  value={settings.thresholds.cpuPressure}
                  onChange={(e) => handleThresholdChange('cpuPressure', parseInt(e.target.value) || 80)}
                  min="50"
                  max="99"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">{t('settings.predictions.percentUsage')}</p>
              </div>

              <div>
                <label htmlFor="memory-threshold" className="block text-xs text-muted-foreground mb-1">
                  {t('settings.predictions.memoryPressure')}
                </label>
                <input
                  id="memory-threshold"
                  type="number"
                  value={settings.thresholds.memoryPressure}
                  onChange={(e) => handleThresholdChange('memoryPressure', parseInt(e.target.value) || 85)}
                  min="50"
                  max="99"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">{t('settings.predictions.percentUsage')}</p>
              </div>

              <div>
                <label htmlFor="gpu-threshold" className="block text-xs text-muted-foreground mb-1">
                  {t('settings.predictions.gpuMemoryPressure')}
                </label>
                <input
                  id="gpu-threshold"
                  type="number"
                  value={settings.thresholds.gpuMemoryPressure}
                  onChange={(e) => handleThresholdChange('gpuMemoryPressure', parseInt(e.target.value) || 90)}
                  min="50"
                  max="99"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">{t('settings.predictions.percentUsage')}</p>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Feedback Stats */}
        {feedbackCount > 0 && (
          <CollapsibleSection
            title={t('settings.predictions.predictionAccuracy')}
            defaultOpen={false}
            badge={
              <span className="text-xs text-muted-foreground">
                {t('settings.predictions.percentAccurate', { percent: (stats.accuracyRate * 100).toFixed(0) })}
              </span>
            }
          >
            <div className="p-4 rounded-lg bg-secondary/20">
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{stats.totalPredictions}</p>
                  <p className="text-xs text-muted-foreground">{t('settings.predictions.totalRated')}</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-400">{stats.accurateFeedback}</p>
                  <p className="text-xs text-muted-foreground">{t('settings.predictions.accurate')}</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-400">{stats.inaccurateFeedback}</p>
                  <p className="text-xs text-muted-foreground">{t('settings.predictions.inaccurate')}</p>
                </div>
              </div>

              {Object.keys(stats.byProvider).length > 1 && (
                <div className="border-t border-border pt-3 mt-3">
                  <p className="text-xs text-muted-foreground mb-2">{t('settings.predictions.byProvider')}</p>
                  <div className="space-y-1">
                    {Object.entries(stats.byProvider).map(([provider, data]) => (
                      <div key={provider} className="flex justify-between text-xs">
                        <span className="text-foreground capitalize">{provider}</span>
                        <span className="text-muted-foreground">
                          {(data.accuracyRate * 100).toFixed(0)}% ({data.accurate}/{data.total})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={clearFeedback}
                className="mt-4 text-xs text-muted-foreground hover:text-red-400 transition-colors"
              >
                {t('settings.predictions.clearFeedback')}
              </button>
            </div>
          </CollapsibleSection>
        )}

        {/* Save indicator */}
        {saved && (
          <div className="flex items-center gap-2 text-green-400 text-sm">
            <Save className="w-4 h-4" />
            {t('settings.predictions.settingsSaved')}
          </div>
        )}
      </div>
    </div>
  )
}
