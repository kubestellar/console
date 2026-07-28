import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, Loader2 } from 'lucide-react'
import { BaseModal, ConfirmDialog } from '../../lib/modals'
import type { GPUNode } from '../../hooks/useMCP'
import type { GPUReservation, CreateGPUReservationInput, UpdateGPUReservationInput } from '../../hooks/useGPUReservations'
import { normalizeGpuTypes } from '../../hooks/useGPUReservations'
import { ResourceRequestFields } from './reservationForm/ResourceRequestFields'
import { ScheduleSelector } from './reservationForm/ScheduleSelector'
import { ClusterPicker } from './reservationForm/ClusterPicker'
import { BasicFormFields } from './reservationForm/BasicFormFields'
import { ReservationPreview } from './reservationForm/ReservationPreview'
import { useReservationData } from './reservationForm/useReservationData'
import { handleReservationSave } from './reservationForm/handleReservationSave'

/** Maximum length of the sanitized title segment in a generated quota name. */
const QUOTA_NAME_TITLE_MAX_LEN = 40

/** Default reservation duration in hours when the field is left blank. */
const DEFAULT_RESERVATION_DURATION_HOURS = 24

/**
 * Normalize any accepted start-date representation to the `YYYY-MM-DD`
 * format required by `<input type="date">`.
 */
function toDateInputValue(value: string | undefined | null): string {
  if (!value) return ''
  return value.split('T')[0]
}

/**
 * Derive the Kubernetes ResourceQuota name from a reservation title.
 * Exported as a local helper so both the current-title quota name and
 * the ORIGINAL-title quota name (used for cleanup on rename) are
 * computed identically.
 */
function deriveQuotaName(title: string): string {
  if (!title) return ''
  return `gpu-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, QUOTA_NAME_TITLE_MAX_LEN)}`
}

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
  knownNamespacesByCluster,
  onSave,
  onActivate,
  onSaved,
  onError }: {
  isOpen: boolean
  onClose: () => void
  editingReservation: GPUReservation | null
  gpuClusters: GPUClusterInfo[]
  allNodes: GPUNode[]
  user: { github_login: string; email?: string } | null
  prefillDate?: string | null
  /** When true, skip demo mode fallback for namespace list */
  forceLive?: boolean
  /**
   * Map of cluster name → namespaces known to have existing reservations.
   * Union'd with the `useNamespaces()` result as a fallback when the fetch
   * tiers don't return them (e.g. user lacks cluster-wide list RBAC and the
   * namespace has no running pods). System namespaces (default, kube-system,
   * kube-*, openshift-*, etc.) are still filtered out of the dropdown
   * regardless of what this prop contains.
   */
  knownNamespacesByCluster?: Record<string, string[]>
  onSave: (input: CreateGPUReservationInput | UpdateGPUReservationInput) => Promise<string | void>
  onActivate: (id: string) => Promise<void>
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const { t } = useTranslation(['cards', 'common'])
  const [cluster, setCluster] = useState(editingReservation?.cluster || '')
  // namespace value and "create new" toggle always change together → merged into
  // a single state object so each user interaction causes only one re-render.
  const [nsField, setNsField] = useState<{ value: string; isNew: boolean }>({
    value: editingReservation?.namespace || '',
    isNew: false,
  })
  const namespace = nsField.value
  const isNewNamespace = nsField.isNew
  const [title, setTitle] = useState(editingReservation?.title || '')
  const [description, setDescription] = useState(editingReservation?.description || '')
  const [gpuCount, setGpuCount] = useState(editingReservation ? String(editingReservation.gpu_count) : '')
  // Multi-type preference. `gpuPreferences` holds the list of
  // acceptable GPU types for this reservation — an empty array is
  // "no preference" (any type is acceptable), a one-element array is
  // the legacy single-type behaviour, and two or more entries implement
  // the multi-type-preference feature requested by
  // @MikeSpreitzer. Seeded from both the legacy `gpu_type` string and
  // the new `gpu_types` array via `normalizeGpuTypes` so edits of
  // existing pre-migration reservations keep their type.
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

  // Snapshot of the initial form state used for dirty detection. Captured
  // once when the modal is first rendered for this editing target so the
  // unsaved-changes dialog compares against the ORIGINAL values (not the
  // current values, which would always look "clean").
  const initialSnapshot = useMemo(
    () => ({
      cluster: editingReservation?.cluster || '',
      namespace: editingReservation?.namespace || '',
      title: editingReservation?.title || '',
      description: editingReservation?.description || '',
      gpuCount: editingReservation ? String(editingReservation.gpu_count) : '',
      // Snapshot the multi-type preference list so dirty
      // detection can see a type-only edit. Sorted so order churn
      // does not trip a false positive.
      gpuPreferences: [...normalizeGpuTypes(editingReservation)].sort(),
      startDate: toDateInputValue(editingReservation?.start_date) || prefillDate || new Date().toISOString().split('T')[0],
      durationHours: editingReservation ? String(editingReservation.duration_hours) : '',
      notes: editingReservation?.notes || '' }),
    // Re-snapshot only when the modal is opened for a different reservation
    // or with a different prefill date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingReservation?.id, prefillDate],
  )

  const forceClose = () => {
    setShowDiscardConfirm(false)
    onClose()
  }

  // Returns true if ANY user-editable field has diverged from the initial
  // snapshot. Previously this only inspected title/description, so edits
  // to cluster, namespace, GPU count/type, dates, duration, notes, or
  // extra resources could be discarded without confirmation.
  const isDirty = (): boolean => {
    if (cluster !== initialSnapshot.cluster) return true
    if (namespace !== initialSnapshot.namespace) return true
    if (title !== initialSnapshot.title) return true
    if (description !== initialSnapshot.description) return true
    if (gpuCount !== initialSnapshot.gpuCount) return true
    // Compare the sorted multi-type list. Order is intentionally
    // ignored because the form renders the same set regardless of
    // toggle order — only membership matters for dirty detection.
    const currentGpuPrefSorted = [...gpuPreferences].sort()
    if (currentGpuPrefSorted.length !== initialSnapshot.gpuPreferences.length) return true
    for (let i = 0; i < currentGpuPrefSorted.length; i++) {
      if (currentGpuPrefSorted[i] !== initialSnapshot.gpuPreferences[i]) return true
    }
    if (startDate !== initialSnapshot.startDate) return true
    if (durationHours !== initialSnapshot.durationHours) return true
    if (notes !== initialSnapshot.notes) return true
    // extraResources always starts empty for both create and edit flows —
    // any entry means the user added a row.
    if (extraResources.length > 0) return true
    return false
  }

  const handleClose = () => {
    if (isDirty()) {
      setShowDiscardConfirm(true)
      return
    }
    onClose()
  }

  const {
    clusterNamespaces,
    namespacesLoading,
    namespacesError,
    refetchNamespaces,
    selectedClusterInfo,
    maxGPUs,
    gpuResourceKey,
    clusterGPUTypes,
  } = useReservationData({
    cluster,
    allNodes,
    gpuClusters,
    forceLive,
    knownNamespacesByCluster,
  })

  // Auto-generate quota name from title
  const quotaName = deriveQuotaName(title)
  // Quota name computed from the ORIGINAL title, used to clean up a
  // stale ResourceQuota if the user renamed the reservation.
  const originalQuotaName = deriveQuotaName(editingReservation?.title || '')

  const handleSave = async () => {
    setError(null)
    setIsSaving(true)

    const result = await handleReservationSave({
      editingReservation,
      cluster,
      namespace,
      title,
      description,
      gpuCount,
      gpuPreferences,
      startDate,
      durationHours,
      notes,
      enforceQuota,
      quotaName,
      originalQuotaName,
      gpuResourceKey,
      extraResources,
      isNewNamespace,
      maxGPUs,
      selectedClusterInfo,
      clusterGPUTypes,
      onSave,
      onActivate,
      onSaved,
      onError,
      t,
    })

    setIsSaving(false)

    if (result.success) {
      onClose()
    } else if (result.error) {
      setError(result.error)
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

          <BasicFormFields
            title={title}
            onTitleChange={setTitle}
            description={description}
            onDescriptionChange={setDescription}
            notes={notes}
            onNotesChange={setNotes}
            user={user}
          />

          <ClusterPicker
            cluster={cluster}
            onClusterChange={value => {
              setCluster(value)
              setNsField({ value: '', isNew: false })
              setGpuPreferences([])
            }}
            gpuClusters={gpuClusters}
            namespace={namespace}
            onNamespaceChange={(value, isNew) => {
              if (isNew) {
                setNsField({ value, isNew: true })
              } else {
                setNsField(prev => ({ ...prev, value }))
              }
            }}
            isNewNamespace={isNewNamespace}
            clusterNamespaces={clusterNamespaces}
            namespacesLoading={namespacesLoading}
            namespacesError={namespacesError}
            refetchNamespaces={refetchNamespaces}
            editingReservation={!!editingReservation}
          />

          <ResourceRequestFields
            gpuCount={gpuCount}
            onGpuCountChange={setGpuCount}
            gpuPreferences={gpuPreferences}
            onGpuPreferencesChange={setGpuPreferences}
            clusterGPUTypes={clusterGPUTypes}
            maxGPUs={maxGPUs}
            selectedClusterInfo={selectedClusterInfo}
            enforceQuota={enforceQuota}
            extraResources={extraResources}
            onExtraResourcesChange={setExtraResources}
          />

          <ScheduleSelector
            startDate={startDate}
            onStartDateChange={setStartDate}
            durationHours={durationHours}
            onDurationHoursChange={setDurationHours}
          />

          <ReservationPreview
            title={title}
            cluster={cluster}
            namespace={namespace}
            gpuCount={gpuCount}
            startDate={startDate}
            durationHours={durationHours}
            enforceQuota={enforceQuota}
            quotaName={quotaName}
            gpuResourceKey={gpuResourceKey}
          />
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
