import { useState } from 'react'
import { Settings } from 'lucide-react'
import { DashboardCard } from '../../../lib/dashboards'
import { formatCardTitle } from '../../../lib/formatCardTitle'
import { BaseModal } from '../../../lib/modals'
import { useTranslation } from 'react-i18next'

export interface CardConfigModalCluster {
  name: string
}

export interface CardConfigModalProps {
  card: DashboardCard
  clusters: CardConfigModalCluster[]
  onSave: (config: Record<string, unknown>) => void
  onClose: () => void
}

export function CardConfigModal({
  card,
  clusters,
  onSave,
  onClose,
}: CardConfigModalProps) {
  const { t } = useTranslation()
  const [config, setConfig] = useState<Record<string, unknown>>(card.config || {})

  const handleSave = () => {
    onSave(config)
  }

  return (
    <BaseModal isOpen={true} onClose={onClose} size="sm" closeOnBackdrop={false}>
      <BaseModal.Header
        title={`Configure ${formatCardTitle(card.card_type)}`}
        icon={Settings}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content>
        <div className="space-y-4">
          {/* Cluster Filter */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Filter by Cluster
            </label>
            <select
              value={(config.cluster as string) || ''}
              onChange={(e) => setConfig(prev => ({ ...prev, cluster: e.target.value || undefined }))}
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-foreground"
            >
              <option value="">{t('filters.allClusters')}</option>
              {clusters.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Namespace Filter */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Filter by Namespace
            </label>
            <input
              type="text"
              value={(config.namespace as string) || ''}
              onChange={(e) => setConfig(prev => ({ ...prev, namespace: e.target.value || undefined }))}
              placeholder="e.g., default, kube-system"
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Show Only Issues */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showOnlyIssues"
              checked={(config.showOnlyIssues as boolean) || false}
              onChange={(e) => setConfig(prev => ({ ...prev, showOnlyIssues: e.target.checked }))}
              className="rounded border-border"
            />
            <label htmlFor="showOnlyIssues" className="text-sm text-foreground">
              Show only items with issues
            </label>
          </div>

          {/* Max Items */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Max Items to Display
            </label>
            <input
              type="number"
              value={(config.maxItems as number) || 10}
              onChange={(e) => setConfig(prev => ({ ...prev, maxItems: parseInt(e.target.value) || 10 }))}
              min={1}
              max={100}
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-foreground"
            />
          </div>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints>
        <div className="flex-1" />
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/80"
          >
            Save Configuration
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
