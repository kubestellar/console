import { Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SECONDS_PER_MINUTE, SECONDS_PER_HOUR } from '../../lib/constants/time'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import type { AlertConditionType } from '../../types/alerts'

type WeatherConditionType = 'severe_storm' | 'extreme_heat' | 'heavy_rain' | 'snow' | 'high_wind'

/** Preset duration options shown as clickable chips in the condition editor. */
const DURATION_PRESETS = [
  { label: 'Immediate', value: 0 },
  { label: '1 min', value: SECONDS_PER_MINUTE },
  { label: '5 min', value: 5 * SECONDS_PER_MINUTE },
  { label: '15 min', value: 15 * SECONDS_PER_MINUTE },
  { label: '1 hour', value: SECONDS_PER_HOUR },
] as const

interface ConditionTypeOption {
  value: AlertConditionType
  label: string
  description: string
}

interface AvailableCluster {
  name: string
}

interface AlertRuleConditionProps {
  conditionType: AlertConditionType
  onConditionTypeChange: (type: AlertConditionType) => void
  threshold: number
  onThresholdChange: (value: number) => void
  duration: number
  onDurationChange: (value: number) => void
  selectedClusters: string[]
  onToggleCluster: (name: string) => void
  weatherCondition: WeatherConditionType
  onWeatherConditionChange: (cond: WeatherConditionType) => void
  temperatureThreshold: number
  onTemperatureThresholdChange: (value: number) => void
  windSpeedThreshold: number
  onWindSpeedThresholdChange: (value: number) => void
  errors: Record<string, string>
  availableClusters: AvailableCluster[]
  conditionTypes: ConditionTypeOption[]
}

export function AlertRuleCondition({
  conditionType,
  onConditionTypeChange,
  threshold,
  onThresholdChange,
  duration,
  onDurationChange,
  selectedClusters,
  onToggleCluster,
  weatherCondition,
  onWeatherConditionChange,
  temperatureThreshold,
  onTemperatureThresholdChange,
  windSpeedThreshold,
  onWindSpeedThresholdChange,
  errors,
  availableClusters,
  conditionTypes,
}: AlertRuleConditionProps) {
  const { t } = useTranslation('common')

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-foreground">{t('alerts.condition')}</h4>

      <div>
        <label className="block text-xs text-muted-foreground mb-2">
          {t('alerts.conditionType')}
        </label>
        <div className="grid grid-cols-2 gap-2">
          {conditionTypes.map(type => (
            <button
              key={type.value}
              onClick={() => onConditionTypeChange(type.value)}
              className={`p-3 rounded-lg text-left transition-colors ${
                conditionType === type.value
                  ? 'bg-purple-500/20 border border-purple-500/50'
                  : 'bg-secondary border border-border hover:bg-secondary/80'
              }`}
              aria-label={`${type.label}: ${type.description}`}
              aria-pressed={conditionType === type.value}
            >
              <span className="text-sm font-medium text-foreground">{type.label}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">{type.description}</span>
            </button>
          ))}
        </div>
      </div>

      {['gpu_usage', 'memory_pressure'].includes(conditionType) && (
        <div>
          <label htmlFor="alertRuleThreshold" className="block text-xs text-muted-foreground mb-1">
            {t('alerts.thresholdPercent')}
          </label>
          <div className="flex items-center gap-2">
            <div className="w-24">
              <Input
                id="alertRuleThreshold"
                name="alertRuleThreshold"
                type="number"
                min={1}
                max={100}
                value={threshold}
                onChange={e => onThresholdChange(Number(e.target.value))}
                error={Boolean(errors.threshold)}
                className="focus:ring-purple-500"
              />
            </div>
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          {errors.threshold && (
            <span className="block text-xs text-red-400 mt-1">{errors.threshold}</span>
          )}
        </div>
      )}

      {conditionType === 'pod_crash' && (
        <div>
          <label htmlFor="alertRuleRestartThreshold" className="block text-xs text-muted-foreground mb-1">
            {t('alerts.restartCountThreshold')}
          </label>
          <div className="flex items-center gap-2">
            <div className="w-24">
              <Input
                id="alertRuleRestartThreshold"
                name="alertRuleRestartThreshold"
                type="number"
                min={1}
                max={100}
                value={threshold}
                onChange={e => onThresholdChange(Number(e.target.value))}
                error={Boolean(errors.threshold)}
                className="focus:ring-purple-500"
              />
            </div>
            <span className="text-sm text-muted-foreground">restarts</span>
          </div>
        </div>
      )}

      {conditionType === 'weather_alerts' && (
        <div className="space-y-3">
          <div>
            <label htmlFor="alertRuleWeatherCondition" className="block text-xs text-muted-foreground mb-1">
              {t('alerts.weatherCondition')}
            </label>
            <Select
              id="alertRuleWeatherCondition"
              name="alertRuleWeatherCondition"
              value={weatherCondition}
              onChange={e => onWeatherConditionChange(e.target.value as WeatherConditionType)}
              className="focus:ring-purple-500"
            >
              <option value="severe_storm">{t('alerts.weather.severeStorm')}</option>
              <option value="extreme_heat">{t('alerts.weather.extremeHeat')}</option>
              <option value="heavy_rain">{t('alerts.weather.heavyRain')}</option>
              <option value="snow">{t('alerts.weather.snow')}</option>
              <option value="high_wind">{t('alerts.weather.highWind')}</option>
            </Select>
          </div>

          {weatherCondition === 'extreme_heat' && (
            <div>
              <label htmlFor="alertRuleTemperatureThreshold" className="block text-xs text-muted-foreground mb-1">
                {t('alerts.temperatureThreshold')}
              </label>
              <div className="flex items-center gap-2">
                <div className="w-24">
                  <Input
                    id="alertRuleTemperatureThreshold"
                    name="alertRuleTemperatureThreshold"
                    type="number"
                    min={-50}
                    max={150}
                    value={temperatureThreshold}
                    onChange={e => onTemperatureThresholdChange(Number(e.target.value))}
                    error={Boolean(errors.temperatureThreshold)}
                    className="focus:ring-purple-500"
                  />
                </div>
                <span className="text-sm text-muted-foreground">°F</span>
              </div>
              {errors.temperatureThreshold && (
                <span className="block text-xs text-red-400 mt-1">{errors.temperatureThreshold}</span>
              )}
            </div>
          )}

          {weatherCondition === 'high_wind' && (
            <div>
              <label htmlFor="alertRuleWindSpeedThreshold" className="block text-xs text-muted-foreground mb-1">
                {t('alerts.windSpeedThreshold')}
              </label>
              <div className="flex items-center gap-2">
                <div className="w-24">
                  <Input
                    id="alertRuleWindSpeedThreshold"
                    name="alertRuleWindSpeedThreshold"
                    type="number"
                    min={1}
                    max={200}
                    value={windSpeedThreshold}
                    onChange={e => onWindSpeedThresholdChange(Number(e.target.value))}
                    error={Boolean(errors.windSpeedThreshold)}
                    className="focus:ring-purple-500"
                  />
                </div>
                <span className="text-sm text-muted-foreground">mph</span>
              </div>
              {errors.windSpeedThreshold && (
                <span className="block text-xs text-red-400 mt-1">{errors.windSpeedThreshold}</span>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <label htmlFor="alertRuleDuration" className="block text-xs text-muted-foreground mb-1">
          {t('alerts.durationSeconds')}
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          {DURATION_PRESETS.map(preset => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onDurationChange(preset.value)}
              className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                duration === preset.value
                  ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                  : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {preset.label}
            </button>
          ))}
          <div className="w-20">
            <Input
              id="alertRuleDuration"
              name="alertRuleDuration"
              type="number"
              min={0}
              max={3600}
              value={duration}
              onChange={e => onDurationChange(Number(e.target.value))}
              inputSize="sm"
              className="focus:ring-purple-500"
            />
          </div>
          <span className="text-xs text-muted-foreground">{t('alerts.durationHint')}</span>
        </div>
      </div>

      {availableClusters.length > 1 && (
        <div>
          <label className="block text-xs text-muted-foreground mb-2">
            Clusters (leave empty for all)
          </label>
          <div className="flex flex-wrap gap-2">
            {availableClusters.map(cluster => (
              <button
                key={cluster.name}
                onClick={() => onToggleCluster(cluster.name)}
                className={`px-2 py-1 text-xs rounded-lg flex items-center gap-1 transition-colors ${
                  selectedClusters.includes(cluster.name)
                    ? 'bg-purple-500/20 border border-purple-500/50 text-purple-400'
                    : 'bg-secondary border border-border text-muted-foreground hover:text-foreground'
                }`}
                aria-label={`${selectedClusters.includes(cluster.name) ? 'Deselect' : 'Select'} cluster ${cluster.name}`}
                aria-pressed={selectedClusters.includes(cluster.name)}
              >
                <Server className="w-3 h-3" aria-hidden="true" />
                {cluster.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
