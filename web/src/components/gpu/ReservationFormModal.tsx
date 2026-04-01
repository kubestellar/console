import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Zap,
  Calendar,
  Plus,
  Trash2,
  Loader2,
} from 'lucide-react'
import { BaseModal, ConfirmDialog } from '../../lib/modals'
import {
  useNamespaces,
  createOrUpdateResourceQuota,
  COMMON_RESOURCE_TYPES,
} from '../../hooks/useMCP'
import type { GPUNode } from '../../hooks/useMCP'
import type { GPUReservation, CreateGPUReservationInput, UpdateGPUReservationInput } from '../../hooks/useGPUReservations'
import { cn } from '../../lib/cn'

// GPU resource keys used to identify GPU quotas
const GPU_KEYS = ['nvidia.com/gpu', 'amd.com/gpu', 'gpu.intel.com/i915']

// GPU cluster info for dropdown
export interface GPUClusterInfo {
  name: string
  totalGPUs: number
  allocatedGPUs: number
  availableGPUs: number
  gpuTypes: string[]
}

export function ReservationFormModal({
  isOpen,
  onClose,
  editingReservation,
  gpuClusters,
  allNodes,
  user,
  prefillDate,
  forceLive,
  onSave,
  onActivate,
  onSaved,
  onError,
}: {
  isOpen: boolean
  onClose: () => void
  editingReservation: GPUReservation | null
  gpuClusters: GPUClusterInfo[]
  allNodes: GPUNode[]
  user: { github_login: string; email?: string } | null
  prefillDate?: string | null
  /** When true, skip demo mode fallback for namespace list */
  forceLive?: boolean
  onSave: (input: CreateGPUReservationInput | UpdateGPUReservationInput) => Promise<string | void>
  onActivate: (id: string) => Promise<void>
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const { t } = useTranslation(['cards', 'common'])
  const [cluster, setCluster] = useState(editingReservation?.cluster || '')
  const [namespace, setNamespace] = useState(editingReservation?.namespace || '')
  const [isNewNamespace, setIsNewNamespace] = useState(false)
  const [title, setTitle] = useState(editingReservation?.title || '')
  const [description, setDescription] = useState(editingReservation?.description || '')
  const [gpuCount, setGpuCount] = useState(editingReservation ? String(editingReservation.gpu_count) : '')
  const [gpuPreference, setGpuPreference] = useState(editingReservation?.gpu_type || '')
  const [startDate, setStartDate] = useState(editingReservation?.start_date || prefillDate || new Date().toISOString().split('T')[0])
  const [durationHours, setDurationHours] = useState(editingReservation ? String(editingReservation.duration_hours) : '')
  const [notes, setNotes] = useState(editingReservation?.notes || '')
  const enforceQuota = true
  const [extraResources, setExtraResources] = useState<Array<{ key: string; value: string }>>([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  const forceClose = () => {
    setShowDiscardConfirm(false)
    onClose()
  }

  const handleClose = () => {
    const hasChanges = title.trim() !== '' || description.trim() !== ''
    if (hasChanges) {
      setShowDiscardConfirm(true)
      return
    }
    onClose()
  }

  const { namespaces: rawNamespaces } = useNamespaces(cluster || undefined, forceLive)

  // Filter out system namespaces from the dropdown
  const FILTERED_NS_PREFIXES = ['openshift-', 'kube-']
  const FILTERED_NS_EXACT = ['default', 'kube-system', 'kube-public', 'kube-node-lease']
  const clusterNamespaces = useMemo(() =>
    rawNamespaces.filter(ns =>
      !FILTERED_NS_PREFIXES.some(prefix => ns.startsWith(prefix)) &&
      !FILTERED_NS_EXACT.includes(ns)
    ),
  [rawNamespaces])

  // Get the selected cluster's GPU info
  const selectedClusterInfo = gpuClusters.find(c => c.name === cluster)
  const maxGPUs = selectedClusterInfo?.availableGPUs ?? 0

  // Auto-detect GPU resource key from cluster's GPU types
  const gpuResourceKey = useMemo(() => {
    if (!cluster) return 'limits.nvidia.com/gpu'
    const clusterNodes = allNodes.filter(n => n.cluster === cluster)
    const hasAMD = clusterNodes.some(n => n.gpuType.toLowerCase().includes('amd') || n.manufacturer?.toLowerCase().includes('amd'))
    const hasIntel = clusterNodes.some(n => n.gpuType.toLowerCase().includes('intel') || n.manufacturer?.toLowerCase().includes('intel'))
    if (hasAMD) return 'limits.amd.com/gpu'
    if (hasIntel) return 'gpu.intel.com/i915'
    return 'limits.nvidia.com/gpu'
  }, [cluster, allNodes])

  // GPU types available on selected cluster with per-type counts
  const clusterGPUTypes = useMemo(() => {
    if (!cluster) return [] as Array<{ type: string; total: number; available: number }>
    const typeMap: Record<string, { total: number; allocated: number }> = {}
    for (const n of allNodes.filter(n => n.cluster === cluster)) {
      if (!typeMap[n.gpuType]) typeMap[n.gpuType] = { total: 0, allocated: 0 }
      typeMap[n.gpuType].total += n.gpuCount
      typeMap[n.gpuType].allocated += n.gpuAllocated
    }
    return Object.entries(typeMap).map(([type, d]) => ({
      type,
      total: d.total,
      available: d.total - d.allocated,
    }))
  }, [cluster, allNodes])

  // Auto-generate quota name from title
  const quotaName = title
    ? `gpu-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`
    : ''

  const handleSave = async () => {
    const count = parseInt(gpuCount)
    const validationError = !cluster
      ? t('gpuReservations.form.errors.selectCluster')
      : !namespace
      ? t('gpuReservations.form.errors.selectNamespace')
      : !title
      ? t('gpuReservations.form.errors.titleRequired')
      : !count || count < 1
      ? t('gpuReservations.form.errors.gpuCountMin')
      : count > maxGPUs && !editingReservation
      ? t('gpuReservations.form.errors.gpuCountMax', { max: maxGPUs, cluster })
      : null
    setError(validationError)
    if (validationError) return

    setIsSaving(true)
    try {
      let reservationId: string | void
      if (editingReservation) {
        // Partial update
        const input: UpdateGPUReservationInput = {
          title,
          description,
          cluster,
          namespace,
          gpu_count: count,
          gpu_type: gpuPreference || clusterGPUTypes[0]?.type || '',
          start_date: startDate,
          duration_hours: parseInt(durationHours) || 24,
          notes,
          quota_enforced: enforceQuota,
          quota_name: enforceQuota ? quotaName : '',
          max_cluster_gpus: selectedClusterInfo?.totalGPUs,
        }
        reservationId = await onSave(input)
      } else {
        // Create
        const input: CreateGPUReservationInput = {
          title,
          description,
          cluster,
          namespace,
          gpu_count: count,
          gpu_type: gpuPreference || clusterGPUTypes[0]?.type || '',
          start_date: startDate,
          duration_hours: parseInt(durationHours) || 24,
          notes,
          quota_enforced: enforceQuota,
          quota_name: enforceQuota ? quotaName : '',
          max_cluster_gpus: selectedClusterInfo?.totalGPUs,
        }
        reservationId = await onSave(input)
      }

      // Create K8s ResourceQuota (auto-creates namespace if needed)
      if (enforceQuota) {
        try {
          const hard: Record<string, string> = {
            [gpuResourceKey]: String(count),
          }
          for (const r of extraResources) {
            if (r.key && r.value) hard[r.key] = r.value
          }
          await createOrUpdateResourceQuota({ cluster, namespace, name: quotaName, hard, ensure_namespace: isNewNamespace })
          // Quota enforced successfully — activate the reservation
          const id = reservationId || editingReservation?.id
          if (id) {
            try { await onActivate(id) } catch { /* non-fatal */ }
          }
        } catch {
          // Non-fatal: reservation is saved, but quota enforcement failed — stays pending
          onError(t('gpuReservations.form.errors.quotaFailed'))
        }
      }

      onSaved()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('gpuReservations.form.errors.saveFailed')
      setError(msg)
      onError(msg)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} size="lg" closeOnBackdrop={false} closeOnEscape={true}>
      <ConfirmDialog
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={forceClose}
        title={t('common:common.discardUnsavedChanges', 'Discard unsaved changes?')}
        message={t('common:common.discardUnsavedChangesMessage', 'You have unsaved changes that will be lost.')}
        confirmLabel={t('common:common.discard', 'Discard')}
        cancelLabel={t('common:common.keepEditing', 'Keep editing')}
        variant="warning"
      />
      <BaseModal.Header
        title={editingReservation ? t('gpuReservations.form.editTitle') : t('gpuReservations.form.createTitle')}
        icon={Calendar}
        onClose={handleClose}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[70vh]">
        <div className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.titleLabel')}</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder={t('gpuReservations.form.fields.titlePlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
          </div>

          {/* User info (read-only from auth) */}
          {user && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.userName')}</label>
                <input type="text" value={user.email || user.github_login} readOnly
                  className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-muted-foreground" />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.githubHandle')}</label>
                <input type="text" value={user.github_login} readOnly
                  className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-muted-foreground" />
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('common:common.description')}</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder={t('gpuReservations.form.fields.descriptionPlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
          </div>

          {/* Cluster (GPU-only, with counts) */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.clusterLabel')}</label>
            <select value={cluster} onChange={e => { setCluster(e.target.value); setNamespace(''); setIsNewNamespace(false); setGpuPreference('') }}
              disabled={!!editingReservation}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground disabled:opacity-50">
              <option value="">{t('gpuReservations.form.fields.selectCluster')}</option>
              {gpuClusters.map(c => (
                <option key={c.name} value={c.name}>
                  {t('gpuReservations.form.fields.clusterOption', { name: c.name, available: c.availableGPUs, total: c.totalGPUs })}
                </option>
              ))}
            </select>
            {gpuClusters.length === 0 && (
              <div className="text-xs text-yellow-400 mt-1">{t('gpuReservations.form.fields.noClustersWithGpus')}</div>
            )}
          </div>

          {/* Namespace */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.namespaceLabel')}</label>
            {!isNewNamespace ? (
              <select
                value={namespace}
                onChange={e => {
                  if (e.target.value === '__new__' || e.target.value === '__new_bottom__') {
                    setIsNewNamespace(true)
                    setNamespace('')
                    setTimeout(() => document.getElementById('new-ns-input')?.focus(), 0)
                  } else {
                    setNamespace(e.target.value)
                  }
                }}
                disabled={!!editingReservation || !cluster}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground disabled:opacity-50"
              >
                <option value="">{t('gpuReservations.form.fields.selectNamespace')}</option>
                <option value="__new__">{t('gpuReservations.form.fields.newNamespace')}</option>
                {clusterNamespaces.map(ns => (
                  <option key={ns} value={ns}>{ns}</option>
                ))}
                <option value="__new_bottom__">{t('gpuReservations.form.fields.newNamespace')}</option>
              </select>
            ) : (
              <div className="flex gap-2">
                <input
                  id="new-ns-input"
                  type="text"
                  value={namespace}
                  onChange={e => setNamespace(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder={t('gpuReservations.form.fields.enterNamespace')}
                  disabled={!!editingReservation}
                  className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground disabled:opacity-50"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => { setIsNewNamespace(false); setNamespace('') }}
                  className="px-3 py-2 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground"
                  title={t('gpuReservations.form.fields.backToList')}
                  aria-label={t('gpuReservations.form.fields.backToList')}
                >
                  &times;
                </button>
              </div>
            )}
          </div>

          {/* GPU Count */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              {t('gpuReservations.form.fields.gpuCountLabel')}
              {selectedClusterInfo && (
                <span className="text-xs text-green-400 ml-2">
                  {t('gpuReservations.form.fields.maxAvailable', { count: selectedClusterInfo.availableGPUs })}
                </span>
              )}
            </label>
            <input type="number" value={gpuCount} onChange={e => setGpuCount(e.target.value)}
              min="1" max={maxGPUs || undefined}
              placeholder={t('gpuReservations.form.fields.gpuCountPlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
          </div>

          {/* GPU Type Selection (only when cluster has multiple types) */}
          {clusterGPUTypes.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">{t('gpuReservations.form.fields.gpuTypeLabel')}</label>
              <div className="flex flex-wrap gap-2">
                {clusterGPUTypes.map(gt => (
                  <button key={gt.type} type="button"
                    onClick={() => setGpuPreference(gt.type)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors',
                      gpuPreference === gt.type
                        ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                        : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
                    )}>
                    <Zap className="w-3.5 h-3.5" />
                    {gt.type}
                    <span className="text-xs opacity-70">{t('gpuReservations.form.fields.gpuTypeAvailability', { available: gt.available, total: gt.total })}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Single GPU type — show as info */}
          {clusterGPUTypes.length === 1 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Zap className="w-3.5 h-3.5 text-purple-400" />
              {clusterGPUTypes[0].type}
              <span className="text-xs">{t('gpuReservations.form.fields.singleGpuType', { available: clusterGPUTypes[0].available, total: clusterGPUTypes[0].total })}</span>
            </div>
          )}

          {/* Start Date and Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.startDateLabel')}</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground" />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.durationLabel')}</label>
              <input type="number" value={durationHours} onChange={e => setDurationHours(e.target.value)}
                min="1" placeholder={t('gpuReservations.form.fields.durationPlaceholder')}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
            </div>
          </div>

          {/* Additional Resource Limits */}
          {enforceQuota && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-muted-foreground">{t('gpuReservations.form.fields.additionalLimits')}</label>
                <button onClick={() => setExtraResources([...extraResources, { key: '', value: '' }])}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30">
                  <Plus className="w-3 h-3" /> {t('gpuReservations.form.fields.add')}
                </button>
              </div>
              {extraResources.map((r, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <select value={r.key} onChange={e => {
                    const updated = [...extraResources]
                    updated[i].key = e.target.value
                    setExtraResources(updated)
                  }} className="flex-1 px-2 py-1.5 rounded bg-secondary border border-border text-sm text-foreground">
                    <option value="">{t('gpuReservations.form.fields.selectResource')}</option>
                    {COMMON_RESOURCE_TYPES.filter(rt => !GPU_KEYS.some(gk => rt.key.includes(gk))).map(rt => (
                      <option key={rt.key} value={rt.key}>{rt.label}</option>
                    ))}
                  </select>
                  <input type="text" value={r.value} onChange={e => {
                    const updated = [...extraResources]
                    updated[i].value = e.target.value
                    setExtraResources(updated)
                  }} placeholder={t('gpuReservations.form.fields.resourcePlaceholder')} className="w-24 px-2 py-1.5 rounded bg-secondary border border-border text-sm text-foreground" />
                  <button onClick={() => setExtraResources(extraResources.filter((_, j) => j !== i))}
                    className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-red-400"
                    aria-label="Remove resource limit">
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.notesLabel')}</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder={t('gpuReservations.form.fields.notesPlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
          </div>

          {/* Preview */}
          <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
            <div className="text-xs font-medium text-purple-400 mb-1">{t('gpuReservations.form.fields.preview')}</div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>{t('gpuReservations.form.fields.previewFields.title')} <span className="text-foreground">{title || '...'}</span></div>
              <div>{t('gpuReservations.form.fields.previewFields.cluster')} <span className="text-foreground">{cluster || '...'}</span></div>
              <div>{t('gpuReservations.form.fields.previewFields.namespace')} <span className="text-foreground">{namespace || '...'}</span></div>
              <div>{t('gpuReservations.form.fields.previewFields.gpus')} <span className="text-foreground">{gpuCount || '...'}</span></div>
              <div>{t('gpuReservations.form.fields.previewFields.start')} <span className="text-foreground">{startDate || '...'}</span></div>
              <div>{t('gpuReservations.form.fields.previewFields.duration')} <span className="text-foreground">{durationHours || '24'}h</span></div>
              {enforceQuota && (
                <div>{t('gpuReservations.form.fields.previewFields.k8sQuota')} <span className="text-foreground">{quotaName || '...'} ({gpuResourceKey})</span></div>
              )}
            </div>
          </div>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <div className="flex-1" />
        <div className="flex gap-3">
          {([
            { key: 'cancel', label: t('gpuReservations.form.buttons.cancel'), onClick: handleClose, disabled: false, className: 'px-4 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors' },
            { key: 'save', label: editingReservation ? t('gpuReservations.form.buttons.update') : t('gpuReservations.form.buttons.create'), onClick: handleSave, disabled: isSaving, className: 'flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 transition-colors' },
          ] as const).map(({ key, label, onClick, disabled, className }) => (
            <button key={key} onClick={onClick} disabled={disabled} className={className}>
              {key === 'save' && isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {label}
            </button>
          ))}
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
