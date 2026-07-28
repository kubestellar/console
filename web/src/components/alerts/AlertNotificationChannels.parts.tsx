import { Bell, BellOff, Trash2, Webhook, Siren, ShieldAlert } from 'lucide-react'
import { Slack } from '@/lib/icons'
import type { AlertChannel } from '../../types/alerts'

void BellOff

interface AlertNotificationChannelsProps {
  channels: AlertChannel[]
  errors: Record<string, string>
  t: (key: string, defaultVal?: string) => string
  onAddChannel: (type: AlertChannel['type']) => void
  onRemoveChannel: (index: number) => void
  onUpdateChannel: (index: number, updates: Partial<AlertChannel>) => void
}

export function AlertNotificationChannels({ channels, errors, t, onAddChannel, onRemoveChannel, onUpdateChannel }: AlertNotificationChannelsProps) {
  return (
    <div className="space-y-4">
      {errors.channels && (
        <div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-400">
          {errors.channels}
        </div>
      )}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">{t('alerts.notificationChannels')}</h4>
        <div className="flex gap-2">
          <button onClick={() => onAddChannel('browser')} className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 text-foreground transition-colors flex items-center gap-1" aria-label="Add browser notification channel">
            <Bell className="w-3 h-3" aria-hidden="true" />
            {t('alerts.browser')}
          </button>
          <button onClick={() => onAddChannel('slack')} className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 text-foreground transition-colors flex items-center gap-1" aria-label="Add Slack notification channel">
            <Slack className="w-3 h-3" aria-hidden="true" />
            {t('alerts.slack')}
          </button>
          <button onClick={() => onAddChannel('webhook')} className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 text-foreground transition-colors flex items-center gap-1" aria-label="Add webhook notification channel">
            <Webhook className="w-3 h-3" aria-hidden="true" />
            {t('alerts.webhook')}
          </button>
          <button onClick={() => onAddChannel('pagerduty')} className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 text-foreground transition-colors flex items-center gap-1" aria-label="Add PagerDuty notification channel">
            <Siren className="w-3 h-3" aria-hidden="true" />
            PagerDuty
          </button>
          <button onClick={() => onAddChannel('opsgenie')} className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 text-foreground transition-colors flex items-center gap-1" aria-label="Add OpsGenie notification channel">
            <ShieldAlert className="w-3 h-3" aria-hidden="true" />
            OpsGenie
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {channels.map((channel, index) => (
          <div key={index} className="p-3 rounded-lg bg-secondary/30 border border-border/50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {channel.type === 'browser' && <Bell className="w-4 h-4" aria-hidden="true" />}
                {channel.type === 'slack' && <Slack className="w-4 h-4" aria-hidden="true" />}
                {channel.type === 'webhook' && <Webhook className="w-4 h-4" aria-hidden="true" />}
                {channel.type === 'pagerduty' && <Siren className="w-4 h-4" aria-hidden="true" />}
                {channel.type === 'opsgenie' && <ShieldAlert className="w-4 h-4" aria-hidden="true" />}
                <span className="text-sm font-medium text-foreground capitalize">{channel.type}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onUpdateChannel(index, { enabled: !channel.enabled })}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    channel.enabled ? 'bg-green-500/20 text-green-400' : 'bg-secondary text-muted-foreground'
                  }`}
                  aria-label={`${channel.enabled ? 'Disable' : 'Enable'} ${channel.type} channel`}
                >
                  {channel.enabled ? 'On' : 'Off'}
                </button>
                {channels.length > 1 && (
                  <button onClick={() => onRemoveChannel(index)} className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors" aria-label={`Remove ${channel.type} channel`}>
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
            {channel.type === 'slack' && (
              <div className="space-y-2">
                <label htmlFor={`alertRuleSlackWebhookUrl-${index}`} className="sr-only">{t('alerts.slackWebhookUrl')}</label>
                <input id={`alertRuleSlackWebhookUrl-${index}`} name={`alertRuleSlackWebhookUrl-${index}`} type="text" placeholder={t('alerts.slackWebhookUrlPlaceholder')} value={channel.config.slackWebhookUrl || ''} onChange={e => onUpdateChannel(index, { config: { ...channel.config, slackWebhookUrl: e.target.value } })} className="w-full px-3 py-1.5 text-sm rounded bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500" />
                <label htmlFor={`alertRuleSlackChannel-${index}`} className="sr-only">{t('alerts.slackChannel')}</label>
                <input id={`alertRuleSlackChannel-${index}`} name={`alertRuleSlackChannel-${index}`} type="text" placeholder={t('alerts.slackChannelPlaceholder')} value={channel.config.slackChannel || ''} onChange={e => onUpdateChannel(index, { config: { ...channel.config, slackChannel: e.target.value } })} className="w-full px-3 py-1.5 text-sm rounded bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500" />
              </div>
            )}
            {channel.type === 'webhook' && (
              <>
                <label htmlFor={`alertRuleWebhookUrl-${index}`} className="sr-only">{t('alerts.webhookUrl')}</label>
                <input id={`alertRuleWebhookUrl-${index}`} name={`alertRuleWebhookUrl-${index}`} type="text" placeholder={t('alerts.webhookUrlPlaceholder')} value={channel.config.webhookUrl || ''} onChange={e => onUpdateChannel(index, { config: { ...channel.config, webhookUrl: e.target.value } })} className="w-full px-3 py-1.5 text-sm rounded bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500" />
              </>
            )}
            {channel.type === 'pagerduty' && (
              <>
                <label htmlFor={`alertRulePagerdutyRoutingKey-${index}`} className="sr-only">{t('alerts.pagerdutyRoutingKey')}</label>
                <input id={`alertRulePagerdutyRoutingKey-${index}`} name={`alertRulePagerdutyRoutingKey-${index}`} type="password" placeholder={t('alerts.pagerdutyRoutingKeyPlaceholder')} value={channel.config.pagerdutyRoutingKey || ''} onChange={e => onUpdateChannel(index, { config: { ...channel.config, pagerdutyRoutingKey: e.target.value } })} className="w-full px-3 py-1.5 text-sm rounded bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500" />
              </>
            )}
            {channel.type === 'opsgenie' && (
              <>
                <label htmlFor={`alertRuleOpsgenieApiKey-${index}`} className="sr-only">{t('alerts.opsgenieApiKey')}</label>
                <input id={`alertRuleOpsgenieApiKey-${index}`} name={`alertRuleOpsgenieApiKey-${index}`} type="password" placeholder={t('alerts.opsgenieApiKeyPlaceholder')} value={channel.config.opsgenieApiKey || ''} onChange={e => onUpdateChannel(index, { config: { ...channel.config, opsgenieApiKey: e.target.value } })} className="w-full px-3 py-1.5 text-sm rounded bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500" />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
