import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, BellOff, Bot } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { BaseModal, ConfirmDialog, useModalState } from '../../lib/modals'
import type {
  AlertRule,
  AlertCondition,
  AlertChannel,
  AlertSeverity,
  AlertConditionType,
} from '../../types/alerts'
import {
  AlertConditionBuilder,
  PERCENTAGE_MIN, PERCENTAGE_MAX, RESTART_COUNT_MIN,
  TEMPERATURE_MIN, TEMPERATURE_MAX, WIND_SPEED_MIN, WIND_SPEED_MAX,
} from './AlertConditionBuilder.parts'
import { AlertNotificationChannels } from './AlertNotificationChannels.parts'

// Default values for new alert rules (used in unsaved-changes detection)
const DEFAULT_THRESHOLD = 90
const DEFAULT_DURATION_SECS = 60
const DEFAULT_TEMPERATURE_F = 100
const DEFAULT_WIND_SPEED_MPH = 40

interface AlertRuleEditorProps {
  isOpen?: boolean
  rule?: AlertRule
  onSave: (rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>) => void
  onCancel: () => void
}

export function AlertRuleEditor({ isOpen = true, rule, onSave, onCancel }: AlertRuleEditorProps) {
  const { t } = useTranslation('common')

  const CONDITION_TYPES: { value: AlertConditionType; label: string; description: string }[] = [
    { value: 'gpu_usage', label: t('alerts.conditions.gpuUsage'), description: t('alerts.conditions.gpuUsageDesc') },
    { value: 'gpu_health_cronjob', label: 'GPU Health CronJob', description: 'Alert when CronJob health checks detect issues on GPU nodes' },
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
  const { deduplicatedClusters: clusters } = useClusters()

  const [name, setName] = useState(rule?.name || '')
  const [description, setDescription] = useState(rule?.description || '')
  const [enabled, setEnabled] = useState(rule?.enabled ?? true)
  const [severity, setSeverity] = useState<AlertSeverity>(rule?.severity || 'warning')
  const [aiDiagnose, setAiDiagnose] = useState(rule?.aiDiagnose ?? true)
  const [conditionType, setAlertConditionType] = useState<AlertConditionType>(rule?.condition.type || 'gpu_usage')
  const [threshold, setThreshold] = useState(rule?.condition.threshold ?? DEFAULT_THRESHOLD)
  const [duration, setDuration] = useState(rule?.condition.duration ?? DEFAULT_DURATION_SECS)
  const [selectedClusters, setSelectedClusters] = useState<string[]>(rule?.condition.clusters || [])
  const [selectedNamespaces] = useState<string[]>(rule?.condition.namespaces || [])
  const [weatherCondition, setWeatherCondition] = useState<'severe_storm' | 'extreme_heat' | 'heavy_rain' | 'snow' | 'high_wind'>(
    rule?.condition.weatherCondition || 'severe_storm'
  )
  const [temperatureThreshold, setTemperatureThreshold] = useState(rule?.condition.temperatureThreshold ?? DEFAULT_TEMPERATURE_F)
  const [windSpeedThreshold, setWindSpeedThreshold] = useState(rule?.condition.windSpeedThreshold ?? DEFAULT_WIND_SPEED_MPH)
  const [channels, setChannels] = useState<AlertChannel[]>(rule?.channels || [{ type: 'browser', enabled: true, config: {} }])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { isOpen: showDiscardConfirm, open: openDiscardConfirm, close: closeDiscardConfirm } = useModalState()

  const forceClose = () => { closeDiscardConfirm(); onCancel() }

  const DEFAULT_NEW_RULE_CHANNELS: AlertChannel[] = [{ type: 'browser', enabled: true, config: {} }]

  const handleClose = () => {
    const hasChanges = rule
      ? (name !== rule.name || description !== (rule.description || '') ||
         severity !== rule.severity || enabled !== rule.enabled ||
         aiDiagnose !== (rule.aiDiagnose ?? true) ||
         conditionType !== rule.condition.type ||
         threshold !== (rule.condition.threshold ?? DEFAULT_THRESHOLD) ||
         duration !== (rule.condition.duration ?? DEFAULT_DURATION_SECS) ||
         weatherCondition !== (rule.condition.weatherCondition || 'severe_storm') ||
         temperatureThreshold !== (rule.condition.temperatureThreshold ?? DEFAULT_TEMPERATURE_F) ||
         windSpeedThreshold !== (rule.condition.windSpeedThreshold ?? DEFAULT_WIND_SPEED_MPH) ||
         JSON.stringify(selectedClusters) !== JSON.stringify(rule.condition.clusters || []) ||
         JSON.stringify(channels) !== JSON.stringify(rule.channels || []))
      : (name.trim() !== '' || description.trim() !== '' ||
         severity !== 'warning' || !enabled || aiDiagnose !== true ||
         conditionType !== 'gpu_usage' ||
         threshold !== DEFAULT_THRESHOLD || duration !== DEFAULT_DURATION_SECS ||
         weatherCondition !== 'severe_storm' ||
         temperatureThreshold !== DEFAULT_TEMPERATURE_F ||
         windSpeedThreshold !== DEFAULT_WIND_SPEED_MPH ||
         selectedClusters.length > 0 ||
         JSON.stringify(channels) !== JSON.stringify(DEFAULT_NEW_RULE_CHANNELS))
    if (hasChanges) { openDiscardConfirm(); return }
    onCancel()
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!name.trim()) { newErrors.name = t('alerts.nameRequired') }
    if (conditionType === 'gpu_usage' || conditionType === 'memory_pressure') {
      if (threshold < PERCENTAGE_MIN || threshold > PERCENTAGE_MAX) {
        newErrors.threshold = t('alerts.thresholdRange', { min: PERCENTAGE_MIN, max: PERCENTAGE_MAX })
      }
    }
    if (conditionType === 'pod_crash') {
      if (threshold < RESTART_COUNT_MIN) {
        newErrors.threshold = t('alerts.restartCountMin', { min: RESTART_COUNT_MIN })
      }
    }
    if (conditionType === 'weather_alerts') {
      if (weatherCondition === 'extreme_heat' && (temperatureThreshold < TEMPERATURE_MIN || temperatureThreshold > TEMPERATURE_MAX)) {
        newErrors.temperatureThreshold = t('alerts.temperatureRange', { min: TEMPERATURE_MIN, max: TEMPERATURE_MAX })
      }
      if (weatherCondition === 'high_wind' && (windSpeedThreshold < WIND_SPEED_MIN || windSpeedThreshold > WIND_SPEED_MAX)) {
        newErrors.windSpeedThreshold = t('alerts.windSpeedRange', { min: WIND_SPEED_MIN, max: WIND_SPEED_MAX })
      }
    }
    // Issue 9254 — refuse to save without at least one enabled channel
    const enabledChannelCount = channels.filter(ch => ch.enabled).length
    if (enabledChannelCount === 0) {
      newErrors.channels = t('alerts.atLeastOneChannelRequired', 'Enable at least one notification channel, or no one will be notified when this rule fires.')
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = () => {
    if (!validate()) return
    const condition: AlertCondition = {
      type: conditionType,
      threshold: ['gpu_usage', 'memory_pressure', 'pod_crash'].includes(conditionType) ? threshold : undefined,
      duration: duration > 0 ? duration : undefined,
      clusters: selectedClusters.length > 0 ? selectedClusters : undefined,
      namespaces: selectedNamespaces.length > 0 ? selectedNamespaces : undefined,
      weatherCondition: conditionType === 'weather_alerts' ? weatherCondition : undefined,
      temperatureThreshold: conditionType === 'weather_alerts' && weatherCondition === 'extreme_heat' ? temperatureThreshold : undefined,
      windSpeedThreshold: conditionType === 'weather_alerts' && weatherCondition === 'high_wind' ? windSpeedThreshold : undefined,
    }
    onSave({ name: name.trim(), description: description.trim(), enabled, severity, condition, channels, aiDiagnose })
  }

  const addChannel = (type: AlertChannel['type']) => {
    setChannels(prev => [...prev, { type, enabled: true, config: {} }])
  }

  const removeChannel = (index: number) => {
    setChannels(prev => prev.filter((_, i) => i !== index))
  }

  const updateChannel = (index: number, updates: Partial<AlertChannel>) => {
    setChannels(prev => prev.map((ch, i) => (i === index ? { ...ch, ...updates } : ch)))
  }

  const toggleCluster = (clusterName: string) => {
    setSelectedClusters(prev =>
      prev.includes(clusterName) ? prev.filter(c => c !== clusterName) : [...prev, clusterName]
    )
  }

  const availableClusters = clusters.filter(c => c.reachable !== false)

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} size="lg" closeOnBackdrop={false} closeOnEscape={true}>
      <ConfirmDialog
        isOpen={showDiscardConfirm}
        onClose={closeDiscardConfirm}
        onConfirm={forceClose}
        title={t('common:common.discardUnsavedChanges', 'Discard unsaved changes?')}
        message={t('common:common.discardUnsavedChangesMessage', 'You have unsaved changes that will be lost.')}
        confirmLabel={t('common:common.discard', 'Discard')}
        cancelLabel={t('common:common.keepEditing', 'Keep editing')}
        variant="warning"
      />
      <BaseModal.Header
        title={rule ? t('alerts.editRule') : t('alerts.createRule')}
        icon={Bell}
        onClose={handleClose}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[60vh]">
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <label htmlFor="alertRuleName" className="block text-sm font-medium text-foreground mb-1">
                {t('alerts.ruleName')} *
              </label>
              <input
                id="alertRuleName"
                name="alertRuleName"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('alerts.ruleNamePlaceholder')}
                className={`w-full px-3 py-2 rounded-lg bg-secondary border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500 ${
                  errors.name ? 'border-red-500' : 'border-border'
                }`}
              />
              {errors.name && (
                <span className="block text-xs text-red-400 mt-1">{errors.name}</span>
              )}
            </div>

            <div>
              <label htmlFor="alertRuleDescription" className="block text-sm font-medium text-foreground mb-1">
                {t('alerts.description')}
              </label>
              <textarea
                id="alertRuleDescription"
                name="alertRuleDescription"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t('alerts.descriptionPlaceholder')}
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500 resize-none"
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
                      aria-label={`Set severity to ${opt.label}`}
                      aria-pressed={severity === opt.value}
                    >
                      <span className={`w-2 h-2 rounded-full ${opt.color}`} aria-hidden="true" />
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
                  aria-label={enabled ? 'Disable alert rule' : 'Enable alert rule'}
                  aria-pressed={enabled}
                >
                  {enabled ? <Bell className="w-4 h-4" aria-hidden="true" /> : <BellOff className="w-4 h-4" aria-hidden="true" />}
                  {enabled ? t('alerts.enabled') : t('alerts.disabled')}
                </button>
              </div>
            </div>
          </div>

          <AlertConditionBuilder
            conditionType={conditionType}
            threshold={threshold}
            duration={duration}
            weatherCondition={weatherCondition}
            temperatureThreshold={temperatureThreshold}
            windSpeedThreshold={windSpeedThreshold}
            selectedClusters={selectedClusters}
            availableClusters={availableClusters}
            errors={errors}
            conditionTypes={CONDITION_TYPES}
            t={t}
            onSetConditionType={setAlertConditionType}
            onSetThreshold={setThreshold}
            onSetDuration={setDuration}
            onSetWeatherCondition={setWeatherCondition}
            onSetTemperatureThreshold={setTemperatureThreshold}
            onSetWindSpeedThreshold={setWindSpeedThreshold}
            onToggleCluster={toggleCluster}
          />

          <AlertNotificationChannels
            channels={channels}
            errors={errors}
            t={t}
            onAddChannel={addChannel}
            onRemoveChannel={removeChannel}
            onUpdateChannel={updateChannel}
          />

          {/* AI Diagnosis */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground">{t('alerts.aiIntegration')}</h4>
            <button
              onClick={() => setAiDiagnose(!aiDiagnose)}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                aiDiagnose
                  ? 'bg-purple-500/20 border border-purple-500/50'
                  : 'bg-secondary border border-border hover:bg-secondary/80'
              }`}
              aria-label={aiDiagnose ? 'Disable AI diagnosis' : 'Enable AI diagnosis'}
              aria-pressed={aiDiagnose}
            >
              <span className="flex items-center gap-2">
                <Bot className={`w-5 h-5 ${aiDiagnose ? 'text-purple-400' : 'text-muted-foreground'}`} aria-hidden="true" />
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    {t('alerts.aiDiagnosis')}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t('alerts.aiDiagnosisDesc')}
                  </span>
                </span>
              </span>
            </button>
          </div>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
          >
            {t('actions.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors"
          >
            {rule ? t('alerts.saveChanges') : t('alerts.createRule')}
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
