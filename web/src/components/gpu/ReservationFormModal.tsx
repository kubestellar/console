import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, Loader2 } from 'lucide-react'
import { BaseModal, ConfirmDialog } from '../../lib/modals'
import {
  useNamespaces,
  createOrUpdateResourceQuota,
  deleteResourceQuota,
} from '../../hooks/useMCP'
import type { GPUNode } from '../../hooks/useMCP'
import type { GPUReservation, CreateGPUReservationInput, UpdateGPUReservationInput } from '../../hooks/useGPUReservations'
import { normalizeGpuTypes } from '../../hooks/useGPUReservations'
import {
  DEFAULT_RESERVATION_DURATION_HOURS,
  toDateInputValue,
  toRFC3339StartDate,
  deriveQuotaName,
  type GPUClusterInfo,
} from './ReservationFormModal.utils'
import { ClusterPicker, NamespaceField, ResourceRequestFields, ScheduleSelector } from './ReservationFormModal.parts'

export type { GPUClusterInfo } from './ReservationFormModal.utils'

const FILTERED_NS_PREFIXES = ['openshift-', 'kube-']
const FILTERED_NS_EXACT = ['default', 'kube-system', 'kube-public', 'kube-node-lease']

export function ReservationFormModal({
  isOpen, onClose, editingReservation, gpuClusters, allNodes, user,
  prefillDate, forceLive, knownNamespacesByCluster,
  onSave, onActivate, onSaved, onError,
}: {
  isOpen: boolean
  onClose: () => void
  editingReservation: GPUReservation | null
  gpuClusters: GPUClusterInfo[]
  allNodes: GPUNode[]
  user: { github_login: string; email?: string } | null
  prefillDate?: string | null
  forceLive?: boolean
  knownNamespacesByCluster?: Record<string, string[]>
  onSave: (input: CreateGPUReservationInput | UpdateGPUReservationInput) => Promise<string | void>
  onActivate: (id: string) => Promise<void>
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const { t } = useTranslation(['cards', 'common'])
  const [cluster, setCluster] = useState(editingReservation?.cluster || '')
  const [nsField, setNsField] = useState<{ value: string; isNew: boolean }>({
    value: editingReservation?.namespace || '',
    isNew: false,
  })
  const namespace = nsField.value
  const isNewNamespace = nsField.isNew
  const [title, setTitle] = useState(editingReservation?.title || '')
  const [description, setDescription] = useState(editingReservation?.description || '')
  const [gpuCount, setGpuCount] = useState(editingReservation ? String(editingReservation.gpu_count) : '')
  const [gpuPreferences, setGpuPreferences] = useState<string[]>(() => normalizeGpuTypes(editingReservation))
  const [startDate, setStartDate] = useState(
    toDateInputValue(editingReservation?.start_date) || prefillDate || new Date().toISOString().split('T')[0],
  )
  const [durationHours, setDurationHours] = useState(editingReservation ? String(editingReservation.duration_hours) : '')
  const [notes, setNotes] = useState(editingReservation?.notes || '')
  const enforceQuota = true
  const [extraResources, setExtraResources] = useState<Array<{ key: string; value: string }>>([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  const initialSnapshot = useMemo(
    () => ({
      cluster: editingReservation?.cluster || '',
      namespace: editingReservation?.namespace || '',
      title: editingReservation?.title || '',
      description: editingReservation?.description || '',
      gpuCount: editingReservation ? String(editingReservation.gpu_count) : '',
      gpuPreferences: [...normalizeGpuTypes(editingReservation)].sort(),
      startDate: toDateInputValue(editingReservation?.start_date) || prefillDate || new Date().toISOString().split('T')[0],
      durationHours: editingReservation ? String(editingReservation.duration_hours) : '',
      notes: editingReservation?.notes || '',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingReservation?.id, prefillDate],
  )

  const forceClose = () => { setShowDiscardConfirm(false); onClose() }

  const isDirty = (): boolean => {
    if (cluster !== initialSnapshot.cluster) return true
    if (namespace !== initialSnapshot.namespace) return true
    if (title !== initialSnapshot.title) return true
    if (description !== initialSnapshot.description) return true
    if (gpuCount !== initialSnapshot.gpuCount) return true
    const currentGpuPrefSorted = [...gpuPreferences].sort()
    if (currentGpuPrefSorted.length !== initialSnapshot.gpuPreferences.length) return true
    for (let i = 0; i < currentGpuPrefSorted.length; i++) {
      if (currentGpuPrefSorted[i] !== initialSnapshot.gpuPreferences[i]) return true
    }
    if (startDate !== initialSnapshot.startDate) return true
    if (durationHours !== initialSnapshot.durationHours) return true
    if (notes !== initialSnapshot.notes) return true
    if (extraResources.length > 0) return true
    return false
  }

  const handleClose = () => { if (isDirty()) { setShowDiscardConfirm(true); return } onClose() }

  const { namespaces: rawNamespaces, isLoading: namespacesLoading, error: namespacesError, refetch: refetchNamespaces } =
    useNamespaces(cluster || undefined, forceLive)

  const mergedRawNamespaces = useMemo(() => {
    const knownForCluster = (cluster && knownNamespacesByCluster?.[cluster]) || []
    if (knownForCluster.length === 0) return rawNamespaces
    return Array.from(new Set<string>([...rawNamespaces, ...knownForCluster])).sort()
  }, [rawNamespaces, cluster, knownNamespacesByCluster])

  const clusterNamespaces = mergedRawNamespaces.filter(ns =>
    !FILTERED_NS_PREFIXES.some(prefix => ns.startsWith(prefix)) && !FILTERED_NS_EXACT.includes(ns)
  )

  const selectedClusterInfo = gpuClusters.find(c => c.name === cluster)
  const maxGPUs = selectedClusterInfo?.availableGPUs ?? 0

  const gpuResourceKey = (() => {
    if (!cluster) return 'limits.nvidia.com/gpu'
    const clusterNodes = allNodes.filter(n => n.cluster === cluster)
    const hasAMD = clusterNodes.some(n => n.gpuType.toLowerCase().includes('amd') || n.manufacturer?.toLowerCase().includes('amd'))
    const hasIntel = clusterNodes.some(n => n.gpuType.toLowerCase().includes('intel') || n.manufacturer?.toLowerCase().includes('intel'))
    if (hasAMD) return 'limits.amd.com/gpu'
    if (hasIntel) return 'gpu.intel.com/i915'
    return 'limits.nvidia.com/gpu'
  })()

  const clusterGPUTypes = (() => {
    if (!cluster) return [] as Array<{ type: string; total: number; available: number }>
    const typeMap: Record<string, { total: number; allocated: number }> = {}
    for (const n of allNodes.filter(n => n.cluster === cluster)) {
      if (!typeMap[n.gpuType]) typeMap[n.gpuType] = { total: 0, allocated: 0 }
      typeMap[n.gpuType].total += n.gpuCount
      typeMap[n.gpuType].allocated += n.gpuAllocated
    }
    return Object.entries(typeMap).map(([type, d]) => ({ type, total: d.total, available: d.total - d.allocated }))
  })()

  const quotaName = deriveQuotaName(title)
  const originalQuotaName = deriveQuotaName(editingReservation?.title || '')

  const handleSave = async () => {
    const count = parseInt(gpuCount)
    const originalCount = editingReservation?.gpu_count ?? 0
    const sameClusterAsOriginal = editingReservation ? cluster === editingReservation.cluster : true
    const capacityCeiling = editingReservation && sameClusterAsOriginal ? maxGPUs + originalCount : maxGPUs
    const validationError = !cluster
      ? t('gpuReservations.form.errors.selectCluster')
      : !namespace ? t('gpuReservations.form.errors.selectNamespace')
      : !title ? t('gpuReservations.form.errors.titleRequired')
      : !count || count < 1 ? t('gpuReservations.form.errors.gpuCountMin')
      : count > capacityCeiling ? t('gpuReservations.form.errors.gpuCountMax', { max: capacityCeiling, cluster })
      : null
    setError(validationError)
    if (validationError) return

    setIsSaving(true)
    try {
      let reservationId: string | void
      const rfc3339StartDate = toRFC3339StartDate(startDate)
      const gpuTypesList = gpuPreferences.length > 0 ? gpuPreferences
        : clusterGPUTypes.length === 1 && clusterGPUTypes[0]?.type ? [clusterGPUTypes[0].type] : []
      const primaryGpuType = gpuTypesList[0] || ''

      const baseInput = { title, description, cluster, namespace, gpu_count: count, gpu_type: primaryGpuType, gpu_types: gpuTypesList, start_date: rfc3339StartDate, duration_hours: parseInt(durationHours) || DEFAULT_RESERVATION_DURATION_HOURS, notes, quota_enforced: enforceQuota, quota_name: enforceQuota ? quotaName : '', max_cluster_gpus: selectedClusterInfo?.totalGPUs }
      reservationId = await onSave(editingReservation ? { ...baseInput } as UpdateGPUReservationInput : { ...baseInput } as CreateGPUReservationInput)

      if (enforceQuota) {
        try {
          const hard: Record<string, string> = { [gpuResourceKey]: String(count) }
          for (const r of extraResources) { if (r.key && r.value) hard[r.key] = r.value }
          if (editingReservation && originalQuotaName && originalQuotaName !== quotaName && editingReservation.cluster && editingReservation.namespace) {
            try { await deleteResourceQuota(editingReservation.cluster, editingReservation.namespace, originalQuotaName) } catch { /* non-fatal */ }
          }
          await createOrUpdateResourceQuota({ cluster, namespace, name: quotaName, hard, ensure_namespace: isNewNamespace })
          const id = reservationId || editingReservation?.id
          if (id) { try { await onActivate(id) } catch { /* non-fatal */ } }
        } catch {
          onError(t('gpuReservations.form.errors.quotaFailed'))
        }
      }
      onSaved(); onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('gpuReservations.form.errors.saveFailed')
      setError(msg); onError(msg)
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
          {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.titleLabel')}</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder={t('gpuReservations.form.fields.titlePlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
          </div>

          {user && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.userName')}</label>
                <input type="text" value={user.email || user.github_login} readOnly className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-muted-foreground" />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.githubHandle')}</label>
                <input type="text" value={user.github_login} readOnly className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-muted-foreground" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('common:common.description')}</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder={t('gpuReservations.form.fields.descriptionPlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
          </div>

          <ClusterPicker
            cluster={cluster}
            setCluster={setCluster}
            gpuClusters={gpuClusters}
            editingReservationCluster={editingReservation?.cluster}
            onClusterChange={newCluster => { setCluster(newCluster); setNsField({ value: '', isNew: false }); setGpuPreferences([]) }}
          />

          <NamespaceField
            namespace={namespace}
            isNewNamespace={isNewNamespace}
            cluster={cluster}
            editingReservationNs={editingReservation?.namespace}
            clusterNamespaces={clusterNamespaces}
            namespacesLoading={namespacesLoading}
            namespacesError={namespacesError}
            onNamespaceChange={value => setNsField(prev => ({ ...prev, value }))}
            onToggleNew={isNew => setNsField({ value: '', isNew })}
            onRetry={() => void refetchNamespaces()}
          />

          <ResourceRequestFields
            gpuCount={gpuCount} setGpuCount={setGpuCount}
            gpuPreferences={gpuPreferences} setGpuPreferences={setGpuPreferences}
            clusterGPUTypes={clusterGPUTypes}
            selectedClusterInfo={selectedClusterInfo}
            maxGPUs={maxGPUs}
            extraResources={extraResources} setExtraResources={setExtraResources}
            enforceQuota={enforceQuota}
            notes={notes} setNotes={setNotes}
          />

          <ScheduleSelector
            startDate={startDate} setStartDate={setStartDate}
            durationHours={durationHours} setDurationHours={setDurationHours}
          />

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
