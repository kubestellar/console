import { useState } from 'react'
import { Gauge, Plus, Trash2, Zap } from 'lucide-react'
import { useDropdownKeyNav } from '../../hooks/useDropdownKeyNav'
import { BaseModal } from '../../lib/modals'
import { Button } from '../ui/Button'
import {
  useCachedNamespaces,
} from '../../hooks/useCachedData'
import {
  type ResourceQuota,
  COMMON_RESOURCE_TYPES,
  GPU_RESOURCE_TYPES,
} from '../../hooks/useMCP'
import { useTranslation } from 'react-i18next'

// Split helper component; parent card owns useCardLoadingState.

interface QuotaModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (spec: { cluster: string; namespace: string; name: string; hard: Record<string, string> }) => Promise<void>
  clusters: Array<{ name: string }>
  namespaces: string[]
  selectedCluster: string
  selectedNamespace: string
  editingQuota?: ResourceQuota | null
  isLoading: boolean
}

export function QuotaModal({
  isOpen,
  onClose,
  onSave,
  clusters,
  namespaces,
  selectedCluster,
  selectedNamespace,
  editingQuota,
  isLoading,
}: QuotaModalProps) {
  const { t } = useTranslation(['cards', 'common'])
  const [cluster, setCluster] = useState(editingQuota?.cluster || (selectedCluster !== 'all' ? selectedCluster : ''))
  const [namespace, setNamespace] = useState(editingQuota?.namespace || (selectedNamespace !== 'all' ? selectedNamespace : ''))
  const [name, setName] = useState(editingQuota?.name || '')
  const [resources, setResources] = useState<Array<{ id: string; key: string; value: string }>>(
    editingQuota
      ? Object.entries(editingQuota.hard).map(([key, value]) => ({ id: crypto.randomUUID(), key, value }))
      : [{ id: crypto.randomUUID(), key: 'limits.nvidia.com/gpu', value: '4' }]
  )
  const [showGpuPresets, setShowGpuPresets] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const gpuDropdownKeyNav = useDropdownKeyNav(() => setShowGpuPresets(false))

  const { namespaces: clusterNamespaces } = useCachedNamespaces(cluster || undefined)
  const availableNamespaces = cluster ? clusterNamespaces : namespaces

  const addResource = () => {
    setResources([...resources, { id: crypto.randomUUID(), key: '', value: '' }])
  }

  const removeResource = (index: number) => {
    setResources(resources.filter((_, i) => i !== index))
  }

  const updateResource = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...resources]
    updated[index][field] = value
    setResources(updated)
  }

  const addGpuPreset = (resourceKey: string) => {
    if (!resources.some(r => r.key === resourceKey)) {
      setResources([...resources, { id: crypto.randomUUID(), key: resourceKey, value: '4' }])
    }
    setShowGpuPresets(false)
  }

  const handleSave = async () => {
    setError(null)
    if (!cluster || !namespace || !name) {
      setError('Cluster, namespace, and name are required')
      return
    }
    const validResources = resources.filter(r => r.key && r.value)
    if (validResources.length === 0) {
      setError('At least one resource limit is required')
      return
    }
    const hard: Record<string, string> = {}
    validResources.forEach(r => { hard[r.key] = r.value })
    try {
      await onSave({ cluster, namespace, name, hard })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save quota')
    }
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md" closeOnBackdrop={false}>
      <BaseModal.Header
        title={editingQuota ? t('namespaceQuotas.editQuota') : t('namespaceQuotas.createQuota')}
        icon={Gauge}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[60vh]">
        <div className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Cluster selector */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('common:common.cluster')}</label>
            <select
              value={cluster}
              onChange={(e) => { setCluster(e.target.value); setNamespace('') }}
              disabled={!!editingQuota}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground disabled:opacity-50"
            >
              <option value="">{t('common:selectors.selectCluster')}</option>
              {clusters.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Namespace selector */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('common:common.namespace')}</label>
            <select
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              disabled={!!editingQuota || !cluster}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground disabled:opacity-50"
            >
              <option value="">{t('common:selectors.selectNamespace')}</option>
              {availableNamespaces.map(ns => (
                <option key={ns} value={ns}>{ns}</option>
              ))}
            </select>
          </div>

          {/* Quota name */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('namespaceQuotas.quotaName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!!editingQuota}
              placeholder={t('namespaceQuotas.quotaNamePlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground disabled:opacity-50"
            />
          </div>

          {/* Resources */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
              <label className="text-sm font-medium text-muted-foreground">{t('namespaceQuotas.resourceLimits')}</label>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Button
                    variant="accent"
                    size="sm"
                    icon={<Zap className="w-3 h-3" />}
                    onClick={() => setShowGpuPresets(!showGpuPresets)}
                    className="rounded"
                  >
                    GPU
                  </Button>
                  {showGpuPresets && (
                    <div role="menu" onKeyDown={gpuDropdownKeyNav} className="absolute right-0 top-full mt-1 w-56 bg-popover border border-border rounded-lg shadow-lg z-10">
                      {GPU_RESOURCE_TYPES.map(rt => (
                        <button
                          key={rt.key}
                          onClick={() => addGpuPreset(rt.key)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-secondary first:rounded-t-lg last:rounded-b-lg"
                        >
                          <div className="text-foreground">{rt.label}</div>
                          <div className="text-xs text-muted-foreground">{rt.key}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={addResource}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                >
                  <Plus className="w-3 h-3" />
                  {t('common:common.add')}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {resources.map((resource, index) => (
                <div key={resource.id} className="flex items-center gap-2">
                  <select
                    value={resource.key}
                    onChange={(e) => updateResource(index, 'key', e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded bg-secondary border border-border text-sm text-foreground"
                  >
                    <option value="">{t('namespaceQuotas.selectResource')}</option>
                    {COMMON_RESOURCE_TYPES.map(rt => (
                      <option key={rt.key} value={rt.key}>{rt.label} ({rt.key})</option>
                    ))}
                    <option value="custom">{t('namespaceQuotas.customResource')}</option>
                  </select>
                  {resource.key === 'custom' && (
                    <input
                      type="text"
                      placeholder="resource.name"
                      onChange={(e) => updateResource(index, 'key', e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded bg-secondary border border-border text-sm text-foreground"
                    />
                  )}
                  <input
                    type="text"
                    value={resource.value}
                    onChange={(e) => updateResource(index, 'value', e.target.value)}
                    placeholder="e.g., 4, 8Gi"
                    className="w-24 px-2 py-1.5 rounded bg-secondary border border-border text-sm text-foreground"
                  />
                  <button
                    onClick={() => removeResource(index)}
                    className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t('common:common.cancel')}
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={handleSave}
            disabled={isLoading}
            loading={isLoading}
          >
            {editingQuota ? t('common:common.update') : t('common:common.create')}
          </Button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
