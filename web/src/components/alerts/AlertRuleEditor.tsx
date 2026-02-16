import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, Server, Bell, BellOff, Bot, Slack, Webhook } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { BaseModal } from '../../lib/modals'
import type {
  AlertRule,
  AlertCondition,
  AlertChannel,
  AlertSeverity,
  AlertConditionType,
} from '../../types/alerts'

// Validation thresholds for alert conditions
const PERCENTAGE_MIN = 1 // Minimum percentage threshold
const PERCENTAGE_MAX = 100 // Maximum percentage threshold
const RESTART_COUNT_MIN = 1 // Minimum restart count for pod crashes
const TEMPERATURE_MIN = -50 // Minimum temperature in Fahrenheit
const TEMPERATURE_MAX = 150 // Maximum temperature in Fahrenheit
const WIND_SPEED_MIN = 1 // Minimum wind speed in mph
const WIND_SPEED_MAX = 200 // Maximum wind speed in mph

interface AlertRuleEditorProps {
  isOpen?: boolean
  rule?: AlertRule // If editing existing rule
  onSave: (rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>) => void
  onCancel: () => void
}

export function AlertRuleEditor({ isOpen = true, rule, onSave, onCancel }: AlertRuleEditorProps) {
  const { t } = useTranslation('common')

  const CONDITION_TYPES: { value: AlertConditionType; label: string; description: string }[] = [
    { value: 'gpu_usage', label: t('alerts.conditions.gpuUsage'), description: t('alerts.conditions.gpuUsageDesc') },
    { value: 'node_not_ready', label: t('alerts.conditions.nodeNotReady'), description: t('alerts.conditions.nodeNotReadyDesc') },
    { value: 'pod_crash', label: t('alerts.conditions.podCrash'), description: t('alerts.conditions.podCrashDesc') },
    { value: 'memory_pressure', label: t('alerts.conditions.memoryPressure'), description: t('alerts.conditions.memoryPressureDesc') },
    { value: 'weather_alerts', label: t('alerts.conditions.weatherAlerts'), description: t('alerts.conditions.weatherAlertsDesc') },
  ]

  const SEVERITY_OPTIONS: { value: AlertSeverity; label: string; color: string }[] = [
    { value: 'critical', label: t('alerts.severityOptions.critical'), color: 'bg-red-500' },
    { value: 'warning', label: t('alerts.severityOptions.warning'), color: 'bg-orange-500' },
    { value: 'info', label: t('alerts.severityOptions.info'), color: 'bg-blue-500' },
  ]
  const { clusters } = useClusters()

  // Form state
  const [name, setName] = useState(rule?.name || '')
  const [description, setDescription] = useState(rule?.description || '')
  const [enabled, setEnabled] = useState(rule?.enabled ?? true)
  const [severity, setSeverity] = useState<AlertSeverity>(rule?.severity || 'warning')
  const [aiDiagnose, setAiDiagnose] = useState(rule?.aiDiagnose ?? true)

  // Condition state
  const [conditionType, setAlertConditionType] = useState<AlertConditionType>(
    rule?.condition.type || 'gpu_usage'
  )
  const [threshold, setThreshold] = useState(rule?.condition.threshold || 90)
  const [duration, setDuration] = useState(rule?.condition.duration || 60)
  const [selectedClusters, setSelectedClusters] = useState<string[]>(
    rule?.condition.clusters || []
  )
  // Namespace filter - for future use
  const [selectedNamespaces] = useState<string[]>(
    rule?.condition.namespaces || []
  )
  // Weather alert specific state
  const [weatherCondition, setWeatherCondition] = useState<'severe_storm' | 'extreme_heat' | 'heavy_rain' | 'snow' | 'high_wind'>(
    rule?.condition.weatherCondition || 'severe_storm'
  )
  const [temperatureThreshold, setTemperatureThreshold] = useState(rule?.condition.temperatureThreshold || 100)
  const [windSpeedThreshold, setWindSpeedThreshold] = useState(rule?.condition.windSpeedThreshold || 40)

  // Channels state
  const [channels, setChannels] = useState<AlertChannel[]>(
    rule?.channels || [{ type: 'browser', enabled: true, config: {} }]
  )

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!name.trim()) {
      newErrors.name = 'Name is required'
    }

    if (conditionType === 'gpu_usage' || conditionType === 'memory_pressure') {
      if (threshold < PERCENTAGE_MIN || threshold > PERCENTAGE_MAX) {
        newErrors.threshold = `Threshold must be between ${PERCENTAGE_MIN} and ${PERCENTAGE_MAX}`
      }
    }

    if (conditionType === 'pod_crash') {
      if (threshold < RESTART_COUNT_MIN) {
        newErrors.threshold = `Restart count must be at least ${RESTART_COUNT_MIN}`
      }
    }

    if (conditionType === 'weather_alerts') {
      if (weatherCondition === 'extreme_heat' && (temperatureThreshold < TEMPERATURE_MIN || temperatureThreshold > TEMPERATURE_MAX)) {
        newErrors.temperatureThreshold = `Temperature must be between ${TEMPERATURE_MIN} and ${TEMPERATURE_MAX}`
      }
      if (weatherCondition === 'high_wind' && (windSpeedThreshold < WIND_SPEED_MIN || windSpeedThreshold > WIND_SPEED_MAX)) {
        newErrors.windSpeedThreshold = `Wind speed must be between ${WIND_SPEED_MIN} and ${WIND_SPEED_MAX}`
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = () => {
    if (!validate()) return

    const condition: AlertCondition = {
      type: conditionType,
      threshold: ['gpu_usage', 'memory_pressure', 'pod_crash'].includes(conditionType)
        ? threshold
        : undefined,
      duration: duration > 0 ? duration : undefined,
      clusters: selectedClusters.length > 0 ? selectedClusters : undefined,
      namespaces: selectedNamespaces.length > 0 ? selectedNamespaces : undefined,
      // Weather alert specific fields
      weatherCondition: conditionType === 'weather_alerts' ? weatherCondition : undefined,
      temperatureThreshold: conditionType === 'weather_alerts' && weatherCondition === 'extreme_heat' ? temperatureThreshold : undefined,
      windSpeedThreshold: conditionType === 'weather_alerts' && weatherCondition === 'high_wind' ? windSpeedThreshold : undefined,
    }

    onSave({
      name: name.trim(),
      description: description.trim(),
      enabled,
      severity,
      condition,
      channels,
      aiDiagnose,
    })
  }

  const addChannel = (type: 'browser' | 'slack' | 'webhook') => {
    setChannels(prev => [...prev, { type, enabled: true, config: {} }])
  }

  const removeChannel = (index: number) => {
    setChannels(prev => prev.filter((_, i) => i !== index))
  }

  const updateChannel = (index: number, updates: Partial<AlertChannel>) => {
    setChannels(prev =>
      prev.map((ch, i) => (i === index ? { ...ch, ...updates } : ch))
    )
  }

  const toggleCluster = (clusterName: string) => {
    setSelectedClusters(prev =>
      prev.includes(clusterName)
        ? prev.filter(c => c !== clusterName)
        : [...prev, clusterName]
    )
  }

  // Get available clusters
  const availableClusters = clusters.filter(c => c.reachable !== false)

  return (
    <BaseModal isOpen={isOpen} onClose={onCancel} size="lg">
      <BaseModal.Header
        title={rule ? t('alerts.editRule') : t('alerts.createRule')}
        icon={Bell}
        onClose={onCancel}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[60vh]">
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                {t('alerts.ruleName')} *
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('alerts.ruleNamePlaceholder')}
                className={`w-full px-3 py-2 rounded-lg bg-secondary border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                  errors.name ? 'border-red-500' : 'border-border'
                }`}
              />
              {errors.name && (
                <p className="text-xs text-red-400 mt-1">{errors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                {t('alerts.description')}
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t('alerts.descriptionPlaceholder')}
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
            </div>

            <div className="flex items-center gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  {t('alerts.severity')}
                </label>
                <div className="flex gap-2">
                  {SEVERITY_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setSeverity(opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                        severity === opt.value
                          ? `${opt.color}/20 border border-${opt.value === 'critical' ? 'red' : opt.value === 'warning' ? 'orange' : 'blue'}-500/50 text-foreground`
                          : 'bg-secondary border border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${opt.color}`} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => setEnabled(!enabled)}
                  className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                    enabled
                      ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                      : 'bg-secondary border border-border text-muted-foreground'
                  }`}
                >
                  {enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                  {enabled ? t('alerts.enabled') : t('alerts.disabled')}
                </button>
              </div>
            </div>
          </div>

          {/* Condition */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">{t('alerts.condition')}</h4>

            <div>
              <label className="block text-xs text-muted-foreground mb-2">
                {t('alerts.conditionType')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {CONDITION_TYPES.map(type => (
                  <button
                    key={type.value}
                    onClick={() => setAlertConditionType(type.value)}
                    className={`p-3 rounded-lg text-left transition-colors ${
                      conditionType === type.value
                        ? 'bg-purple-500/20 border border-purple-500/50'
                        : 'bg-secondary border border-border hover:bg-secondary/80'
                    }`}
                  >
                    <span className="text-sm font-medium text-foreground">{type.label}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Threshold input */}
            {['gpu_usage', 'memory_pressure'].includes(conditionType) && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  {t('alerts.thresholdPercent')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={threshold}
                    onChange={e => setThreshold(Number(e.target.value))}
                    className={`w-24 px-3 py-2 rounded-lg bg-secondary border text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                      errors.threshold ? 'border-red-500' : 'border-border'
                    }`}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                {errors.threshold && (
                  <p className="text-xs text-red-400 mt-1">{errors.threshold}</p>
                )}
              </div>
            )}

            {conditionType === 'pod_crash' && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  {t('alerts.restartCountThreshold')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={threshold}
                    onChange={e => setThreshold(Number(e.target.value))}
                    className={`w-24 px-3 py-2 rounded-lg bg-secondary border text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                      errors.threshold ? 'border-red-500' : 'border-border'
                    }`}
                  />
                  <span className="text-sm text-muted-foreground">restarts</span>
                </div>
              </div>
            )}

            {/* Weather alert configuration */}
            {conditionType === 'weather_alerts' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    {t('alerts.weatherCondition')}
                  </label>
                  <select
                    value={weatherCondition}
                    onChange={e => setWeatherCondition(e.target.value as typeof weatherCondition)}
                    className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="severe_storm">{t('alerts.weather.severeStorm')}</option>
                    <option value="extreme_heat">{t('alerts.weather.extremeHeat')}</option>
                    <option value="heavy_rain">{t('alerts.weather.heavyRain')}</option>
                    <option value="snow">{t('alerts.weather.snow')}</option>
                    <option value="high_wind">{t('alerts.weather.highWind')}</option>
                  </select>
                </div>

                {weatherCondition === 'extreme_heat' && (
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">
                      Temperature Threshold (°F)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={-50}
                        max={150}
                        value={temperatureThreshold}
                        onChange={e => setTemperatureThreshold(Number(e.target.value))}
                        className={`w-24 px-3 py-2 rounded-lg bg-secondary border text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                          errors.temperatureThreshold ? 'border-red-500' : 'border-border'
                        }`}
                      />
                      <span className="text-sm text-muted-foreground">°F</span>
                    </div>
                    {errors.temperatureThreshold && (
                      <p className="text-xs text-red-400 mt-1">{errors.temperatureThreshold}</p>
                    )}
                  </div>
                )}

                {weatherCondition === 'high_wind' && (
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">
                      Wind Speed Threshold (mph)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={windSpeedThreshold}
                        onChange={e => setWindSpeedThreshold(Number(e.target.value))}
                        className={`w-24 px-3 py-2 rounded-lg bg-secondary border text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                          errors.windSpeedThreshold ? 'border-red-500' : 'border-border'
                        }`}
                      />
                      <span className="text-sm text-muted-foreground">mph</span>
                    </div>
                    {errors.windSpeedThreshold && (
                      <p className="text-xs text-red-400 mt-1">{errors.windSpeedThreshold}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Duration */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Duration (seconds before alerting)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={3600}
                  value={duration}
                  onChange={e => setDuration(Number(e.target.value))}
                  className="w-24 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <span className="text-sm text-muted-foreground">seconds (0 = immediate)</span>
              </div>
            </div>

            {/* Cluster Filter */}
            {availableClusters.length > 1 && (
              <div>
                <label className="block text-xs text-muted-foreground mb-2">
                  Clusters (leave empty for all)
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableClusters.map(cluster => (
                    <button
                      key={cluster.name}
                      onClick={() => toggleCluster(cluster.name)}
                      className={`px-2 py-1 text-xs rounded-lg flex items-center gap-1 transition-colors ${
                        selectedClusters.includes(cluster.name)
                          ? 'bg-purple-500/20 border border-purple-500/50 text-purple-400'
                          : 'bg-secondary border border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Server className="w-3 h-3" />
                      {cluster.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notification Channels */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">Notification Channels</h4>
              <div className="flex gap-2">
                <button
                  onClick={() => addChannel('browser')}
                  className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 text-foreground transition-colors flex items-center gap-1"
                >
                  <Bell className="w-3 h-3" />
                  Browser
                </button>
                <button
                  onClick={() => addChannel('slack')}
                  className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 text-foreground transition-colors flex items-center gap-1"
                >
                  <Slack className="w-3 h-3" />
                  Slack
                </button>
                <button
                  onClick={() => addChannel('webhook')}
                  className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 text-foreground transition-colors flex items-center gap-1"
                >
                  <Webhook className="w-3 h-3" />
                  Webhook
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {channels.map((channel, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg bg-secondary/30 border border-border/50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {channel.type === 'browser' && <Bell className="w-4 h-4" />}
                      {channel.type === 'slack' && <Slack className="w-4 h-4" />}
                      {channel.type === 'webhook' && <Webhook className="w-4 h-4" />}
                      <span className="text-sm font-medium text-foreground capitalize">
                        {channel.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          updateChannel(index, { enabled: !channel.enabled })
                        }
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          channel.enabled
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-secondary text-muted-foreground'
                        }`}
                      >
                        {channel.enabled ? 'On' : 'Off'}
                      </button>
                      {channels.length > 1 && (
                        <button
                          onClick={() => removeChannel(index)}
                          className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {channel.type === 'slack' && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Slack Webhook URL"
                        value={channel.config.slackWebhookUrl || ''}
                        onChange={e =>
                          updateChannel(index, {
                            config: { ...channel.config, slackWebhookUrl: e.target.value },
                          })
                        }
                        className="w-full px-3 py-1.5 text-sm rounded bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <input
                        type="text"
                        placeholder="#channel (optional)"
                        value={channel.config.slackChannel || ''}
                        onChange={e =>
                          updateChannel(index, {
                            config: { ...channel.config, slackChannel: e.target.value },
                          })
                        }
                        className="w-full px-3 py-1.5 text-sm rounded bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  )}

                  {channel.type === 'webhook' && (
                    <input
                      type="text"
                      placeholder="Webhook URL"
                      value={channel.config.webhookUrl || ''}
                      onChange={e =>
                        updateChannel(index, {
                          config: { ...channel.config, webhookUrl: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 text-sm rounded bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* AI Diagnosis */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground">AI Integration</h4>
            <button
              onClick={() => setAiDiagnose(!aiDiagnose)}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                aiDiagnose
                  ? 'bg-purple-500/20 border border-purple-500/50'
                  : 'bg-secondary border border-border hover:bg-secondary/80'
              }`}
            >
              <div className="flex items-center gap-2">
                <Bot className={`w-5 h-5 ${aiDiagnose ? 'text-purple-400' : 'text-muted-foreground'}`} />
                <div>
                  <span className="text-sm font-medium text-foreground">
                    AI Diagnosis
                  </span>
                  <p className="text-xs text-muted-foreground">
                    Automatically analyze alerts and suggest remediation actions
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors"
          >
            {rule ? 'Save Changes' : 'Create Rule'}
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
