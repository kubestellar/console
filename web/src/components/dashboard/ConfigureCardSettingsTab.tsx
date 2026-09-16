import type { TFunction } from 'i18next'
import type { ClusterInfo } from '../../hooks/mcp/types'
import type { CardConfigField } from './cardConfigData'

interface ConfigureCardSettingsTabProps {
  title: string
  fields: CardConfigField[]
  config: Record<string, unknown>
  clusters: ClusterInfo[]
  t: TFunction
  onTitleChange: (value: string) => void
  updateConfig: (key: string, value: unknown) => void
}

export function ConfigureCardSettingsTab({
  title,
  fields,
  config,
  clusters,
  t,
  onTitleChange,
  updateConfig,
}: ConfigureCardSettingsTabProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-muted-foreground mb-1">{t('dashboard.configure.cardTitle')}</label>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={t('dashboard.configure.cardTitlePlaceholder')}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
        />
      </div>

      {fields.map((field) => (
        <div key={field.key}>
          <label className="block text-sm text-muted-foreground mb-1">{t(`cardConfig.fieldLabels.${field.key}`, field.label)}</label>
          {field.type === 'cluster' ? (
            <select
              value={(config[field.key] as string) || ''}
              onChange={(e) => updateConfig(field.key, e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
            >
              <option value="">{t('cardConfig.allClusters')}</option>
              {clusters.map((cluster) => (
                <option key={cluster.name} value={cluster.name}>{cluster.name}</option>
              ))}
            </select>
          ) : field.type === 'select' ? (
            <select
              value={(config[field.key] as string) || ''}
              onChange={(e) => updateConfig(field.key, e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
            >
              <option value="">{t('cardConfig.default')}</option>
              <option value="cpu">{t('cardConfig.cpuUsage')}</option>
              <option value="memory">{t('cardConfig.memoryUsage')}</option>
              <option value="pods">{t('cardConfig.podCount')}</option>
            </select>
          ) : field.type === 'number' ? (
            <input
              type="number"
              value={(config[field.key] as number) || ''}
              onChange={(e) => updateConfig(field.key, parseInt(e.target.value, 10) || undefined)}
              placeholder={t('dashboard.configure.defaultPlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
            />
          ) : (
            <input
              type="text"
              value={(config[field.key] as string) || ''}
              onChange={(e) => updateConfig(field.key, e.target.value || undefined)}
              placeholder={t('dashboard.configure.enterField', { field: field.label.toLowerCase() })}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
            />
          )}
        </div>
      ))}

      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          {t('dashboard.configure.noSettings')}
        </p>
      )}
    </div>
  )
}
