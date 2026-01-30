import { useState } from 'react'
import { X } from 'lucide-react'
import { DashboardCard } from '../../../lib/dashboards'
import { formatCardTitle } from '../../../lib/formatCardTitle'

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
  const [config, setConfig] = useState<Record<string, unknown>>(card.config || {})

  const handleSave = () => {
    onSave(config)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="glass p-6 rounded-lg w-[500px] max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">
            Configure {formatCardTitle(card.card_type)}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

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
              <option value="">All Clusters</option>
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

        <div className="flex justify-end gap-2 mt-6">
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
      </div>
    </div>
  )
}
