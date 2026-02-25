import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { TrendingUp, Save, RotateCcw, Sparkles, Clock, Percent, Layers, Info } from 'lucide-react'
import type { PredictionSettings } from '../../../types/predictions'
import { usePredictionFeedback } from '../../../hooks/usePredictionFeedback'
import { CollapsibleSection } from '../../ui/CollapsibleSection'

interface PredictionSettingsSectionProps {
  settings: PredictionSettings
  updateSettings: (updates: Partial<PredictionSettings>) => void
  resetSettings: () => void
}

export function PredictionSettingsSection({
  settings,
  updateSettings,
  resetSettings,
}: PredictionSettingsSectionProps) {
  const { t } = useTranslation()
  const [saved, setSaved] = useState(false)
  const { getStats, clearFeedback, feedbackCount } = usePredictionFeedback()
  const stats = getStats()
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    return () => clearTimeout(savedTimerRef.current)
  }, [])

  const handleSave = () => {
    setSaved(true)
    clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000)
  }

  const handleToggleAI = () => {
    updateSettings({ aiEnabled: !settings.aiEnabled })
    handleSave()
  }

  const handleToggleConsensus = () => {
    updateSettings({ consensusMode: !settings.consensusMode })
    handleSave()
  }

  const handleIntervalChange = (value: number) => {
    updateSettings({ interval: Math.min(Math.max(value, 15), 120) })
  }

  const handleConfidenceChange = (value: number) => {
    updateSettings({ minConfidence: Math.min(Math.max(value, 50), 90) })
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
        <button
          onClick={resetSettings}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          title="Reset to defaults"
        >
          <RotateCcw className="w-4 h-4" />
          {t('settings.predictions.reset')}
        </button>
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
            onClick={handleToggleAI}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              settings.aiEnabled ? 'bg-blue-500' : 'bg-secondary'
            }`}
            aria-label={settings.aiEnabled ? 'Disable AI predictions' : 'Enable AI predictions'}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
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
                <label className="text-sm text-foreground">
                  {t('settings.predictions.analysisInterval', { minutes: settings.interval })}
                </label>
                <div className="relative group">
                  <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                  <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-48 p-2 text-xs bg-popover border border-border rounded-lg shadow-lg z-10">
                    {t('settings.predictions.analysisIntervalDesc')}
                  </div>
                </div>
              </div>
              <input
                type="range"
                min="15"
                max="120"
                step="15"
                value={settings.interval}
                onChange={(e) => handleIntervalChange(parseInt(e.target.value))}
                className="w-full h-2 bg-secondary rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-4
                  [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:bg-blue-500
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:cursor-pointer"
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
                <label className="text-sm text-foreground">
                  {t('settings.predictions.minConfidence', { percent: settings.minConfidence })}
                </label>
                <div className="relative group">
                  <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                  <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-48 p-2 text-xs bg-popover border border-border rounded-lg shadow-lg z-10">
                    {t('settings.predictions.minConfidenceDesc')}
                  </div>
                </div>
              </div>
              <input
                type="range"
                min="50"
                max="90"
                value={settings.minConfidence}
                onChange={(e) => handleConfidenceChange(parseInt(e.target.value))}
                className="w-full h-2 bg-secondary rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-4
                  [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:bg-blue-500
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:cursor-pointer"
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
                onClick={handleToggleConsensus}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  settings.consensusMode ? 'bg-purple-500' : 'bg-secondary'
                }`}
                aria-label={settings.consensusMode ? 'Disable consensus mode' : 'Enable consensus mode'}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
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
