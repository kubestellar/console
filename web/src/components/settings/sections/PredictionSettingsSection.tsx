import { useState } from 'react'
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
  const [saved, setSaved] = useState(false)
  const { getStats, clearFeedback, feedbackCount } = usePredictionFeedback()
  const stats = getStats()

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
    updateSettings({ interval: Math.min(Math.max(value, 5), 30) })
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
    <div className="glass rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/20">
            <TrendingUp className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-foreground">Predictive Failure Detection</h2>
            <p className="text-sm text-muted-foreground">Configure AI-powered prediction settings</p>
          </div>
        </div>
        <button
          onClick={resetSettings}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          title="Reset to defaults"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
      </div>

      <div className="space-y-6">
        {/* AI Predictions Toggle */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-3">
            <Sparkles className={`w-5 h-5 ${settings.aiEnabled ? 'text-blue-400' : 'text-muted-foreground'}`} />
            <div>
              <p className="text-sm font-medium text-foreground">AI Predictions</p>
              <p className="text-xs text-muted-foreground">
                Analyze cluster data with AI to detect patterns
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
                  Analysis Interval: {settings.interval} minutes
                </label>
                <div className="relative group">
                  <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                  <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-48 p-2 text-xs bg-popover border border-border rounded-lg shadow-lg z-10">
                    How often AI analyzes cluster data. Lower = more API calls.
                  </div>
                </div>
              </div>
              <input
                type="range"
                min="5"
                max="30"
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
                <span>5 min (more updates)</span>
                <span>30 min (fewer API calls)</span>
              </div>
            </div>

            {/* Confidence Threshold */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Percent className="w-4 h-4 text-muted-foreground" />
                <label className="text-sm text-foreground">
                  Minimum Confidence: {settings.minConfidence}%
                </label>
                <div className="relative group">
                  <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                  <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-48 p-2 text-xs bg-popover border border-border rounded-lg shadow-lg z-10">
                    Only show predictions with confidence above this threshold.
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
                <span>50% (more predictions)</span>
                <span>90% (only high confidence)</span>
              </div>
            </div>

            {/* Consensus Mode */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/20">
              <div className="flex items-center gap-3">
                <Layers className={`w-4 h-4 ${settings.consensusMode ? 'text-purple-400' : 'text-muted-foreground'}`} />
                <div>
                  <p className="text-sm font-medium text-foreground">Multi-Provider Consensus</p>
                  <p className="text-xs text-muted-foreground">
                    Run analysis on multiple AI providers, boost confidence when they agree
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
        <CollapsibleSection title="Heuristic Thresholds" defaultOpen={false}>
          <div className="space-y-4 p-4 rounded-lg bg-secondary/20">
            <p className="text-xs text-muted-foreground mb-4">
              These thresholds trigger instant predictions without AI analysis.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="restart-threshold" className="block text-xs text-muted-foreground mb-1">
                  Pod Restart Warning
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
                <p className="text-xs text-muted-foreground mt-1">restarts</p>
              </div>

              <div>
                <label htmlFor="cpu-threshold" className="block text-xs text-muted-foreground mb-1">
                  CPU Pressure Warning
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
                <p className="text-xs text-muted-foreground mt-1">% usage</p>
              </div>

              <div>
                <label htmlFor="memory-threshold" className="block text-xs text-muted-foreground mb-1">
                  Memory Pressure Warning
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
                <p className="text-xs text-muted-foreground mt-1">% usage</p>
              </div>

              <div>
                <label htmlFor="gpu-threshold" className="block text-xs text-muted-foreground mb-1">
                  GPU Memory Pressure
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
                <p className="text-xs text-muted-foreground mt-1">% usage</p>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Feedback Stats */}
        {feedbackCount > 0 && (
          <CollapsibleSection
            title="Prediction Accuracy"
            defaultOpen={false}
            badge={
              <span className="text-xs text-muted-foreground">
                {(stats.accuracyRate * 100).toFixed(0)}% accurate
              </span>
            }
          >
            <div className="p-4 rounded-lg bg-secondary/20">
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{stats.totalPredictions}</p>
                  <p className="text-xs text-muted-foreground">Total Rated</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-400">{stats.accurateFeedback}</p>
                  <p className="text-xs text-muted-foreground">Accurate</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-400">{stats.inaccurateFeedback}</p>
                  <p className="text-xs text-muted-foreground">Inaccurate</p>
                </div>
              </div>

              {Object.keys(stats.byProvider).length > 1 && (
                <div className="border-t border-border pt-3 mt-3">
                  <p className="text-xs text-muted-foreground mb-2">By Provider:</p>
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
                Clear feedback history
              </button>
            </div>
          </CollapsibleSection>
        )}

        {/* Save indicator */}
        {saved && (
          <div className="flex items-center gap-2 text-green-400 text-sm">
            <Save className="w-4 h-4" />
            Settings saved
          </div>
        )}
      </div>
    </div>
  )
}
