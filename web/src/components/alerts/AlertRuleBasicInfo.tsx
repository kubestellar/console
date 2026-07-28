import { Bell, BellOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AlertSeverity } from '../../types/alerts'

interface SeverityOption {
  value: AlertSeverity
  label: string
  color: string
}

interface AlertRuleBasicInfoProps {
  name: string
  onNameChange: (value: string) => void
  description: string
  onDescriptionChange: (value: string) => void
  severity: AlertSeverity
  onSeverityChange: (value: AlertSeverity) => void
  enabled: boolean
  onEnabledChange: (value: boolean) => void
  errors: Record<string, string>
  severityOptions: SeverityOption[]
}

export function AlertRuleBasicInfo({
  name,
  onNameChange,
  description,
  onDescriptionChange,
  severity,
  onSeverityChange,
  enabled,
  onEnabledChange,
  errors,
  severityOptions,
}: AlertRuleBasicInfoProps) {
  const { t } = useTranslation('common')

  return (
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
          onChange={e => onNameChange(e.target.value)}
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
          onChange={e => onDescriptionChange(e.target.value)}
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
            {severityOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => onSeverityChange(opt.value)}
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
            onClick={() => onEnabledChange(!enabled)}
            className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors ${
              enabled
                ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                : 'bg-secondary border border-border text-muted-foreground'
            }`}
            aria-label={enabled ? 'Disable alert rule' : 'Enable alert rule'}
            aria-pressed={enabled}
          >
            {enabled
              ? <Bell className="w-4 h-4" aria-hidden="true" />
              : <BellOff className="w-4 h-4" aria-hidden="true" />}
            {enabled ? t('alerts.enabled') : t('alerts.disabled')}
          </button>
        </div>
      </div>
    </div>
  )
}
